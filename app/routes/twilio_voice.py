import re
import json
import logging
import functools
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

from flask import Blueprint, request, Response, current_app, send_file
import requests as http_client
from twilio.twiml.voice_response import VoiceResponse
from twilio.request_validator import RequestValidator
from app.services.voice_service import VoiceService

logger = logging.getLogger(__name__)

twilio_voice_bp = Blueprint("twilio_voice", __name__)

_FALLBACK_MSG = (
    "क्षमा करें, मुझे अभी उत्तर देने में कठिनाई हो रही है।"
)
_ERROR_MSG = (
    "क्षमा करें, एक तकनीकी समस्या आ गई है। क्या आप अपनी बात दोहरा सकते हैं?"
)
_REPEAT_FALLBACK_MSG = (
    "क्षमा करें, मैं आपकी बात नहीं सुन पाया। कृपया बीप के बाद फिर से बोलें।"
)
_MIN_RECORDING_BYTES = 1024

# Twilio RecordingSid always starts with RE followed by 32 hex chars.
_RECORDING_SID_RE = re.compile(r"^RE[0-9A-Fa-f]{32}$")

# uuid4().hex produces exactly 32 lowercase hex chars; only accept that shape.
_SAFE_AUDIO_RE = re.compile(r"^[0-9a-f]{32}\.mp3$")


