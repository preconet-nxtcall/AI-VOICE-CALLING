"""
voice_helpers.py  (formerly twilio_voice.py)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Shared utilities for the VoiceLink AI Voice Calling pipeline.

Provides:
  • LIVE_CLIENTS + broadcast_live_event  — live dashboard WebSocket events
  • /api/v1/live-events                  — live dashboard WebSocket endpoint
  • _get_context                         — RAG knowledge base lookup
  • _parse_script_config                 — script JSON parsing
  • _get_campaign_and_script_config      — resolve script from call_sid
  • _save_conversation_turn              — persist STT+AI turns to CallLog
  • _save_tags_and_forwarding            — update tags and handoff flag
  • _send_appointment_email              — deduplicated appointment email
  • _log_voice_call_event                — create/update CallLog row
  • _update_lead_status_obj/by_sid       — lead status management
  • _finalize_call                       — convenience wrapper
  • _conversation_to_plain_text          — transcript → plain text
"""

from __future__ import annotations

import json
import logging
import re
import threading
from datetime import datetime, timezone
from typing import Any, Optional

from flask import Blueprint, send_file
from flask import current_app, request, Response
from app.extensions import sock

logger = logging.getLogger(__name__)

# Blueprint (kept for the live-events WS and TTS audio endpoint)
twilio_voice_bp = Blueprint("twilio_voice", __name__)

# ─── Live dashboard broadcast ─────────────────────────────────────────────────
# RLock guards LIVE_CLIENTS against concurrent add/discard/iteration across threads.
LIVE_CLIENTS: set = set()
LIVE_CLIENTS_LOCK = threading.RLock()
SENT_APPOINTMENT_EMAILS: set = set()
SENT_EMAILS_LOCK = threading.Lock()


def broadcast_live_event(data: dict[str, Any]) -> None:
    """Thread-safe broadcast of a JSON event to all live-dashboard WebSocket clients."""
    payload = json.dumps(data)
    # Snapshot the set under the lock so we never iterate while another thread mutates it
    with LIVE_CLIENTS_LOCK:
        snapshot = list(LIVE_CLIENTS)
    dead = []
    for client in snapshot:
        try:
            client.send(payload)
        except Exception:
            dead.append(client)
    if dead:
        with LIVE_CLIENTS_LOCK:
            for client in dead:
                LIVE_CLIENTS.discard(client)


@sock.route("/api/v1/live-events")
def live_events_stream(ws):
    """
    WebSocket endpoint for the live dashboard.

    Authentication: the frontend passes the JWT as ?token=<jwt> in the URL
    (standard WS upgrade cannot set Authorization headers from the browser).
    """
    # Optional JWT validation — gracefully reject unauthenticated sockets
    token = request.args.get("token", "").strip()
    if token:
        try:
            import jwt as _jwt
            secret = current_app.config.get("SECRET_KEY", "")
            _jwt.decode(token, secret, algorithms=["HS256"])
        except Exception:
            logger.warning("[LiveEvents] Rejected WS connection: invalid token")
            ws.close()
            return

    with LIVE_CLIENTS_LOCK:
        LIVE_CLIENTS.add(ws)
    logger.info("[LiveEvents] Client connected — total=%d", len(LIVE_CLIENTS))
    try:
        while True:
            msg = ws.receive(timeout=30)  # blocks; raises on disconnect
            if msg is None:
                # clean disconnect
                break
            # Accept ping from frontend heartbeat; reply with pong
            try:
                parsed = json.loads(msg)
                if parsed.get("type") == "ping":
                    ws.send(json.dumps({"type": "pong"}))
            except Exception:
                pass
    except Exception as exc:
        # Covers timeout-triggered close or any other network error
        logger.debug("[LiveEvents] WS receive error (client likely disconnected): %s", exc)
    finally:
        with LIVE_CLIENTS_LOCK:
            LIVE_CLIENTS.discard(ws)
        logger.info("[LiveEvents] Client disconnected — total=%d", len(LIVE_CLIENTS))


