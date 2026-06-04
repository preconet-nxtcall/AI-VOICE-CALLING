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
import hashlib
import json
import logging
import queue
import tempfile
import threading
import time
import wave
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Optional

import gevent
import gevent.event
from gevent.queue import Queue as GeventQueue

from flask import Blueprint, jsonify, request, current_app
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
    _parse_script_config,
)

# Core models and services
from app.models import db
from app.models.lead import Lead
from app.models.campaign import Campaign
from app.models.call_log import CallLog
from app.services.stt_service import STTService
from app.services.ai_service import AIService, _get_error_fallback_message, _get_repeat_request_message
from app.services.tts_service import TTSService, _get_config, _DEFAULT_TTS_DIR

logger = logging.getLogger(__name__)

voicelink_voice_bp = Blueprint("voicelink_voice", __name__)

# ─── Audio constants ──────────────────────────────────────────────────────────
_SAMPLE_RATE = 8000        # VoiceLink streams 8 kHz
_SILENCE_RMS = 250         # RMS below this = silence (lowered from 700 for better sensitivity on telephone lines)
_END_SILENCE_MS = 800      # trailing silence to end utterance (slightly more patient)
_MIN_UTTERANCE_MS = 400    # minimum utterance duration to process (lowered to catch short replies)
_PCM_SAMPLE_WIDTH = 2      # bytes per sample (16-bit PCM)

_log_lock = threading.Lock()