def _validate_twilio(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if current_app.debug:
            logger.warning("Twilio signature validation is DISABLED (debug mode)")
            return fn(*args, **kwargs)

        auth_token = current_app.config.get("TWILIO_AUTH_TOKEN", "")
        validator = RequestValidator(auth_token)
        url = request.url
        post_data = request.form.to_dict()
        signature = request.headers.get("X-Twilio-Signature", "")

        if not validator.validate(url, post_data, signature):
            logger.warning("Invalid Twilio signature from %s", request.remote_addr)
            return Response("Forbidden", status=403)

        return fn(*args, **kwargs)

    return wrapper


def _public_base_url() -> str:
    """Return a publicly reachable base URL for Twilio callbacks/media fetches."""
    configured = (current_app.config.get("PUBLIC_BASE_URL") or "").strip()
    if configured:
        return configured.rstrip("/")
    return request.host_url.rstrip("/")


def _normalize_phone(value: str) -> str:
    """Normalize a phone string to +<digits> format for stable map lookups."""
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    if not digits:
        return ""
    return f"+{digits}"


def _load_kb_map(config_key: str) -> dict[str, str]:
    """
    Parse JSON object map from config, e.g.:
    {"+14155550123":"<kb_uuid>", "ACxxxx":"<kb_uuid>"}
    """
    raw = (current_app.config.get(config_key) or "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("Invalid JSON in %s", config_key)
        return {}
    if not isinstance(parsed, dict):
        logger.error("%s must be a JSON object map", config_key)
        return {}
    return {str(k).strip(): str(v).strip() for k, v in parsed.items() if str(v).strip()}


def _resolve_kb_id() -> str:
    """Resolve tenant KB by query param, then Lead/Campaign lookup, then fallback to user's first KB."""
    # 1. Check explicit query param (passed by our outbound dialer)
    explicit_kb = request.args.get("kb_id", "").strip()
    if explicit_kb:
        return explicit_kb

    # 2. Check database by CallSid (Auto-detect from Campaign)
    call_sid = request.form.get("CallSid", "").strip()
    if call_sid:
        try:
            from app.models import db
            from app.models.lead import Lead
            from app.models.campaign import Campaign
            lead = Lead.query.filter_by(call_sid=call_sid).first()
            if lead and lead.campaign_id:
                campaign = db.session.get(Campaign, lead.campaign_id)
                if campaign and campaign.knowledge_base_id:
                    logger.info("Auto-detected KB %s from campaign %s", campaign.knowledge_base_id, campaign.id)
                    return str(campaign.knowledge_base_id)
        except Exception:
            logger.exception("Failed to auto-detect KB from CallSid")

    # 3. Fallback to Tenant Map (Legacy/Inbound)
    by_number = _load_kb_map("TWILIO_TENANT_KB_BY_NUMBER")
    by_account = _load_kb_map("TWILIO_TENANT_KB_BY_ACCOUNT")

    to_number = _normalize_phone(request.form.get("To", ""))
    account_sid = request.form.get("AccountSid", "").strip()

    if to_number and to_number in by_number:
        return by_number[to_number]
    if account_sid and account_sid in by_account:
        return by_account[account_sid]

    # 4. Global Default from .env
    default_kb = (current_app.config.get("TWILIO_DEFAULT_KB_ID", "") or "").strip()
    if default_kb and default_kb != "your-knowledge-base-uuid-here":
        return default_kb

    # 5. Ultimate Fallback: Use the user's first available Knowledge Base
    try:
        from app.models.knowledge_base import KnowledgeBase
        kb = KnowledgeBase.query.order_by(KnowledgeBase.created_at.desc()).first()
        if kb:
            logger.info("Fallback: Auto-using most recent KB %s", kb.id)
            return str(kb.id)
    except Exception:
        pass

    return ""


def _is_kb_available_for_voice(kb_id: str) -> bool:
    """
    Validate KB existence and tenant subscription status before using it in voice flow.
    """
    if not kb_id:
        return False

    if current_app.debug:
        return True

    try:
        import uuid
        from app.models.knowledge_base import KnowledgeBase
        from app.models.subscription import Subscription

        kb_uuid = uuid.UUID(str(kb_id))
        kb = KnowledgeBase.query.get(kb_uuid)
        if not kb:
            logger.warning("Configured KB does not exist: %s", kb_id)
            return False

        subscription = Subscription.query.filter_by(user_id=kb.user_id).first()
        if not subscription:
            # Allow trial/dev if no subscription record found yet
            return True

        now = datetime.now(timezone.utc)
        status = (subscription.status or "").strip().lower()
        
        # More lenient check for active status
        if status == "active":
            if (subscription.current_period_start and subscription.current_period_start > now) or \
               (subscription.current_period_end and subscription.current_period_end < now):
                logger.warning("Subscription outside of time window. kb_id=%s", kb_id)
                return False
            return True
            
        return False
    except Exception:
        logger.exception("Failed validating KB subscription for kb_id=%s", kb_id)
        # If DB fails, we still want to try to answer the call in many cases
        return True


def _get_context(speech_text: str, kb_id: str) -> str:
    """Fetch raw relevant context chunks from the Knowledge Base (no LLM call)."""
    if not kb_id:
        logger.error("No KB configured for this tenant/call")
        return ""

    try:
        from app.services.embedding_service import EmbeddingService
        chunks = EmbeddingService.similarity_search(kb_id, speech_text, k=3)
        if not chunks:
            return ""
        
        context_parts = []
        for c in chunks:
            context_parts.append(f"--- Document: {c.get('filename', 'Unknown')} ---\n{c.get('text', '')}")
        
        return "\n\n".join(context_parts)
    except Exception:
        logger.exception("Failed to retrieve context for query: %.50s", speech_text)
        return ""


def _parse_script_config(raw_content: Optional[str]) -> dict[str, Any]:
    content = (raw_content or "").strip()
    if not content:
        return {}
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    return {}


def _get_campaign_and_script_config(call_sid: Optional[str]) -> tuple[Optional[Any], dict[str, Any]]:
    if not call_sid:
        return None, {}
    try:
        from app.models.lead import Lead
        from app.models.campaign import Campaign

        lead = Lead.query.filter_by(call_sid=call_sid).first()
        if not lead:
            return None, {}
        campaign = Campaign.query.get(lead.campaign_id)
        if not campaign:
            return None, {}
        script = getattr(campaign, "script", None)
        return campaign, _parse_script_config(getattr(script, "content", None))
    except Exception:
        logger.exception("Failed to load campaign/script config for call_sid=%s", call_sid)
        return None, {}


def _conversation_to_plain_text(conversation: list[dict[str, Any]]) -> str:
    lines = []
    for turn in conversation or []:
        role = str(turn.get("role") or "unknown").strip()
        text = str(turn.get("text") or "").strip()
        if text:
            lines.append(f"{role}: {text}")
    return "\n".join(lines).strip()


def _save_tags_and_forwarding(call_sid: Optional[str], tags: dict[str, Any], is_forwarded: bool) -> None:
    if not call_sid:
        return
    try:
        from app.models import db
        from app.models.call_log import CallLog
        from sqlalchemy.orm.attributes import flag_modified

        log = CallLog.query.filter_by(call_sid=call_sid).first()
        if not log:
            return
        merged_tags = dict(log.tags or {})
        merged_tags.update(tags or {})
        log.tags = merged_tags
        log.is_forwarded = bool(is_forwarded)
        flag_modified(log, "tags")
        db.session.commit()
    except Exception:
        logger.exception("Failed to update tags/forwarding for call_sid=%s", call_sid)


def _log_voice_call_event(
    kb_id: str,
    phone_number: str,
    status: str,
    duration_seconds: int,
    call_sid: Optional[str] = None,
) -> None:
    """Persist or update a call-log row for SaaS dashboard visibility."""
    if not kb_id:
        return
    try:
        import uuid
        from app.models import db
        from app.models.call_log import CallLog
        from app.models.knowledge_base import KnowledgeBase

        kb_uuid = uuid.UUID(str(kb_id))
        kb = KnowledgeBase.query.filter_by(id=kb_uuid).first()
        if not kb:
            return

        # Also update lead status if this call was part of a campaign
        if not call_sid:
            try:
                call_sid = request.form.get("CallSid", "").strip() or None
            except RuntimeError:
                call_sid = None

        campaign_id = None
        if call_sid:
            from app.models.lead import Lead
            lead = Lead.query.filter_by(call_sid=call_sid).first()
            if lead:
                campaign_id = lead.campaign_id
                _update_lead_status_obj(lead, status)

        # Try to update an existing row for this call_sid first
        existing = CallLog.query.filter_by(call_sid=call_sid).first() if call_sid else None
        if existing:
            existing.status = status
            existing.duration_seconds = max(int(duration_seconds or 0), 0)
            db.session.commit()
            return

        call_log = CallLog(
            user_id=kb.user_id,
            campaign_id=campaign_id,
            call_sid=call_sid,
            phone_number=phone_number or "unknown",
            status=status,
            duration_seconds=max(int(duration_seconds or 0), 0),
        )
        db.session.add(call_log)
        db.session.commit()
    except Exception:
        logger.exception("Failed to persist call log for kb_id=%s", kb_id)


def _save_conversation_turn(
    call_sid: Optional[str],
    kb_id: str,
    phone_number: str,
    customer_text: Optional[str],
    ai_text: Optional[str],
    status: str = "in_progress",
    duration_seconds: int = 0,
) -> None:
    """
    Append one conversation turn {customer, ai} to the CallLog row for this call_sid.
    Creates the row if it doesn't exist yet.
    Each turn stores: [{role, text, ts}, ...] in the `conversation` JSON column.
    """
    if not kb_id:
        return
    try:
        import uuid
        from app.models import db
        from app.models.call_log import CallLog
        from app.models.knowledge_base import KnowledgeBase

        kb_uuid = uuid.UUID(str(kb_id))
        kb = KnowledgeBase.query.filter_by(id=kb_uuid).first()
        if not kb:
            return

        now_ts = datetime.now(timezone.utc).isoformat()
        new_turns = []
        if customer_text and customer_text.strip():
            new_turns.append({"role": "customer", "text": customer_text.strip(), "ts": now_ts})
        if ai_text and ai_text.strip():
            new_turns.append({"role": "ai", "text": ai_text.strip(), "ts": now_ts})

        if not new_turns:
            return

        campaign_id = None
        if call_sid:
            from app.models.lead import Lead
            lead = Lead.query.filter_by(call_sid=call_sid).first()
            if lead:
                campaign_id = lead.campaign_id

        existing = CallLog.query.filter_by(call_sid=call_sid).first() if call_sid else None
        if existing:
            # Append new turns to the existing conversation list
            current = list(existing.conversation or [])
            current.extend(new_turns)
            existing.conversation = current
            existing.status = status
            existing.duration_seconds = max(
                int(duration_seconds or 0), existing.duration_seconds
            )
            # SQLAlchemy won't detect in-place mutation of JSON; reassign explicitly
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(existing, "conversation")
            db.session.commit()
        else:
            # First turn for this call — create the row
            call_log = CallLog(
                user_id=kb.user_id,
                campaign_id=campaign_id,
                call_sid=call_sid,
                phone_number=phone_number or "unknown",
                status=status,
                duration_seconds=max(int(duration_seconds or 0), 0),
                conversation=new_turns,
            )
            db.session.add(call_log)
            db.session.commit()
            logger.info("Created CallLog row for call_sid=%s", call_sid)
    except Exception:
        logger.exception("Failed to save conversation turn for call_sid=%s", call_sid)


def _update_lead_status_obj(lead, status: str) -> None:
    """Update a Lead record object."""
    try:
        from app.models import db
        from app.models.campaign import Campaign
        retry_match = re.search(r"retry_attempts=(\d+)", lead.error_message or "")
        prior_attempts = int(retry_match.group(1)) if retry_match else 0

        if status == "completed":
            lead.status = "completed"
            lead.error_message = None
        else:
            campaign = db.session.get(Campaign, lead.campaign_id) if lead.campaign_id else None
            retry_limit = max(int(getattr(campaign, "retry_attempts", 0) or 0), 0)
            attempts = prior_attempts + 1
            if attempts <= retry_limit:
                lead.status = "pending"
                lead.error_message = f"retry_attempts={attempts}; last_error=Call status: {status}"
            else:
                lead.status = "failed"
                lead.error_message = f"retry_attempts={attempts}; final_error=Call status: {status}"
        db.session.commit()
        logger.info("Lead %s updated to '%s'", lead.id, lead.status)
    except Exception:
        logger.exception("Failed to update lead object %s", getattr(lead, 'id', 'unknown'))


def _update_lead_status_by_sid(call_sid: str, status: str) -> None:
    """Update a Lead record based on Twilio CallSid."""
    if not call_sid:
        return
    try:
        from app.models.lead import Lead
        lead = Lead.query.filter_by(call_sid=call_sid).first()
        if lead:
            _update_lead_status_obj(lead, status)
    except Exception:
        logger.exception("Failed to update lead for call_sid=%s", call_sid)


def _tts_url(text: str, voice_id: Optional[str] = None, language: Optional[str] = None, gender: Optional[str] = None) -> Optional[str]:
    """Generate a TTS MP3 for text and return its public URL."""
    try:
        from app.services.tts_service import TTSService

        audio_path = TTSService.generate_audio(text, voice_id=voice_id, language=language, gender=gender)
        filename = Path(audio_path).name
        return f"{_public_base_url()}/voice/audio/{filename}"
    except Exception:
        logger.exception("TTS generation failed for: %.50s", text)
        return None


def _append_record_step(response: VoiceResponse, prompt: Optional[str] = None, kb_id: Optional[str] = None, voice_id: Optional[str] = None, language: Optional[str] = None, gender: Optional[str] = None) -> None:
    """Append optional prompt playback and then start recording."""
    if prompt:
        audio_url = _tts_url(prompt, voice_id=voice_id, language=language, gender=gender)
        if audio_url:
            response.play(audio_url)
        else:
            response.say(prompt, voice="alice", language="hi-IN")

    action_url = f"{_public_base_url()}/process-recording"
    if kb_id:
        action_url += f"?kb_id={kb_id}"

    response.record(
        action=action_url,
        method="POST",
        play_beep=True,
        timeout=4,
        max_length=60,
        trim="trim-silence",
    )


def _repeat_prompt_twiml(kb_id: Optional[str] = None) -> VoiceResponse:
    twiml = VoiceResponse()
    _append_record_step(twiml, prompt=_REPEAT_FALLBACK_MSG, kb_id=kb_id)
    return twiml

def _unavailable_and_hangup_twiml() -> VoiceResponse:
    twiml = VoiceResponse()
    twiml.say(
        "यह एआई वॉइस सेवा अभी आपके खाते के लिए उपलब्ध नहीं है। कृपया सपोर्ट से संपर्क करें।",
        voice="alice",
        language="hi-IN",
    )
    twiml.hangup()
    return twiml


def _is_valid_twilio_url(url: str) -> bool:
    """Accept only HTTPS URLs under *.twilio.com to prevent SSRF."""
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    return (
        parsed.scheme == "https"
        and parsed.hostname is not None
        and parsed.hostname.endswith(".twilio.com")
    )


def _build_wav_url(recording_url: str) -> str:
    """Return the URL with exactly one .wav suffix."""
    base = recording_url.rstrip("/")
    return base if base.endswith(".wav") else base + ".wav"


def _download_recording(recording_url: str, dest_path: Path) -> None:
    """
    Stream a Twilio recording to dest_path using Basic Auth.
    Uses a context manager so the connection is always released.
    Raises requests.HTTPError on a non-2xx response.
    """
    account_sid = current_app.config.get("TWILIO_ACCOUNT_SID", "")
    auth_token = current_app.config.get("TWILIO_AUTH_TOKEN", "")
    wav_url = _build_wav_url(recording_url)

    with http_client.get(
        wav_url,
        auth=(account_sid, auth_token),
        timeout=30,
        stream=True,
    ) as resp:
        resp.raise_for_status()
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        with dest_path.open("wb") as fh:
            for chunk in resp.iter_content(chunk_size=8192):
                fh.write(chunk)


@twilio_voice_bp.post("/voice")
@_validate_twilio
def voice() -> Response:
    kb_id = _resolve_kb_id()
    if not _is_kb_available_for_voice(kb_id):
        return Response(str(_unavailable_and_hangup_twiml()), mimetype="text/xml")

    twiml = VoiceResponse()
    _, script_config = _get_campaign_and_script_config(request.form.get("CallSid"))
    voice_id = str(script_config.get("voice_id") or "").strip() or None
    primary_lang = script_config.get("primary_language", "Hindi")
    gender = script_config.get("voice_style", "female")
    
    welcome_msg = script_config.get("welcome_message")
    if not welcome_msg:
        if primary_lang.upper() == "HINDI":
            welcome_msg = "नमस्ते, मैं आपका एआई वॉइस सहायक हूँ। कृपया बीप के बाद बोलिए।"
        else:
            welcome_msg = "Hello, I am your AI voice assistant. Please speak after the beep."

    _append_record_step(
        twiml,
        prompt=welcome_msg,
        kb_id=kb_id,
        voice_id=voice_id,
        language=primary_lang,
        gender=gender
    )
    return Response(str(twiml), mimetype="text/xml")


@twilio_voice_bp.post("/voice/gather")
@_validate_twilio
def gather() -> Response:
    # Backward compatibility for older Twilio configs.
    kb_id = _resolve_kb_id()
    if not _is_kb_available_for_voice(kb_id):
        return Response(str(_unavailable_and_hangup_twiml()), mimetype="text/xml")

    twiml = VoiceResponse()
    _append_record_step(twiml, prompt="कृपया बीप की आवाज़ के बाद बोलिए।", kb_id=kb_id)
    return Response(str(twiml), mimetype="text/xml")


@twilio_voice_bp.post("/process-recording")
@_validate_twilio
def process_recording() -> Response:
    """
    Twilio posts here after a recording completes.
    1) Download recording
    2) STT
    3) AI response
    4) TTS
    5) Play MP3 back to caller
    Then start recording again for loop conversation.
    """
    recording_url = request.form.get("RecordingUrl", "").strip()
    recording_sid = request.form.get("RecordingSid", "").strip()
    call_sid = request.form.get("CallSid", "").strip() or None
    
    direction = request.form.get("Direction", "")
    if "outbound" in direction.lower():
        caller_number = (request.form.get("To", "") or "").strip()
    else:
        caller_number = (request.form.get("From", "") or "").strip()

    try:
        recording_duration = int((request.form.get("RecordingDuration", "0") or "0").strip())
    except ValueError:
        recording_duration = 0
    kb_id = _resolve_kb_id()
    campaign, script_config = _get_campaign_and_script_config(call_sid)
    logger.info(
        "VOICE_PIPELINE_START call_sid=%s recording_sid=%s to=%s",
        call_sid,
        recording_sid,
        request.form.get("To", ""),
    )

    if not recording_url:
        logger.warning("process-recording called without RecordingUrl")
        _log_voice_call_event(kb_id, caller_number, "failed", recording_duration)
        return Response(str(_repeat_prompt_twiml(kb_id=kb_id)), mimetype="text/xml")

    if not _is_kb_available_for_voice(kb_id):
        logger.warning("No valid tenant KB available for voice call_sid=%s", call_sid)
        _log_voice_call_event(kb_id, caller_number, "failed", recording_duration)
        return Response(str(_unavailable_and_hangup_twiml()), mimetype="text/xml")

    if not _RECORDING_SID_RE.match(recording_sid):
        logger.warning("Invalid or missing RecordingSid: %r", recording_sid)
        _log_voice_call_event(kb_id, caller_number, "failed", recording_duration)
        return Response(str(_repeat_prompt_twiml(kb_id=kb_id)), mimetype="text/xml")

    if not _is_valid_twilio_url(recording_url):
        logger.error("Rejected suspicious RecordingUrl: %r", recording_url)
        _log_voice_call_event(kb_id, caller_number, "failed", recording_duration)
        return Response(str(_repeat_prompt_twiml(kb_id=kb_id)), mimetype="text/xml")

    recordings_dir = Path(current_app.config.get("RECORDINGS_DIR", "./recordings")).resolve()
    dest_path = (recordings_dir / f"{recording_sid}.wav").resolve()

    if not dest_path.is_relative_to(recordings_dir):
        logger.error("Path traversal blocked for RecordingSid: %r", recording_sid)
        _log_voice_call_event(kb_id, caller_number, "failed", recording_duration)
        return Response(str(_repeat_prompt_twiml(kb_id=kb_id)), mimetype="text/xml")

    try:
        logger.info("STEP_1_DOWNLOAD_START call_sid=%s", call_sid)
        _download_recording(recording_url, dest_path)
        logger.info("STEP_1_DOWNLOAD_OK call_sid=%s path=%s", call_sid, dest_path)
    except http_client.exceptions.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else "unknown"
        logger.error("Failed to download recording %s: HTTP %s", recording_sid, status)
        _log_voice_call_event(kb_id, caller_number, "failed", recording_duration)
        return Response(str(_repeat_prompt_twiml(kb_id=kb_id)), mimetype="text/xml")
    except Exception:
        logger.exception("Unexpected error downloading recording %s", recording_sid)
        _log_voice_call_event(kb_id, caller_number, "failed", recording_duration)
        return Response(str(_repeat_prompt_twiml(kb_id=kb_id)), mimetype="text/xml")

    try:
        file_size = dest_path.stat().st_size
    except Exception:
        file_size = 0
    if file_size < _MIN_RECORDING_BYTES:
        logger.warning(
            "Empty/short recording detected call_sid=%s size=%s bytes",
            call_sid,
            file_size,
        )
        _log_voice_call_event(kb_id, caller_number, "failed", recording_duration)
        return Response(str(_repeat_prompt_twiml(kb_id=kb_id)), mimetype="text/xml")

    transcription = None
    transcription_failed = False
    try:
        logger.info("STEP_2_STT_START call_sid=%s", call_sid)
        from app.services.stt_service import STTService
        
        primary_lang = script_config.get("primary_language", "Hindi")
        transcription = STTService.transcribe_file(dest_path, language=primary_lang)
        logger.info("STEP_2_STT_OK call_sid=%s text=%.200s", call_sid, transcription)
    except Exception:
        logger.exception("Transcription failed for recording %s", recording_sid)
        transcription_failed = True

    if not transcription or not transcription.strip():
        logger.warning("STEP_2_STT_EMPTY call_sid=%s", call_sid)
        transcription_failed = True

    ai_reply = None
    if transcription:
        logger.info("STEP_3_GET_CONTEXT call_sid=%s kb_id=%s", call_sid, kb_id)
        raw_context = _get_context(transcription, kb_id)

        try:
            logger.info("STEP_4_AI_GENERATE call_sid=%s", call_sid)
            primary_lang = script_config.get("primary_language", "English")
            secondary_lang = script_config.get("secondary_language")
            
            from app.services.ai_service import AIService
            script_prompt = str(script_config.get("prompt") or "").strip() or None
            ai_reply = AIService.generate_reply(
                user_text=transcription,
                conversation_id=call_sid,
                knowledge_context=raw_context,
                primary_language=primary_lang,
                secondary_language=secondary_lang,
                script_prompt=script_prompt,
            )
            logger.info("STEP_4_AI_OK call_sid=%s", call_sid)
        except Exception:
            logger.exception("AI reply generation failed for call %s", call_sid)
            # Hindi fallback message
            ai_reply = "क्षमा करें, मुझे अभी उत्तर देने में कठिनाई हो रही है।"

    twiml = VoiceResponse()
    transcript_analysis = {"tags": {}, "should_handoff": False, "handoff_reason": ""}
    voice_id = str(script_config.get("voice_id") or "").strip() or None
    primary_lang = script_config.get("primary_language", "Hindi")
    gender = script_config.get("voice_style", "female")
    
    if ai_reply:
        logger.info("STEP_5_TTS_PLAY_START call_sid=%s", call_sid)
        audio_url = _tts_url(ai_reply, voice_id=voice_id, language=primary_lang, gender=gender)
        if audio_url:
            twiml.play(audio_url)
            logger.info("STEP_5_TTS_PLAY_OK call_sid=%s url=%s", call_sid, audio_url)
        else:
            twiml.say(ai_reply, voice="alice", language="hi-IN")
            logger.warning("STEP_5_TTS_PLAY_FALLBACK_SAY call_sid=%s", call_sid)
        _append_record_step(twiml, kb_id=kb_id, voice_id=voice_id, language=primary_lang, gender=gender)
        # ── Save this turn's transcript ──────────────────────────────────────
        _save_conversation_turn(
            call_sid=call_sid,
            kb_id=kb_id,
            phone_number=caller_number,
            customer_text=transcription,
            ai_text=ai_reply,
            status="in_progress",
            duration_seconds=recording_duration,
        )
        logger.info("STEP_6_TRANSCRIPT_SAVED call_sid=%s", call_sid)
        try:
            from app.services.ai_service import AIService
            transcript_analysis = AIService.analyze_transcript_for_tags(
                transcript=transcription,
                script_config=script_config,
            )
        except Exception:
            logger.exception("Transcript tagging failed for call_sid=%s", call_sid)
    elif transcription_failed:
        _append_record_step(twiml, prompt=_REPEAT_FALLBACK_MSG, kb_id=kb_id, voice_id=voice_id, language=primary_lang, gender=gender)
        # Still save what we captured (empty ai side) so the row exists
        _save_conversation_turn(
            call_sid=call_sid,
            kb_id=kb_id,
            phone_number=caller_number,
            customer_text=transcription,
            ai_text=None,
            status="in_progress",
            duration_seconds=recording_duration,
        )
    else:
        _append_record_step(twiml, prompt=_REPEAT_FALLBACK_MSG, kb_id=kb_id, voice_id=voice_id, language=primary_lang, gender=gender)
        _save_conversation_turn(
            call_sid=call_sid,
            kb_id=kb_id,
            phone_number=caller_number,
            customer_text=transcription,
            ai_text=None,
            status="in_progress",
            duration_seconds=recording_duration,
        )

    handoff_number = str(script_config.get("handoff_number") or "").strip()
    should_handoff = bool(transcript_analysis.get("should_handoff")) and bool(handoff_number)
    _save_tags_and_forwarding(
        call_sid=call_sid,
        tags=transcript_analysis.get("tags") or {},
        is_forwarded=should_handoff,
    )
    if should_handoff:
        logger.info("HANDOFF_TRIGGERED call_sid=%s number=%s", call_sid, handoff_number)
        handoff_preface = "मैं आपको हमारे मानव विशेषज्ञ से जोड़ रहा हूँ। कृपया लाइन पर रहें।"
        return Response(
            VoiceService.build_handoff_twiml(handoff_number=handoff_number, preface=handoff_preface),
            mimetype="text/xml",
        )

    logger.info("VOICE_PIPELINE_END call_sid=%s", call_sid)

    return Response(str(twiml), mimetype="text/xml")


@twilio_voice_bp.get("/voice/audio/<filename>")
def serve_tts_audio(filename: str) -> Response:
    """Serve a generated TTS audio file to Twilio's <Play> verb."""
    if not _SAFE_AUDIO_RE.match(filename):
        return Response("Not found", status=404)

    tts_dir = Path(current_app.config.get("TTS_AUDIO_DIR", "./tts_audio")).resolve()
    file_path = (tts_dir / filename).resolve()

    if not file_path.is_relative_to(tts_dir) or not file_path.is_file():
        return Response("Not found", status=404)

    return send_file(file_path, mimetype="audio/mpeg")


@twilio_voice_bp.post("/voice/status-callback")
@_validate_twilio
def voice_status_callback() -> Response:
    """
    Twilio posts here when the call ends.
    We use this to mark leads as completed/failed even if the AI pipeline didn't finish.
    """
    call_sid = request.form.get("CallSid", "").strip()
    status = request.form.get("CallStatus", "").strip().lower()
    duration = request.form.get("CallDuration", "0").strip()
    kb_id = _resolve_kb_id()
    
    direction = request.form.get("Direction", "")
    if "outbound" in direction.lower():
        phone = (request.form.get("To", "") or "").strip()
    else:
        phone = (request.form.get("From", "") or "").strip()

    logger.info("VOICE_STATUS_CALLBACK call_sid=%s status=%s duration=%s", call_sid, status, duration)

    # Convert Twilio status to our internal status
    internal_status = "completed" if status == "completed" else "failed"

    # Update the final status + duration on the existing CallLog row (created during process_recording)
    # If no row exists yet (e.g. call was never answered), _log_voice_call_event creates it.
    _log_voice_call_event(
        kb_id=kb_id,
        phone_number=phone,
        status=internal_status,
        duration_seconds=int(duration) if duration.isdigit() else 0,
        call_sid=call_sid or None,
    )

    # Final transcript-level lead tagging on call completion.
    if call_sid:
        try:
            from app.models.call_log import CallLog
            from app.services.ai_service import AIService

            call_log = CallLog.query.filter_by(call_sid=call_sid).first()
            if call_log:
                _, script_config = _get_campaign_and_script_config(call_sid)
                transcript_text = _conversation_to_plain_text(call_log.conversation or [])
                analysis = AIService.analyze_transcript_for_tags(
                    transcript=transcript_text,
                    script_config=script_config,
                )
                _save_tags_and_forwarding(
                    call_sid=call_sid,
                    tags=analysis.get("tags") or {},
                    is_forwarded=bool(call_log.is_forwarded),
                )
        except Exception:
            logger.exception("Post-call transcript tagging failed for call_sid=%s", call_sid)

    return Response("", status=200)