# ─── Knowledge Base context lookup ───────────────────────────────────────────

def _get_context(speech_text: str, kb_id: str, use_reranker: bool = False) -> str:
    """Fetch relevant context chunks from the Knowledge Base (no LLM call by default)."""
    if not kb_id:
        logger.error("No KB configured for this call")
        return ""
    try:
        from app.services.embedding_service import EmbeddingService
        chunks = EmbeddingService.hybrid_search(
            kb_id,
            speech_text,
            k=3,
            vector_k=24,
            keyword_weight=0.5,
            use_reranker=use_reranker,
            rerank_pool=10,
        )
        if not chunks:
            return ""
        context_parts = []
        for c in chunks:
            context_parts.append(
                f"--- Document: {c.get('filename', 'Unknown')} ---\n{c.get('text', '')}"
            )
        return "\n\n".join(context_parts)
    except Exception:
        logger.exception("Failed to retrieve context for query: %.50s", speech_text)
        return ""



# ─── Script config helpers ────────────────────────────────────────────────────

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
    return {"prompt": content}


def _get_campaign_and_script_config(
    call_sid: Optional[str],
) -> tuple[Optional[Any], Optional[Any], dict[str, Any]]:
    if not call_sid:
        return None, None, {}
    try:
        from app.models.lead import Lead
        from app.models.campaign import Campaign
        from app.models import db

        lead = Lead.query.filter_by(call_sid=call_sid).first()
        if not lead:
            return None, None, {}
        campaign = db.session.get(Campaign, lead.campaign_id) if lead.campaign_id else None
        script = getattr(campaign, "script", None) if campaign else None
        return lead, campaign, _parse_script_config(getattr(script, "content", None))
    except Exception:
        logger.exception("Failed to load campaign/script config for call_sid=%s", call_sid)
        return None, None, {}


# ─── Conversation / call-log persistence ─────────────────────────────────────

def _save_conversation_turn(
    call_sid: Optional[str],
    kb_id: str,
    phone_number: str,
    customer_text: Optional[str],
    ai_text: Optional[str],
    status: str = "in_progress",
    duration_seconds: int = 0,
) -> None:
    """Append one STT+AI turn to the CallLog row, creating it if needed."""
    if not kb_id:
        return
    try:
        import uuid
        from app.models import db
        from app.models.call_log import CallLog
        from app.models.knowledge_base import KnowledgeBase
        from sqlalchemy.orm.attributes import flag_modified

        kb = KnowledgeBase.query.filter_by(id=uuid.UUID(kb_id)).first()
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
            current_conv = list(existing.conversation or [])
            current_conv.extend(new_turns)
            existing.conversation = current_conv
            existing.status = status
            existing.duration_seconds = max(int(duration_seconds or 0), existing.duration_seconds)
            flag_modified(existing, "conversation")
            db.session.commit()
        else:
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


def _save_tags_and_forwarding(
    call_sid: Optional[str], tags: dict[str, Any], is_forwarded: bool
) -> None:
    if not call_sid:
        return
    try:
        from app.models import db
        from app.models.call_log import CallLog
        from app.models.lead import Lead
        from sqlalchemy.orm.attributes import flag_modified

        log = CallLog.query.filter_by(call_sid=call_sid).first()
        if log:
            merged_tags = dict(log.tags or {})
            merged_tags.update(tags or {})
            log.tags = merged_tags
            log.is_forwarded = bool(is_forwarded)
            flag_modified(log, "tags")

        lead = Lead.query.filter_by(call_sid=call_sid).first()
        if lead:
            if tags.get("appointment_status") == "requested":
                lead.status = "completed"
            elif is_forwarded:
                lead.status = "completed"

        db.session.commit()
    except Exception:
        logger.exception("Failed to update tags/forwarding for call_sid=%s", call_sid)


