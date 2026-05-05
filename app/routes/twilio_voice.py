import re
import json
import logging
import functools
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from flask import Blueprint, request, Response, current_app, send_file
import requests as http_client
from twilio.twiml.voice_response import VoiceResponse
from twilio.request_validator import RequestValidator

logger = logging.getLogger(__name__)

twilio_voice_bp = Blueprint("twilio_voice", __name__)

_FALLBACK_MSG = (
    "????? ?????, ???? ??? ?????? ??????? ??? ???? ????? ???? ?????"
)
_ERROR_MSG = (
    "????? ?????, ??? ?????? ?????? ?? ???? ??? ????? ???? ?? ?? ??? ???? ????? ????? ??? ??? ??? ????? ?????"
)
_REPEAT_FALLBACK_MSG = (
    "????? ?????, ??? ???? ??? ??? ???? ????? ????? ?????? ?????? ??? ?? ??????"
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
    """Resolve tenant KB by query param, then To-number, then AccountSid, then default."""
    explicit_kb = request.args.get("kb_id", "").strip()
    if explicit_kb:
        return explicit_kb

    by_number = _load_kb_map("TWILIO_TENANT_KB_BY_NUMBER")
    by_account = _load_kb_map("TWILIO_TENANT_KB_BY_ACCOUNT")

    to_number = _normalize_phone(request.form.get("To", ""))
    account_sid = request.form.get("AccountSid", "").strip()

    if to_number and to_number in by_number:
        return by_number[to_number]
    if account_sid and account_sid in by_account:
        return by_account[account_sid]

    require_match = bool(current_app.config.get("TWILIO_REQUIRE_TENANT_MATCH", False))
    if require_match and (by_number or by_account):
        logger.warning(
            "Tenant routing required but no mapping matched. to=%s account_sid=%s",
            to_number,
            account_sid,
        )
        return ""
    return (current_app.config.get("TWILIO_DEFAULT_KB_ID", "") or "").strip()


def _is_kb_available_for_voice(kb_id: str) -> bool:
    """
    Validate KB existence and tenant subscription status before using it in voice flow.
    """
    if not kb_id:
        return False

    try:
        import uuid
        from app.models.knowledge_base import KnowledgeBase
        from app.models.subscription import Subscription

        kb_uuid = uuid.UUID(str(kb_id))
        kb = KnowledgeBase.query.filter_by(id=kb_uuid).first()
        if not kb:
            logger.warning("Configured KB does not exist: %s", kb_id)
            return False

        subscription = Subscription.query.filter_by(user_id=kb.user_id).first()
        if not subscription:
            logger.warning("No subscription found for KB owner. kb_id=%s", kb_id)
            return False

        now = datetime.now(timezone.utc)
        status = (subscription.status or "").strip().lower()
        if (
            status != "active"
            or subscription.current_period_start > now
            or subscription.current_period_end < now
        ):
            logger.warning(
                "Inactive/out-of-window subscription for KB owner. kb_id=%s status=%s period_start=%s period_end=%s",
                kb_id,
                subscription.status,
                subscription.current_period_start,
                subscription.current_period_end,
            )
            return False
        return True
    except Exception:
        logger.exception("Failed validating KB subscription for kb_id=%s", kb_id)
        return False


def _rag_answer(speech_text: str, kb_id: str) -> str:
    if not kb_id:
        logger.error("No KB configured for this tenant/call")
        return _FALLBACK_MSG

    try:
        from app.services.agent_service import AgentService

        result = AgentService.ask(kb_id, speech_text)
        return result.get("answer") or _FALLBACK_MSG
    except Exception:
        logger.exception("RAG pipeline failed for query: %.50s", speech_text)
        return _ERROR_MSG


def _log_voice_call_event(
    kb_id: str,
    phone_number: str,
    status: str,
    duration_seconds: int,
) -> None:
    """Persist a call-log row for SaaS dashboard visibility."""
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
        try:
            call_sid = request.form.get("CallSid", "").strip()
        except RuntimeError:
            call_sid = None

        campaign_id = None
        if call_sid:
            from app.models.lead import Lead
            lead = Lead.query.filter_by(call_sid=call_sid).first()
            if lead:
                campaign_id = lead.campaign_id
                _update_lead_status_obj(lead, status)

        call_log = CallLog(
            user_id=kb.user_id,
            campaign_id=campaign_id,
            phone_number=phone_number or "unknown",
            status=status,
            duration_seconds=max(int(duration_seconds or 0), 0),
        )
        db.session.add(call_log)
        db.session.commit()
    except Exception:
        logger.exception("Failed to persist call log for kb_id=%s", kb_id)


def _update_lead_status_obj(lead, status: str) -> None:
    """Update a Lead record object."""
    try:
        from app.models import db
        if status == "completed":
            lead.status = "completed"
        else:
            lead.status = "failed"
            lead.error_message = f"Call status: {status}"
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


def _tts_url(text: str) -> Optional[str]:
    """Generate a TTS MP3 for text and return its public URL."""
    try:
        from app.services.tts_service import TTSService

        audio_path = TTSService.generate_audio(text)
        filename = Path(audio_path).name
        return f"{_public_base_url()}/voice/audio/{filename}"
    except Exception:
        logger.exception("TTS generation failed for: %.50s", text)
        return None


def _append_record_step(response: VoiceResponse, prompt: Optional[str] = None, kb_id: Optional[str] = None) -> None:
    """Append optional prompt playback and then start recording."""
    if prompt:
        audio_url = _tts_url(prompt)
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
    _append_record_step(
        twiml,
        prompt="नमस्ते, मैं आपका एआई वॉइस सहायक हूँ। कृपया बीप के बाद बोलिए।",
        kb_id=kb_id,
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

        transcription = STTService.transcribe_file(dest_path)
        logger.info("STEP_2_STT_OK call_sid=%s text=%.200s", call_sid, transcription)
    except Exception:
        logger.exception("Transcription failed for recording %s", recording_sid)
        transcription_failed = True

    if not transcription or not transcription.strip():
        logger.warning("STEP_2_STT_EMPTY call_sid=%s", call_sid)
        transcription_failed = True

    ai_reply = None
    if transcription:
        logger.info("STEP_3_RAG_START call_sid=%s kb_id=%s", call_sid, kb_id)
        rag_answer = _rag_answer(transcription, kb_id)
        logger.info("STEP_3_RAG_OK call_sid=%s", call_sid)
        try:
            logger.info("STEP_4_AI_START call_sid=%s", call_sid)
            from app.services.ai_service import AIService
            ai_reply = AIService.generate_reply(
                user_text=transcription,
                conversation_id=call_sid,
                knowledge_context=rag_answer,
            )
            logger.info("STEP_4_AI_OK call_sid=%s", call_sid)
        except Exception:
            logger.exception("AI reply generation failed for call %s", call_sid)
            ai_reply = rag_answer

    twiml = VoiceResponse()
    if ai_reply:
        logger.info("STEP_5_TTS_PLAY_START call_sid=%s", call_sid)
        audio_url = _tts_url(ai_reply)
        if audio_url:
            twiml.play(audio_url)
            logger.info("STEP_5_TTS_PLAY_OK call_sid=%s url=%s", call_sid, audio_url)
        else:
            twiml.say(ai_reply, voice="alice", language="hi-IN")
            logger.warning("STEP_5_TTS_PLAY_FALLBACK_SAY call_sid=%s", call_sid)
        _append_record_step(twiml, kb_id=kb_id)
        _log_voice_call_event(kb_id, caller_number, "completed", recording_duration)
    elif transcription_failed:
        _append_record_step(twiml, prompt=_REPEAT_FALLBACK_MSG, kb_id=kb_id)
        _log_voice_call_event(kb_id, caller_number, "failed", recording_duration)
    else:
        _append_record_step(twiml, prompt=_REPEAT_FALLBACK_MSG, kb_id=kb_id)
        _log_voice_call_event(kb_id, caller_number, "failed", recording_duration)

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
    
    # This also handles lead status update
    _log_voice_call_event(
        kb_id=kb_id,
        phone_number=phone,
        status=internal_status,
        duration_seconds=int(duration) if duration.isdigit() else 0
    )

    return Response("", status=200)
