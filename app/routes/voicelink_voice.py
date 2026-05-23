"""
voicelink_voice.py
~~~~~~~~~~~~~~~~~~
VoiceLink telephony integration — AI Voice Calling system.

Endpoints:
  • /voice/voicelink-stream          — WebSocket bidirectional media stream
  • /voice/voicelink-status-callback — HTTP webhook for call lifecycle events

Audio:
  VoiceLink sends G.711 A-law (8 kHz mono) encoded as base64.
  We use Python's built-in `audioop` to transcode:
    alaw  →  PCM 16-bit  (for Whisper STT)
    PCM 16-bit  →  alaw  (send TTS audio back)
"""

from __future__ import annotations

import audioop
import base64
import json
import logging
import queue
import tempfile
import threading
import time
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from flask import Blueprint, jsonify, request
from app.extensions import sock

# Shared voice utilities (live-events, DB helpers, RAG context)
from app.routes.twilio_voice import (
    broadcast_live_event,
    _get_context,
    _get_campaign_and_script_config,
    _save_conversation_turn,
    _save_tags_and_forwarding,
    _send_appointment_email,
    _log_voice_call_event,
    _update_lead_status_obj,
)

logger = logging.getLogger(__name__)

voicelink_voice_bp = Blueprint("voicelink_voice", __name__)

# ─── Audio constants ──────────────────────────────────────────────────────────
_SAMPLE_RATE = 8000        # VoiceLink streams 8 kHz
_SILENCE_RMS = 300         # RMS below this = silence (lowered for better sensitivity)
_END_SILENCE_MS = 800      # trailing silence to end utterance (slightly more patient)
_MIN_UTTERANCE_MS = 400    # minimum utterance duration to process (lowered to catch short replies)
_PCM_SAMPLE_WIDTH = 2      # bytes per sample (16-bit PCM)

_log_lock = threading.Lock()

def _log_ws_event(message: str) -> None:
    """Thread-safe persistent file-based logging for VoiceLink events."""
    timestamp = datetime.now(timezone.utc).isoformat()
    log_line = f"[{timestamp}] {message}\n"
    paths_to_try = [Path("/data/voicelink_ws.log"), Path("./voicelink_ws.log")]
    with _log_lock:
        for path in paths_to_try:
            try:
                path.parent.mkdir(parents=True, exist_ok=True)
                with open(path, "a", encoding="utf-8") as f:
                    f.write(log_line)
                break
            except Exception:
                continue



# ─── G.711 A-law ↔ PCM 16-bit helpers ────────────────────────────────────────

def _alaw2lin(data: bytes) -> bytes:
    """Decode G.711 A-law bytes to 16-bit signed linear PCM."""
    return audioop.alaw2lin(data, _PCM_SAMPLE_WIDTH)


def _lin2alaw(data: bytes) -> bytes:
    """Encode 16-bit signed linear PCM to G.711 A-law bytes."""
    return audioop.lin2alaw(data, _PCM_SAMPLE_WIDTH)


def _pcm_rms(pcm16: bytes) -> int:
    """Return the RMS amplitude of a 16-bit PCM buffer."""
    return audioop.rms(pcm16, _PCM_SAMPLE_WIDTH) if pcm16 else 0