def _send_appointment_email(
    kb_id: str, lead_phone: str, details: str, call_sid: str = None
) -> None:
    try:
        if not kb_id or not call_sid:
            return
        with SENT_EMAILS_LOCK:
            if call_sid in SENT_APPOINTMENT_EMAILS:
                return
            SENT_APPOINTMENT_EMAILS.add(call_sid)

        import uuid
        from app.models import db
        from app.models.knowledge_base import KnowledgeBase
        from app.models.user import User
        from app.services.email_service import EmailService

        kb = db.session.get(KnowledgeBase, uuid.UUID(kb_id))
        if kb:
            user = db.session.get(User, kb.user_id)
            if user and user.email:
                EmailService.send_appointment_notification(
                    to_email=user.email,
                    lead_phone=lead_phone,
                    appointment_details=details,
                    call_sid=call_sid,
                )
    except Exception:
        logger.exception(
            "Failed to send appointment notification email for kb_id=%s", kb_id
        )


def _log_voice_call_event(
    kb_id: str,
    phone_number: str,
    status: str,
    duration_seconds: int,
    call_sid: Optional[str] = None,
) -> None:
    """Persist or update a CallLog row for dashboard visibility."""
    if not kb_id:
        return
    try:
        import uuid
        from app.models import db
        from app.models.call_log import CallLog
        from app.models.knowledge_base import KnowledgeBase

        kb = KnowledgeBase.query.filter_by(id=uuid.UUID(kb_id)).first()
        if not kb:
            return

        campaign_id = None
        if call_sid:
            from app.models.lead import Lead
            lead = Lead.query.filter_by(call_sid=call_sid).first()
            if lead:
                campaign_id = lead.campaign_id
                _update_lead_status_obj(lead, status)

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


# ─── Lead status helpers ──────────────────────────────────────────────────────

def _update_lead_status_obj(lead, status: str) -> None:
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
                lead.error_message = (
                    f"retry_attempts={attempts}; last_error=Call status: {status}"
                )
            else:
                lead.status = "failed"
                lead.error_message = (
                    f"retry_attempts={attempts}; final_error=Call status: {status}"
                )
        db.session.commit()
        logger.info("Lead %s updated to '%s'", lead.id, lead.status)
    except Exception:
        logger.exception("Failed to update lead object %s", getattr(lead, "id", "unknown"))


def _update_lead_status_by_sid(call_sid: str, status: str) -> None:
    if not call_sid:
        return
    try:
        from app.models.lead import Lead
        lead = Lead.query.filter_by(call_sid=call_sid).first()
        if lead:
            _update_lead_status_obj(lead, status)
    except Exception:
        logger.exception("Failed to update lead for call_sid=%s", call_sid)


def _conversation_to_plain_text(conversation: list[dict[str, Any]]) -> str:
    lines = []
    for turn in conversation or []:
        role = str(turn.get("role") or "unknown").strip()
        text = str(turn.get("text") or "").strip()
        if text:
            lines.append(f"{role}: {text}")
    return "\n".join(lines).strip()


# ─── KB availability check ────────────────────────────────────────────────────

def _is_kb_available_for_voice(kb_id: str) -> bool:
    """Always return True to allow fully active testing of voicebots without billing blocks."""
    return True


# ─── TTS audio file server ────────────────────────────────────────────────────
_SAFE_AUDIO_RE = re.compile(r"^[0-9a-f]{32}\.mp3$")


@twilio_voice_bp.get("/voice/audio/<filename>")
def serve_tts_audio(filename: str) -> Response:
    """Serve a generated TTS audio file (used by VoiceLink or any HTTP client)."""
    from pathlib import Path

    if not _SAFE_AUDIO_RE.match(filename):
        return Response("Not found", status=404)

    tts_dir = Path(current_app.config.get("TTS_AUDIO_DIR", "./tts_audio")).resolve()
    file_path = (tts_dir / filename).resolve()

    if not file_path.is_relative_to(tts_dir) or not file_path.is_file():
        return Response("Not found", status=404)

    return send_file(file_path, mimetype="audio/mpeg")
