"""
voice_service.py
~~~~~~~~~~~~~~~~
Core voice service for the AI Voice Calling system (VoiceLink only).

Provides:
  • VoiceService.make_outbound_call  — POST to VoiceLink add_lead API
  • VoiceService.transcribe          — Whisper STT
  • VoiceService.synthesize          — ElevenLabs / gTTS TTS
"""

from __future__ import annotations

import io
import json
import logging
import os
import uuid
from typing import Optional, Tuple

import requests
from gtts import gTTS
from openai import OpenAI

logger = logging.getLogger(__name__)


def _get_api_key(key_name: str) -> str:
    """Read a config key from the Flask app config, falling back to env vars."""
    try:
        from flask import current_app
        key = current_app.config.get(key_name)
    except RuntimeError:
        key = None
    return key or os.environ.get(key_name, "")


class VoiceService:
    # ─── Outbound Calling ─────────────────────────────────────────────────────

    @staticmethod
    def make_outbound_call(
        to_number: str,
        kb_id: str,
        from_number_override: Optional[str] = None,
        script_id: Optional[str] = None,
    ) -> str:
        """
        Initiate an outbound AI call via VoiceLink.
        Returns a temporary call-sid that is replaced by the real one once
        VoiceLink sends the 'start' event on the WebSocket.
        """
        # Resolve the public base URL
        try:
            from flask import current_app, request as flask_request
            base_url = current_app.config.get("PUBLIC_BASE_URL", "").strip().rstrip("/")
            if not base_url:
                base_url = flask_request.host_url.rstrip("/")
        except RuntimeError:
            base_url = os.environ.get("PUBLIC_BASE_URL", "").strip().rstrip("/")

        if not base_url:
            raise ValueError("PUBLIC_BASE_URL is not configured.")

        api_token = _get_api_key("VOICELINK_API_TOKEN")
        did_number = (from_number_override or "").strip() or _get_api_key("VOICELINK_DID_NUMBER")
        country_code = _get_api_key("VOICELINK_COUNTRY_CODE").strip()

        if not api_token:
            raise ValueError("VOICELINK_API_TOKEN is not configured.")
        if not did_number:
            raise ValueError("VOICELINK_DID_NUMBER is not configured for outbound calls.")

        # Normalize phone numbers for VoiceLink:
        # VoiceLink expects numbers WITHOUT the leading '+' (it uses country_code separately)
        # e.g. "+919876543210" → "919876543210"
        # We also strip the country code prefix if it matches to prevent double country code dialing
        def _normalize_for_voicelink(number: str, cc: str) -> str:
            n = number.strip()
            if n.startswith("+"):
                n = n[1:]
            if cc and n.startswith(cc):
                n = n[len(cc):]
            return n

        did_number_clean = _normalize_for_voicelink(did_number, "")
        customer_number_clean = _normalize_for_voicelink(to_number, country_code)

        # Generate a shorter temporary placeholder SID to fit within 255-character custom parameters limit
        temp_call_sid = f"vl_{uuid.uuid4().hex[:8]}"

        # Resolve script configuration and welcome message text
        welcome_message = "नमस्ते, मैं आपका एआई एजेंट हूं। मैं आपकी कैसे मदद कर सकता हूं?"
        primary_language = "Hindi"
        voice_style = "female"
        voice_id = None
        lead_name = ""

        try:
            from app.models.lead import Lead
            from app.models.campaign import Campaign
            from app.models.script import Script
            from app.models import db
            from app.routes.twilio_voice import _parse_script_config

            script = None
            if script_id:
                try:
                    script_uuid = uuid.UUID(str(script_id))
                    script = db.session.get(Script, script_uuid)
                except ValueError:
                    pass

            clean_to_10 = to_number.strip()[-10:]
            lead = Lead.query.filter(
                Lead.phone_number.like(f"%{clean_to_10}"),
                Lead.status.in_(["pending", "calling"])
            ).order_by(Lead.created_at.desc()).first()
            if lead:
                lead_name = lead.first_name or ""
                if not script:
                    campaign = db.session.get(Campaign, lead.campaign_id) if lead.campaign_id else None
                    script = getattr(campaign, "script", None) if campaign else None

            if script:
                script_config = _parse_script_config(getattr(script, "content", None))
                if script_config:
                    welcome_message = str(script_config.get("welcome_message") or welcome_message).strip()
                    primary_language = str(script_config.get("primary_language") or primary_language).strip()
                    voice_style = str(script_config.get("voice_style") or voice_style).strip()
                    voice_id = str(script_config.get("voice_id") or "").strip() or None
        except Exception:
            logger.exception("[VoiceService] Failed to pre-query script config for outbound call")

        # Pre-generate welcome message TTS to persistent file cache
        tts_key = ""
        if welcome_message:
            try:
                from app.services.tts_service import TTSService
                import hashlib
                
                # Generate/cache welcome audio
                TTSService.generate_alaw_8k(
                    welcome_message, voice_id=voice_id, language=primary_language, gender=voice_style
                )
                
                # Compute the exact cache key hash
                key_str = f"{welcome_message.strip()}|{voice_id or ''}|{primary_language or ''}|{voice_style or ''}"
                tts_key = hashlib.sha256(key_str.encode("utf-8")).hexdigest()
                logger.info("[VoiceService] Pre-generated welcome TTS cache with key: %s", tts_key)
            except Exception:
                logger.exception("[VoiceService] Failed to pre-generate welcome TTS audio")

        # custom_parameters max 255 chars
        custom_params_dict = {
            "kb": kb_id,
            "sid": temp_call_sid,
            "phone": to_number,
        }
        if script_id:
            custom_params_dict["sc_id"] = str(script_id)
        if tts_key:
            custom_params_dict["key"] = tts_key[:16]
        if lead_name:
            custom_params_dict["name"] = lead_name

        custom_params = json.dumps(custom_params_dict)
        if len(custom_params) > 255:
            # Fallback to minimal parameters if limit exceeded
            custom_params = json.dumps({
                "kb": kb_id, 
                "sid": temp_call_sid,
                "phone": to_number,
            })


        # VoiceLink requires wss:// for the media stream
        ws_base = base_url.replace("https://", "wss://").replace("http://", "ws://")
        websocket_url = f"{ws_base}/voice/voicelink-stream"
        webhook_url = f"{base_url}/voice/voicelink-status-callback"

        payload = {
            "did_number": did_number_clean,
            "customer_number": customer_number_clean,
            "country_code": country_code,
            "custom_parameters": custom_params,
            "websocket_url": websocket_url,
            "webhook_url": webhook_url,
        }


        headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }

        try:
            resp = requests.post(
                "https://app.voicelink.co.in/api/v1/add_lead",
                json=payload,
                headers=headers,
                timeout=15,
            )
            resp.raise_for_status()
            logger.info(
                "[VoiceLink] Lead added for %s  temp_call_sid=%s  response=%s",
                to_number,
                temp_call_sid,
                resp.text[:200],
            )
            return temp_call_sid
        except Exception:
            logger.exception("[VoiceLink] Failed to add lead for %s", to_number)
            raise

    # ─── Speech-to-Text ───────────────────────────────────────────────────────

    @staticmethod
    def transcribe(audio_file) -> str:
        """
        Transcribe audio using OpenAI Whisper.
        audio_file should be a file-like object or a path.
        """
        api_key = _get_api_key("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not configured.")

        client = OpenAI(api_key=api_key)

        try:
            if hasattr(audio_file, "seek"):
                audio_file.seek(0)

            orig_filename = (
                getattr(audio_file, "filename", "")
                or getattr(audio_file, "name", "")
                or "audio.wav"
            )
            content_type = getattr(audio_file, "content_type", "")

            ext = os.path.splitext(orig_filename)[1]
            if not ext:
                if "audio/webm" in content_type:
                    ext = ".webm"
                elif "audio/mp4" in content_type or "audio/m4a" in content_type:
                    ext = ".m4a"
                elif "audio/mpeg" in content_type:
                    ext = ".mp3"
                elif "audio/ogg" in content_type:
                    ext = ".ogg"
                else:
                    ext = ".wav"

            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=(f"audio{ext}", audio_file),
            )
            return transcript.text
        except Exception:
            logger.exception("Whisper transcription failed")
            raise

    # ─── Text-to-Speech ───────────────────────────────────────────────────────

    @staticmethod
    def synthesize(text: str) -> Tuple[bytes, str]:
        """
        Synthesize text to speech using ElevenLabs (preferred) or gTTS (fallback).
        Returns (audio_bytes, content_type).
        """
        eleven_key = _get_api_key("ELEVENLABS_API_KEY")

        voice_id = _get_api_key("ELEVENLABS_VOICE_ID")
        if not voice_id:
            if any("\u0900" <= ch <= "\u097f" for ch in text):
                voice_id = (
                    _get_api_key("ELEVENLABS_VOICE_ID_HINDI_FEMALE")
                    or _get_api_key("ELEVENLABS_VOICE_ID_HINDI_MALE")
                )
            else:
                voice_id = (
                    _get_api_key("ELEVENLABS_VOICE_ID_ENGLISH_FEMALE")
                    or _get_api_key("ELEVENLABS_VOICE_ID_ENGLISH_MALE")
                )

        if not voice_id:
            voice_id = "21m00Tcm4TlvDq8ikWAM"  # Default: Rachel

        if eleven_key:
            try:
                url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
                headers = {
                    "Accept": "audio/mpeg",
                    "Content-Type": "application/json",
                    "xi-api-key": eleven_key,
                }
                data = {
                    "text": text,
                    "model_id": _get_api_key("ELEVENLABS_TTS_MODEL") or "eleven_turbo_v2_5",
                    "voice_settings": {
                        "stability": 0.65,
                        "similarity_boost": 0.80,
                        "style": 0.35,
                        "use_speaker_boost": True,
                    },
                }
                response = requests.post(url, json=data, headers=headers)
                if response.status_code == 200:
                    return response.content, "audio/mpeg"
                logger.error(
                    "ElevenLabs API failed with status %s: %s",
                    response.status_code,
                    response.text,
                )
            except Exception:
                logger.exception("ElevenLabs synthesis failed, falling back to gTTS")

        # gTTS fallback
        try:
            detected_lang = "hi" if any("\u0900" <= ch <= "\u097f" for ch in text) else "en"
            tts = gTTS(text=text, lang=detected_lang)
            fp = io.BytesIO()
            tts.write_to_fp(fp)
            fp.seek(0)
            return fp.read(), "audio/mpeg"
        except Exception:
            logger.exception("gTTS synthesis failed")
            raise