def _write_pcm16_wav(dest_path: Path, pcm16_data: bytes) -> None:
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(dest_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(_PCM_SAMPLE_WIDTH)
        wf.setframerate(_SAMPLE_RATE)
        wf.writeframes(pcm16_data)


# (pydub/ffmpeg dependency removed for Render compatibility)


# ─── VoiceLink call-sid / lead helpers ───────────────────────────────────────

def _update_lead_call_sid(temp_call_sid: str, real_call_sid: str) -> None:
    """Replace a lead's temporary placeholder call_sid with the real VoiceLink callSid."""
    try:
        from app.models import db
        from app.models.lead import Lead

        lead = Lead.query.filter_by(call_sid=temp_call_sid).first()
        if lead:
            lead.call_sid = real_call_sid
            db.session.commit()
            logger.info(
                "[VoiceLink] Updated lead call_sid %s → %s", temp_call_sid, real_call_sid
            )
    except Exception:
        logger.exception(
            "[VoiceLink] Failed to update lead call_sid %s → %s", temp_call_sid, real_call_sid
        )


def _finalize_call_log(call_sid: Optional[str], status: str = "completed") -> None:
    """Mark the CallLog and Lead as completed or failed."""
    if not call_sid:
        return
    try:
        from app.models import db
        from app.models.call_log import CallLog
        from app.models.lead import Lead

        log = CallLog.query.filter_by(call_sid=call_sid).first()
        if log:
            log.status = status
            db.session.commit()

        lead = Lead.query.filter_by(call_sid=call_sid).first()
        if lead and lead.status == "calling":
            lead.status = "completed" if status == "completed" else "failed"
            db.session.commit()
    except Exception:
        logger.exception("[VoiceLink] Failed to finalize call log call_sid=%s", call_sid)


# ─── AI pipeline ──────────────────────────────────────────────────────────────

def _build_reply_audio(
    call_sid: Optional[str],
    kb_id: str,
    lead_name: Optional[str],
    script_config: dict[str, Any],
    pcm16_audio: bytes,
) -> tuple[bytes, dict[str, Any]]:
    """
    Full pipeline: PCM16 audio → STT → RAG → LLM → TTS → G.711 A-law.
    Returns (alaw_bytes, analysis_dict).
    """
    if not pcm16_audio:
        return b"", {}

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = Path(tmp.name)
    try:
        _write_pcm16_wav(wav_path, pcm16_audio)

        from app.services.stt_service import STTService
        from app.services.ai_service import AIService, _get_error_fallback_message, _get_repeat_request_message
        from app.services.tts_service import TTSService

        primary_lang = script_config.get("primary_language", "English")
        secondary_lang = script_config.get("secondary_language")
        voice_id = str(script_config.get("voice_id") or "").strip() or None
        gender = script_config.get("voice_style", "female")
        script_prompt = str(script_config.get("prompt") or "").strip() or None

        # 1 — STT
        transcription = STTService.transcribe_file(wav_path, language=primary_lang)
        if not transcription.strip():
            # Caller mumbled or there was noise — politely ask them to repeat
            logger.info("[VoiceLink] STT returned empty call_sid=%s — requesting repeat", call_sid)
            repeat_msg = _get_repeat_request_message(primary_lang)
            repeat_msg = _get_repeat_request_message(primary_lang)
            alaw_bytes = TTSService.generate_alaw_8k(
                repeat_msg, voice_id=voice_id, language=primary_lang, gender=gender
            )
            return alaw_bytes, {}
        logger.info("[VoiceLink] STT call_sid=%s text=%r", call_sid, transcription[:80])

        # 2 — RAG context
        raw_context = _get_context(transcription, kb_id)
        if lead_name:
            raw_context = (
                f"IMPORTANT: The caller's name is {lead_name}. "
                f"Use it naturally in the conversation.\n\n{raw_context}"
            )

        # 3 — LLM reply
        try:
            ai_reply = AIService.generate_reply(
                user_text=transcription,
                conversation_id=call_sid,
                knowledge_context=raw_context,
                primary_language=primary_lang,
                secondary_language=secondary_lang,
                script_prompt=script_prompt,
            )
        except Exception:
            logger.exception("[VoiceLink] AI reply failed call_sid=%s", call_sid)
            # Use language-aware fallback so caller always hears their language
            ai_reply = _get_error_fallback_message(primary_lang)

        if not ai_reply.strip():
            return b"", {}

        # 4 — Persist turn
        _save_conversation_turn(
            call_sid=call_sid,
            kb_id=kb_id,
            phone_number="unknown",
            customer_text=transcription,
            ai_text=ai_reply,
        )

        # 5 — Analyse for tags / handoff / appointment
        analysis: dict[str, Any] = {}
        try:
            analysis = AIService.analyze_transcript_for_tags(
                transcript=transcription,
                script_config=script_config,
            )
            _save_tags_and_forwarding(
                call_sid=call_sid,
                tags=analysis.get("tags") or {},
                is_forwarded=bool(analysis.get("should_handoff")),
            )
            if analysis.get("appointment_detected") and call_sid:
                _send_appointment_email(
                    kb_id=kb_id,
                    lead_phone="unknown",
                    details=analysis.get("appointment_details", "No details provided"),
                    call_sid=call_sid,
                )
        except Exception:
            logger.exception("[VoiceLink] Tagging failed call_sid=%s", call_sid)

        # 6 — Broadcast live event
        try:
            broadcast_live_event({
                "event": "transcript",
                "call_sid": call_sid,
                "kb_id": kb_id,
                "customer_text": transcription,
                "ai_text": ai_reply,
                "analysis": analysis,
                "provider": "voicelink",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            pass

        # 7 — TTS → A-law
        alaw_reply = TTSService.generate_alaw_8k(
            ai_reply, voice_id=voice_id, language=primary_lang, gender=gender
        )
        return alaw_reply, analysis

    except Exception:
        logger.exception("[VoiceLink] Pipeline failed call_sid=%s", call_sid)
        return b"", {}
    finally:
        try:
            wav_path.unlink(missing_ok=True)
        except Exception:
            pass


# ─── WebSocket helpers ────────────────────────────────────────────────────────

def _ws_send(ws, lock: threading.Lock, payload: dict) -> None:
    with lock:
        try:
            ws.send(json.dumps(payload))
        except Exception as e:
            logger.debug("[VoiceLink] WS send error (connection may have closed)")
            _log_ws_event(f"SEND ERROR: {str(e)}")
            raise e


class VoiceLinkPlaybackManager:
    """
    Manages continuous audio playback/streaming to VoiceLink.
    Plays A-law silence chunks when there is no voice audio queued.
    Prevents RTP timeouts (SIP Cause 32) on connection start.
    """
    def __init__(self, ws, lock: threading.Lock, stream_sid: str):
        self.ws = ws
        self.lock = lock
        self.stream_sid = stream_sid
        self.queue = queue.Queue()
        self.stop_event = threading.Event()
        self.thread = None
        self.sent_count = 0
        # Pre-generate 160-byte G.711 A-law silence chunk
        # 160 samples @ 8kHz = 20ms = 320 bytes PCM16
        self.silence_chunk = _lin2alaw(b'\x00' * 320)

    def start(self) -> None:
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def _run(self) -> None:
        _log_ws_event(f"PLAYBACK MANAGER START: stream_sid={self.stream_sid}")
        chunk_duration = 0.020
        start_time = time.time()
        
        try:
            while not self.stop_event.is_set():
                chunk = None
                try:
                    chunk = self.queue.get_nowait()
                except queue.Empty:
                    pass

                if chunk is None:
                    chunk = self.silence_chunk

                try:
                    _ws_send(self.ws, self.lock, {
                        "event": "media",
                        "streamSid": self.stream_sid,
                        "stream_sid": self.stream_sid,
                        "media": {
                            "payload": base64.b64encode(chunk).decode("ascii"),
                            "track": "outbound"
                        },
                        "sequenceNumber": str(self.sent_count + 1),
                        "sequence_number": self.sent_count + 1
                    })
                except Exception as e:
                    _log_ws_event(f"PLAYBACK MANAGER SEND ERROR: {e}")
                    break

                self.sent_count += 1
                
                # Sleep with drift compensation to maintain precise 20ms intervals
                expected_elapsed = self.sent_count * chunk_duration
                next_time = start_time + expected_elapsed
                sleep_time = next_time - time.time()
                if sleep_time > 0:
                    time.sleep(sleep_time)
                else:
                    time.sleep(0.001)

            _log_ws_event(f"PLAYBACK MANAGER COMPLETED: sent={self.sent_count} chunks")
        except Exception as e:
            _log_ws_event(f"PLAYBACK MANAGER EXCEPTION: {e}")
            logger.exception("[VoiceLink] Error in PlaybackManager runner thread")

    def add_audio(self, alaw_audio: bytes) -> None:
        """Split raw A-law audio into 160-byte chunks and queue them."""
        chunk_size = 160
        for i in range(0, len(alaw_audio), chunk_size):
            chunk = alaw_audio[i:i + chunk_size]
            if len(chunk) < chunk_size:
                # Pad the final chunk with silence
                chunk = chunk + self.silence_chunk[len(chunk):]
            self.queue.put(chunk)

    def clear(self) -> None:
        """Empty the queue of any pending speech chunks (for barge-in)."""
        while not self.queue.empty():
            try:
                self.queue.get_nowait()
            except queue.Empty:
                break

    def stop(self) -> None:
        """Stop the continuous streaming thread."""
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=1.0)




# ─── WebSocket registration ───────────────────────────────────────────────────

def register_voicelink_websocket(sock_instance) -> None:
    """Register the VoiceLink media-stream WebSocket with the Flask-Sock instance."""

    @sock_instance.route("/voice/voicelink-stream")
    def voicelink_media_stream(ws) -> None:
        """
        VoiceLink bidirectional media stream.
        Event flow: connected → start → media (loop) → stop
        """
        # ── Session state ────────────────────────────────────────────────
        stream_sid: str = ""
        call_sid: Optional[str] = None
        kb_id: str = ""
        lead_name: Optional[str] = None
        script_config: dict[str, Any] = {}

        # ── Audio buffering ──────────────────────────────────────────────
        utterance = bytearray()
        speech_seen = False
        silence_ms = 0

        # ── Playback control ─────────────────────────────────────────────
        send_lock = threading.Lock()
        playback_manager: Optional[VoiceLinkPlaybackManager] = None

        logger.info("[VoiceLink] WebSocket connected from %s", request.remote_addr)

        # Log headers
        try:
            headers_list = []
            for k, v in request.headers.items():
                headers_list.append(f"{k}: {v}")
            _log_ws_event(f"WS CONNECT HEADERS: {', '.join(headers_list)}")
        except Exception as he:
            _log_ws_event(f"WS CONNECT HEADERS ERROR: {he}")

        while True:
            try:
                message = ws.receive()
                if message is None:
                    logger.info("[VoiceLink] WebSocket disconnected call_sid=%s", call_sid)
                    _log_ws_event(f"DISCONNECT: WebSocket connection closed for call_sid={call_sid}")
                    break
                
                try:
                    event = json.loads(message)
                    event_type = event.get("event")
                except Exception:
                    _log_ws_event(f"INCOMING RAW INVALID JSON: {message[:200]}")
                    logger.warning("[VoiceLink] Invalid JSON frame ignored")
                    continue

                if event_type != "media":
                    _log_ws_event(f"INCOMING EVENT [{event_type}]: {message}")
                else:
                    if not hasattr(voicelink_media_stream, "_media_count"):
                        voicelink_media_stream._media_count = 0
                    voicelink_media_stream._media_count += 1
                    if voicelink_media_stream._media_count <= 3:
                        _log_ws_event(f"INCOMING MEDIA #{voicelink_media_stream._media_count}: {message[:400]}")

                # ── connected ────────────────────────────────────────────────
                if event_type == "connected":
                    logger.info(
                        "[VoiceLink] connected protocol=%s version=%s",
                        event.get("protocol"), event.get("version"),
                    )
                    continue

                # ── start ────────────────────────────────────────────────────
                if event_type == "start":
                    start = event.get("start") or {}
                    stream_sid = str(start.get("streamSid") or start.get("stream_sid") or event.get("streamSid") or event.get("stream_sid") or "").strip()
                    call_sid = str(start.get("callSid") or start.get("call_sid") or "").strip() or None



                    # 2. Start the PlaybackManager immediately to send silence and keep RTP alive
                    if stream_sid:
                        playback_manager = VoiceLinkPlaybackManager(ws, send_lock, stream_sid)
                        playback_manager.start()

                    # Parse custom parameters from start event
                    custom = start.get("customParameters") or start.get("custom_parameters") or {}
                    if isinstance(custom, str):
                        try:
                            custom = json.loads(custom)
                        except Exception:
                            custom = {}

                    temp_call_sid = str(custom.get("temp_call_sid") or custom.get("tempCallSid") or "").strip()

                    # 3. Offload all database queries, swaps, and welcome TTS generation to a background thread
                    from flask import current_app
                    flask_app = current_app._get_current_object()

                    def _async_init_and_welcome(_app=flask_app, _manager=playback_manager, _call_sid=call_sid, _temp_call_sid=temp_call_sid, _custom_params=custom):
                        nonlocal kb_id, lead_name, script_config
                        
                        # Run DB queries inside app context
                        with _app.app_context():
                            try:
                                _log_ws_event(f"ASYNC INIT: Starting DB initialization for call_sid={_call_sid}")
                                
                                # A. Swap temp placeholder → real telephony callSid
                                if _temp_call_sid and _call_sid and _temp_call_sid != _call_sid:
                                    _update_lead_call_sid(_temp_call_sid, _call_sid)

                                # B. Resolve kb_id
                                kb_id = str(_custom_params.get("kb_id") or "").strip()

                                # C. Load script config
                                loaded_config = _get_campaign_and_script_config(_call_sid)[2] if _call_sid else {}
                                if loaded_config:
                                    script_config = loaded_config
                                else:
                                    script_config = {
                                        "welcome_message": "नमस्ते, मैं आपका एआई एजेंट हूं। मैं आपकी कैसे मदद कर सकता हूं?",
                                        "primary_language": "Hindi",
                                        "voice_style": "female",
                                        "prompt": "You are a helpful AI assistant on a test call. Answer the user's questions clearly and concisely based on the knowledge base."
                                    }

                                # D. Load lead name
                                try:
                                    from app.models.lead import Lead
                                    lead_obj = Lead.query.filter_by(call_sid=_call_sid).first() if _call_sid else None
                                    lead_name = getattr(lead_obj, "first_name", "") if lead_obj else ""
                                    _log_ws_event(f"ASYNC INIT: Lead name resolved to '{lead_name}'")
                                except Exception as le:
                                    _log_ws_event(f"ASYNC INIT: Lead resolution failed: {le}")
                                    lead_name = ""

                                # E. Live Event start
                                broadcast_live_event({
                                    "event": "call_start",
                                    "call_sid": _call_sid,
                                    "kb_id": kb_id,
                                    "provider": "voicelink",
                                    "timestamp": datetime.now(timezone.utc).isoformat(),
                                })

                                # F. Generate and stream welcome message
                                welcome_msg = str(script_config.get("welcome_message") or "").strip()
                                if welcome_msg and _manager:
                                    _log_ws_event(f"WELCOME: Starting welcome generation for call_sid={_call_sid}...")
                                    from app.services.tts_service import TTSService
                                    primary_lang = script_config.get("primary_language", "Hindi")
                                    voice_id = str(script_config.get("voice_id") or "").strip() or None
                                    gender = script_config.get("voice_style", "female")
                                    
                                    _log_ws_event(f"WELCOME: Generating TTS for language={primary_lang}, voice_id={voice_id}, gender={gender}...")
                                    
                                    import time as _time
                                    _t0 = _time.time()
                                    welcome_alaw = TTSService.generate_alaw_8k(
                                        welcome_msg, voice_id=voice_id, language=primary_lang, gender=gender
                                    )
                                    _dur = _time.time() - _t0
                                    
                                    if welcome_alaw:
                                        _log_ws_event(f"WELCOME: Generated {len(welcome_alaw)} ALAW bytes in {_dur:.4f}s. Adding to playback queue...")
                                        _manager.add_audio(welcome_alaw)
                                        logger.info("[VoiceLink] Welcome message added to queue call_sid=%s", _call_sid)
                                    else:
                                        _log_ws_event("WELCOME ERROR: Failed to generate welcome ALAW bytes (returned empty)")
                            except Exception as ex:
                                import traceback
                                error_tb = traceback.format_exc()
                                _log_ws_event(f"ASYNC INIT THREAD ERROR: {error_tb}")

                    threading.Thread(target=_async_init_and_welcome, daemon=True).start()
                    continue

                # ── media (inbound customer audio) ───────────────────────────
                if event_type == "media":
                    media = event.get("media") or {}
                    b64_payload = (media.get("payload") or "").strip()
                    if not b64_payload:
                        continue

                    try:
                        alaw_chunk = base64.b64decode(b64_payload)
                        pcm_chunk = _alaw2lin(alaw_chunk)
                    except Exception:
                        logger.debug("[VoiceLink] Failed to decode media chunk, skipping")
                        continue

                    utterance.extend(pcm_chunk)
                    chunk_rms = _pcm_rms(pcm_chunk)
                    chunk_ms = int((len(pcm_chunk) // _PCM_SAMPLE_WIDTH) / (_SAMPLE_RATE / 1000))

                    if chunk_rms >= _SILENCE_RMS:
                        # Barge-in: caller speaks while AI is playing → interrupt
                        if playback_manager:
                            playback_manager.clear()
                            if stream_sid:
                                try:
                                    _ws_send(ws, send_lock, {"event": "clear", "streamSid": stream_sid})
                                except Exception as ce:
                                    _log_ws_event(f"BARGE-IN CLEAR SEND ERROR: {ce}")
                        speech_seen = True
                        silence_ms = 0
                    else:
                        silence_ms += max(chunk_ms, 20)

                    utterance_ms = int(
                        (len(utterance) // _PCM_SAMPLE_WIDTH) / (_SAMPLE_RATE / 1000)
                    )

                    # End-of-utterance detection
                    if (
                        speech_seen
                        and silence_ms >= _END_SILENCE_MS
                        and utterance_ms >= _MIN_UTTERANCE_MS
                        and kb_id
                    ):
                        captured = bytes(utterance)
                        utterance.clear()
                        speech_seen = False
                        silence_ms = 0

                        alaw_reply, analysis = _build_reply_audio(
                            call_sid=call_sid,
                            kb_id=kb_id,
                            lead_name=lead_name,
                            script_config=script_config,
                            pcm16_audio=captured,
                        )

                        # Handoff detection
                        handoff_number = str(script_config.get("handoff_number") or "").strip()
                        if analysis.get("should_handoff") and handoff_number and call_sid:
                            logger.info("[VoiceLink] Handoff triggered call_sid=%s", call_sid)
                            break  # VoiceLink side will disconnect; status callback finalizes the log

                        # Stream reply back to caller
                        if alaw_reply and stream_sid and playback_manager:
                            playback_manager.add_audio(alaw_reply)

                    continue

                # ── stop ─────────────────────────────────────────────────────
                if event_type == "stop":
                    logger.info("[VoiceLink] stop event call_sid=%s", call_sid)
                    if playback_manager:
                        playback_manager.stop()
                    _finalize_call_log(call_sid, status="completed")
                    broadcast_live_event({
                        "event": "call_end",
                        "call_sid": call_sid,
                        "provider": "voicelink",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                    break

            except Exception as e:
                import traceback
                error_tb = traceback.format_exc()
                logger.exception("[VoiceLink] Error in WebSocket loop")
                _log_ws_event(f"WS LOOP ERROR: {error_tb}")
                break

        # Cleanup on unexpected disconnect
        if playback_manager:
            playback_manager.stop()


# ─── Status Callback Webhook ──────────────────────────────────────────────────

@voicelink_voice_bp.post("/voice/voicelink-status-callback")
def voicelink_status_callback():
    """
    VoiceLink HTTP webhook for call lifecycle events.
    Expected JSON body:
      { "event": "call.completed", "callSid": "...", "duration": 42, ... }
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        
        # Log to file-based persistent logs
        _log_ws_event(f"WEBHOOK RECEIVED: {json.dumps(data)}")
        
        from flask import current_app
        if 'WEBHOOK_LOGS' in current_app.config:
            current_app.config['WEBHOOK_LOGS'].append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": data
            })

        event_name = str(data.get("event") or data.get("status") or "").lower()
        call_sid = str(data.get("callSid") or data.get("call_sid") or "").strip()
        duration = int(data.get("duration") or 0)

        logger.info(
            "[VoiceLink] status-callback event=%s call_sid=%s duration=%s",
            event_name, call_sid, duration,
        )

        if any(k in event_name for k in ("completed", "disconnected", "ended")):
            _finalize_call_log(call_sid, status="completed")
        elif any(k in event_name for k in ("failed", "busy", "no-answer", "noanswer", "canceled")):
            _finalize_call_log(call_sid, status="failed")

        # Update duration
        if call_sid and duration:
            try:
                from app.models import db
                from app.models.call_log import CallLog
                log = CallLog.query.filter_by(call_sid=call_sid).first()
                if log:
                    log.duration_seconds = duration
                    db.session.commit()
            except Exception:
                logger.exception(
                    "[VoiceLink] Failed to update duration call_sid=%s", call_sid
                )

        # Post-call full transcript tagging
        if call_sid and any(k in event_name for k in ("completed", "disconnected", "ended")):
            try:
                from app.models.call_log import CallLog
                from app.services.ai_service import AIService
                from app.routes.twilio_voice import (
                    _conversation_to_plain_text,
                    _get_campaign_and_script_config,
                    _save_tags_and_forwarding,
                )

                call_log = CallLog.query.filter_by(call_sid=call_sid).first()
                if call_log:
                    _, _, script_config = _get_campaign_and_script_config(call_sid)
                    transcript_text = _conversation_to_plain_text(call_log.conversation or [])
                    if transcript_text:
                        analysis = AIService.analyze_transcript_for_tags(
                            transcript=transcript_text,
                            script_config=script_config,
                        )
                        post_call = AIService.analyze_post_call(transcript_text)
                        merged_tags = dict((analysis.get("tags") or {}))
                        merged_tags.update({
                            "sentiment": post_call.get("sentiment", "Neutral"),
                            "lead_intent": post_call.get("lead_intent", "Neutral"),
                            "call_summary": post_call.get("call_summary", ""),
                        })
                        if post_call.get("appointment_detected"):
                            merged_tags["appointment_status"] = "requested"
                            merged_tags["appointment_info"] = post_call.get("appointment_info")
                        _save_tags_and_forwarding(
                            call_sid=call_sid,
                            tags=merged_tags,
                            is_forwarded=bool(call_log.is_forwarded),
                        )
            except Exception:
                logger.exception(
                    "[VoiceLink] Post-call tagging failed call_sid=%s", call_sid
                )

        return jsonify({"status": "ok"}), 200
    except Exception:
        logger.exception("[VoiceLink] status-callback handler error")
        return jsonify({"status": "error"}), 500