def _log_ws_event(message: str) -> None:
    """Thread-safe persistent file-based logging for VoiceLink events."""
    ist = timezone(timedelta(hours=5, minutes=30))
    timestamp = datetime.now(ist).isoformat()
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
    lead_phone: str,
    script_config: dict[str, Any],
    pcm16_audio: bytes,
) -> tuple[bytes, str, str]:
    """
    Fast pipeline: PCM16 audio → STT → RAG (no reranker) → LLM reply → TTS.
    Returns (alaw_bytes, transcription, ai_reply).
    """
    if not pcm16_audio:
        return b"", "", ""

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = Path(tmp.name)
    try:
        _write_pcm16_wav(wav_path, pcm16_audio)

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
            _log_ws_event(f"STT: Empty transcription — requesting repeat (call_sid={call_sid})")
            repeat_msg = _get_repeat_request_message(primary_lang)
            alaw_bytes = TTSService.generate_alaw_8k(
                repeat_msg, voice_id=voice_id, language=primary_lang, gender=gender
            )
            return alaw_bytes, "", repeat_msg
        logger.info("[VoiceLink] STT call_sid=%s text=%r", call_sid, transcription[:80])
        _log_ws_event(f"STT: {transcription[:120]}")

        # 2 — RAG context (explicitly setting use_reranker=False for speed)
        raw_context = _get_context(transcription, kb_id, use_reranker=False)
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
            return b"", transcription, ""

        _log_ws_event(f"AI REPLY: {ai_reply[:150]}")

        # 4 — Persist turn
        _save_conversation_turn(
            call_sid=call_sid,
            kb_id=kb_id,
            phone_number=lead_phone,
            customer_text=transcription,
            ai_text=ai_reply,
        )

        # 5 — TTS → A-law
        alaw_reply = TTSService.generate_alaw_8k(
            ai_reply, voice_id=voice_id, language=primary_lang, gender=gender
        )
        return alaw_reply, transcription, ai_reply

    except Exception:
        logger.exception("[VoiceLink] Pipeline failed call_sid=%s", call_sid)
        return b"", "", ""
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
        self.queue = GeventQueue()
        self.stop_event = gevent.event.Event()
        self.greenlet = None
        self.sent_count = 0
        self.current_speech_chunks_sent = 0
        # Pre-generate 160-byte G.711 A-law silence chunk
        # 160 samples @ 8kHz = 20ms = 320 bytes PCM16
        self.silence_chunk = _lin2alaw(b'\x00' * 320)

    def start(self) -> None:
        self.greenlet = gevent.spawn(self._run)

    def _run(self) -> None:
        _log_ws_event(f"PLAYBACK MANAGER START: stream_sid={self.stream_sid}")
        chunk_duration = 0.020
        start_time = time.time()
        
        try:
            while not self.stop_event.is_set():
                chunk = None
                try:
                    chunk = self.queue.get_nowait()
                except Exception:
                    pass

                if chunk is None:
                    gevent.sleep(0.02)
                    continue

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
                self.current_speech_chunks_sent += 1
                
                # Sleep with drift compensation to maintain precise 20ms intervals
                expected_elapsed = self.sent_count * chunk_duration
                next_time = start_time + expected_elapsed
                sleep_time = next_time - time.time()
                if sleep_time > 0:
                    gevent.sleep(sleep_time)
                else:
                    gevent.sleep(0.001)

            _log_ws_event(f"PLAYBACK MANAGER COMPLETED: sent={self.sent_count} chunks")
        except Exception as e:
            _log_ws_event(f"PLAYBACK MANAGER EXCEPTION: {e}")
            logger.exception("[VoiceLink] Error in PlaybackManager runner greenlet")

    def add_audio(self, alaw_audio: bytes) -> None:
        """Split raw A-law audio into 160-byte chunks and queue them."""
        self.current_speech_chunks_sent = 0
        chunk_size = 160
        for i in range(0, len(alaw_audio), chunk_size):
            chunk = alaw_audio[i:i + chunk_size]
            if len(chunk) < chunk_size:
                # Pad the final chunk with silence
                chunk = chunk + self.silence_chunk[len(chunk):]
            self.queue.put(chunk)

    def clear(self) -> None:
        """Empty the queue of any pending speech chunks (for barge-in)."""
        self.current_speech_chunks_sent = 0
        while not self.queue.empty():
            try:
                self.queue.get_nowait()
            except Exception:
                break

    def stop(self) -> None:
        """Stop the continuous streaming greenlet."""
        self.stop_event.set()
        if self.greenlet:
            self.greenlet.join(timeout=1.0)




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
        lead_phone: str = "unknown"
        script_config: dict[str, Any] = {}
        media_count = 0

        # ── Audio buffering ──────────────────────────────────────────────
        utterance = bytearray()
        speech_seen = False
        speech_duration_ms = 0
        silence_ms = 0

        # ── Playback control ─────────────────────────────────────────────
        send_lock = threading.Lock()
        playback_manager: Optional[VoiceLinkPlaybackManager] = None
        response_counter = 0

        logger.info("[VoiceLink] WebSocket connected from %s", request.remote_addr)

        # Log headers
        try:
            headers_list = []
            for k, v in request.headers.items():
                headers_list.append(f"{k}: {v}")
            _log_ws_event(f"WS CONNECT HEADERS: {', '.join(headers_list)}")
        except Exception as he:
            _log_ws_event(f"WS CONNECT HEADERS ERROR: {he}")

        # Start keep-alive loop to prevent Render free tier idle timeout
        def _websocket_keep_alive():
            _log_ws_event("KEEP-ALIVE: Start keep-alive loop.")
            while True:
                gevent.sleep(25)
                try:
                    _ws_send(ws, send_lock, {
                        "event": "ping",
                        "timestamp": int(time.time())
                    })
                except Exception as ke:
                    _log_ws_event(f"KEEP-ALIVE ERROR: {ke}")
                    break

        keepalive_greenlet = gevent.spawn(_websocket_keep_alive)

        while True:
            try:
                try:
                    message = ws.receive()
                    if message is None:
                        logger.info("[VoiceLink] WebSocket disconnected call_sid=%s", call_sid)
                        _log_ws_event(f"DISCONNECT: WebSocket connection closed for call_sid={call_sid}")
                        break
                except Exception as ws_err:
                    logger.info("[VoiceLink] WebSocket connection exception call_sid=%s: %s", call_sid, ws_err)
                    _log_ws_event(f"DISCONNECT: WS receive exception: {ws_err}")
                    break
                
                try:
                    event = json.loads(message)
                    event_type = event.get("event")
                except Exception:
                    _log_ws_event(f"INCOMING RAW INVALID JSON: {message[:200]}")
                    logger.warning("[VoiceLink] Invalid JSON frame ignored")
                    continue

                if event_type in ["ping", "heartbeat"]:
                    try:
                        _ws_send(ws, send_lock, {
                            "event": "pong"
                        })
                    except:
                        pass
                    continue

                if event_type != "media":
                    _log_ws_event(f"INCOMING EVENT [{event_type}]: {message}")
                else:
                    media_count += 1
                    if media_count <= 3:
                        _log_ws_event(f"INCOMING MEDIA #{media_count}: {message[:400]}")

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

                    # Parse custom parameters from start event
                    custom = start.get("customParameters") or start.get("custom_parameters") or {}
                    if isinstance(custom, str):
                        try:
                            custom = json.loads(custom)
                        except Exception:
                            custom = {}

                    temp_call_sid = str(custom.get("temp_call_sid") or custom.get("tempCallSid") or "").strip()
                    tts_key = str(custom.get("tts_key") or "").strip()
                    lead_name = str(custom.get("name") or "").strip()
                    lead_phone = str(custom.get("phone") or "unknown").strip()
                    script_id_param = str(custom.get("script_id") or "").strip() or None
                    kb_id = str(custom.get("kb_id") or "").strip()

                    # script_config starts as None so the async init can detect "no real script loaded yet".
                    # The placeholder dict is only applied as a final fallback inside _async_init_and_welcome.
                    script_config = None
                    _DEFAULT_SCRIPT_CONFIG = {
                        "welcome_message": "नमस्ते, मैं आपका एआई एजेंट हूं। मैं आपकी कैसे मदद कर सकता हूं?",
                        "primary_language": "Hindi",
                        "voice_style": "female",
                        "prompt": "You are a helpful AI assistant on a test call. Answer the user's questions clearly and concisely based on the knowledge base."
                    }

                    # ── CRITICAL FIX: Load welcome audio BEFORE starting PlaybackManager ──
                    # SIP Cause 32 (RTP timeout) was triggered because the PlaybackManager
                    # was sending ~460ms of silence before any real speech, causing VoiceLink
                    # to treat the bot as unresponsive and disconnect immediately.
                    # Solution: pre-load welcome audio into the queue, THEN start the manager
                    # so the very first RTP packets contain real speech audio.

                    welcome_played_instantly = False
                    welcome_alaw_preloaded = b""

                    if stream_sid:
                        import hashlib

                        # Resolve TTS cache key
                        resolved_key = tts_key
                        if not resolved_key:
                            default_welcome = "नमस्ते, मैं आपका एआई एजेंट हूं। मैं आपकी कैसे मदद कर सकता हूं?"
                            key_str = f"{default_welcome}|{''}|{'Hindi'}|{'female'}"
                            resolved_key = hashlib.sha256(key_str.encode("utf-8")).hexdigest()

                        cache_dir = Path(_get_config("TTS_AUDIO_DIR") or _DEFAULT_TTS_DIR).resolve()
                        cache_file = cache_dir / f"alaw_{resolved_key}.bin"

                        if cache_file.exists():
                            try:
                                _log_ws_event(f"WELCOME: Loading cached welcome audio key={resolved_key[:16]}...")
                                welcome_alaw_preloaded = cache_file.read_bytes()
                                if welcome_alaw_preloaded:
                                    welcome_played_instantly = True
                                    _log_ws_event(f"WELCOME: Loaded {len(welcome_alaw_preloaded)} A-law bytes from cache.")
                                else:
                                    _log_ws_event("WELCOME: Cache file was empty, will generate in background.")
                            except Exception as fe:
                                _log_ws_event(f"WELCOME CACHE LOAD ERROR: {fe}")

                        # Create PlaybackManager and pre-fill queue with welcome audio
                        # BEFORE starting so first packets are speech, not silence
                        playback_manager = VoiceLinkPlaybackManager(ws, send_lock, stream_sid)
                        if welcome_alaw_preloaded:
                            # Add a 100ms silence pre-roll (400 bytes A-law @ 8kHz)
                            # to give VoiceLink RTP channel time to open before speech
                            silence_preroll = playback_manager.silence_chunk * 5  # 5 × 20ms = 100ms
                            playback_manager.add_audio(silence_preroll)
                            playback_manager.add_audio(welcome_alaw_preloaded)
                            _log_ws_event("WELCOME: Pre-filled playback queue with 100ms silence + welcome audio. Starting manager.")
                        else:
                            _log_ws_event("WELCOME: No cache found. PlaybackManager starting with silence (will generate welcome in background).")
                        gevent.sleep(0.3)
                        playback_manager.start()

                    # ── Offload DB queries and fallback welcome to a background greenlet ──
                    # NO sleep delay here — let it run immediately so kb_id and script_config
                    # are resolved as fast as possible before the caller speaks.
                    from flask import current_app
                    flask_app = current_app._get_current_object()

                    def _async_init_and_welcome(
                        _app=flask_app,
                        _manager=playback_manager,
                        _call_sid=call_sid,
                        _temp_call_sid=temp_call_sid,
                        _custom_params=custom,
                        _played_instantly=welcome_played_instantly,
                        _script_id_param=script_id_param,
                    ):
                        nonlocal kb_id, lead_name, lead_phone, script_config

                        # Small cooperative yield so PlaybackManager greenlet can start
                        # and get its first chunks into the wire before we hit the DB.
                        gevent.sleep(0.1)

                        with _app.app_context():
                            try:
                                _log_ws_event(f"ASYNC INIT: Starting DB initialization for call_sid={_call_sid}")

                                # Consolidate Lead lookup and SID swap
                                lead_obj = None
                                if _call_sid:
                                    lead_obj = Lead.query.filter_by(call_sid=_call_sid).first()
                                if not lead_obj and _temp_call_sid:
                                    lead_obj = Lead.query.filter_by(call_sid=_temp_call_sid).first()
                                    if lead_obj and _call_sid:
                                        lead_obj.call_sid = _call_sid
                                        db.session.commit()
                                        _log_ws_event(f"ASYNC INIT: Swapped temp_call_sid={_temp_call_sid} to real_call_sid={_call_sid}")

                                if lead_obj:
                                    lead_name = getattr(lead_obj, "first_name", "") or ""
                                    lead_phone = getattr(lead_obj, "phone_number", "") or lead_phone
                                    _log_ws_event(f"ASYNC INIT: Lead name resolved to '{lead_name}', phone to '{lead_phone}'")

                                    # Load script config from campaign
                                    if lead_obj.campaign_id:
                                        campaign = db.session.get(Campaign, lead_obj.campaign_id)
                                        if campaign and campaign.script:
                                            parsed_cfg = _parse_script_config(campaign.script.content)
                                            if parsed_cfg:
                                                script_config = parsed_cfg
                                                _log_ws_event("ASYNC INIT: Custom script config loaded successfully")

                                # ALWAYS load script_id from custom params when present —
                                # it has higher priority than a campaign script so the API caller
                                # can override per-call agent persona.
                                if _script_id_param:
                                    from app.models.script import Script
                                    try:
                                        script_obj = db.session.get(Script, uuid.UUID(_script_id_param))
                                        if script_obj:
                                            parsed_cfg = _parse_script_config(script_obj.content)
                                            if parsed_cfg:
                                                script_config = parsed_cfg
                                                _log_ws_event(f"ASYNC INIT: Script '{script_obj.name}' loaded from customParameters script_id")
                                    except Exception:
                                        _log_ws_event(f"ASYNC INIT: Failed to load script {_script_id_param}")

                                # Final fallback: if neither campaign nor script_id resolved a config, use the default placeholder
                                if not script_config:
                                    script_config = _DEFAULT_SCRIPT_CONFIG
                                    _log_ws_event("ASYNC INIT: Using default placeholder script config (no campaign/script_id found)")

                                # Resolve kb_id from params if still not set
                                if not kb_id:
                                    kb_id = str(_custom_params.get("kb_id") or "").strip()

                                # Broadcast live event
                                broadcast_live_event({
                                    "event": "call_start",
                                    "call_sid": _call_sid,
                                    "kb_id": kb_id,
                                    "provider": "voicelink",
                                    "timestamp": datetime.now(timezone(timedelta(hours=5, minutes=30))).isoformat(),
                                })

                                # Fallback welcome: generate now if cache was missing
                                if not _played_instantly:
                                    welcome_msg = str(script_config.get("welcome_message") or "").strip()
                                    if welcome_msg and _manager:
                                        _log_ws_event(f"WELCOME: Generating fallback welcome for call_sid={_call_sid}...")
                                        primary_lang = script_config.get("primary_language", "Hindi")
                                        voice_id_cfg = str(script_config.get("voice_id") or "").strip() or None
                                        gender = script_config.get("voice_style", "female")

                                        welcome_alaw = TTSService.generate_alaw_8k(
                                            welcome_msg, voice_id=voice_id_cfg, language=primary_lang, gender=gender
                                        )
                                        if welcome_alaw:
                                            _manager.add_audio(welcome_alaw)
                                            _log_ws_event(f"WELCOME: Fallback welcome added ({len(welcome_alaw)} bytes).")
                                        else:
                                            _log_ws_event("WELCOME ERROR: Fallback TTS returned empty bytes")
                            except Exception:
                                import traceback
                                _log_ws_event(f"ASYNC INIT THREAD ERROR: {traceback.format_exc()}")

                    gevent.spawn(_async_init_and_welcome)
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
                        if playback_manager and not playback_manager.queue.empty() and getattr(playback_manager, 'current_speech_chunks_sent', 0) > 80:
                            playback_manager.clear()
                            response_counter += 1  # Invalidate any ongoing background response generations
                            if stream_sid:
                                try:
                                    _ws_send(ws, send_lock, {
                                        "event": "clear",
                                        "streamSid": stream_sid,
                                        "stream_sid": stream_sid
                                    })
                                except Exception as ce:
                                    _log_ws_event(f"BARGE-IN CLEAR SEND ERROR: {ce}")
                        speech_seen = True
                        speech_duration_ms += max(chunk_ms, 20)
                        silence_ms = 0
                    else:
                        silence_ms += max(chunk_ms, 20)

                    # Sliding pre-roll window when user is silent to avoid accumulating hours of silence/noise
                    if not speech_seen:
                        # Keep only the last 400ms of pre-roll silence (8000 Hz * 2 bytes * 0.4s = 6400 bytes)
                        max_pre_roll_bytes = 6400
                        if len(utterance) > max_pre_roll_bytes:
                            del utterance[:-max_pre_roll_bytes]

                    # End-of-utterance detection
                    if (
                        speech_seen
                        and silence_ms >= _END_SILENCE_MS
                        and kb_id
                    ):
                        if speech_duration_ms >= _MIN_UTTERANCE_MS:
                            captured = bytes(utterance)
                            # Increment response counter for new response generation
                            response_counter += 1
                            current_resp_id = response_counter

                            # Run the slow STT/LLM/TTS pipeline asynchronously in a background greenlet
                            # to prevent blocking the WebSocket receiver (keeps pings/pongs and heartbeats active).
                            from flask import current_app
                            flask_app = current_app._get_current_object()

                            def _process_utterance_async(captured_audio, current_script_config, resp_id, app_instance):
                                with app_instance.app_context():
                                    try:
                                        alaw_reply, transcription, ai_reply = _build_reply_audio(
                                            call_sid=call_sid,
                                            kb_id=kb_id,
                                            lead_name=lead_name,
                                            lead_phone=lead_phone,
                                            script_config=current_script_config,
                                            pcm16_audio=captured_audio,
                                        )

                                        # Only queue the audio if the caller hasn't interrupted/spoken again
                                        if resp_id == response_counter:
                                            if alaw_reply and stream_sid and playback_manager:
                                                playback_manager.add_audio(alaw_reply)

                                            # Run CRM tag extraction & event broadcasting in an async background greenlet
                                            def _async_post_reply_tasks(_app=app_instance, _transcription=transcription, _ai_reply=ai_reply):
                                                with _app.app_context():
                                                    try:
                                                        analysis = {}
                                                        if _transcription and _transcription.strip():
                                                            analysis = AIService.analyze_transcript_for_tags(
                                                                transcript=_transcription,
                                                                script_config=current_script_config,
                                                            )
                                                            _save_tags_and_forwarding(
                                                                call_sid=call_sid,
                                                                tags=analysis.get("tags") or {},
                                                                is_forwarded=bool(analysis.get("should_handoff")),
                                                            )
                                                            if analysis.get("appointment_detected") and call_sid:
                                                                _send_appointment_email(
                                                                    kb_id=kb_id,
                                                                    lead_phone=lead_phone,
                                                                    details=analysis.get("appointment_details", "No details provided"),
                                                                    call_sid=call_sid,
                                                                )

                                                        # Broadcast live dashboard transcript event
                                                        broadcast_live_event({
                                                            "event": "transcript",
                                                            "call_sid": call_sid,
                                                            "kb_id": kb_id,
                                                            "customer_text": _transcription,
                                                            "ai_text": _ai_reply,
                                                            "analysis": analysis,
                                                            "provider": "voicelink",
                                                            "timestamp": datetime.now(timezone(timedelta(hours=5, minutes=30))).isoformat(),
                                                        })

                                                        # Handoff detection
                                                        handoff_number = str(current_script_config.get("handoff_number") or "").strip()
                                                        if analysis.get("should_handoff") and handoff_number and call_sid:
                                                            logger.info("[VoiceLink] Handoff triggered call_sid=%s, scheduling WS close", call_sid)
                                                            try:
                                                                # Give time for the generated TTS audio to stream before closing the socket.
                                                                gevent.sleep(6.0)
                                                                ws.close()
                                                            except Exception:
                                                                pass
                                                    except Exception as ae:
                                                        logger.exception("[VoiceLink] Async post-reply tasks failed")
                                                        _log_ws_event(f"ASYNC POST-REPLY ERROR: {ae}")

                                            gevent.spawn(_async_post_reply_tasks)

                                        else:
                                            _log_ws_event(f"DISCARDED: Response ID {resp_id} discarded due to new user speech.")
                                    except Exception as pe:
                                        logger.exception("[VoiceLink] Async pipeline processing failed")
                                        _log_ws_event(f"ASYNC PIPELINE ERROR: {pe}")

                            # If script_config is still None (async init still running), wait briefly for it.
                            # This happens when the caller speaks extremely fast (before DB query finishes).
                            _wait_ms = 0
                            while script_config is None and _wait_ms < 3000:
                                gevent.sleep(0.1)
                                _wait_ms += 100
                            if script_config is None:
                                # Async init never completed — use default placeholder so we still reply
                                script_config = _DEFAULT_SCRIPT_CONFIG
                                _log_ws_event("SPEECH DETECTED: script_config still None after 3s wait — using placeholder config")

                            gevent.spawn(_process_utterance_async, captured, script_config, current_resp_id, flask_app)
                            _log_ws_event(f"SPEECH DETECTED: Triggered response generation ID {current_resp_id} (duration={speech_duration_ms}ms)")
                        else:
                            _log_ws_event(f"NOISE IGNORED: Speech duration {speech_duration_ms}ms was below minimum {_MIN_UTTERANCE_MS}ms")
                        
                        # Reset for next turn
                        utterance.clear()
                        speech_seen = False
                        speech_duration_ms = 0
                        silence_ms = 0

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
                        "timestamp": datetime.now(timezone(timedelta(hours=5, minutes=30))).isoformat(),
                    })
                    break

            except Exception as e:
                logger.exception("WS LOOP ERROR")
                _log_ws_event(f"WS LOOP ERROR: {e}")
                gevent.sleep(0.1)
                continue

        # Cleanup on unexpected disconnect
        if playback_manager:
            playback_manager.stop()
        try:
            keepalive_greenlet.kill()
        except Exception:
            pass


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
            ist = timezone(timedelta(hours=5, minutes=30))
            current_app.config['WEBHOOK_LOGS'].append({
                "timestamp": datetime.now(ist).isoformat(),
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
