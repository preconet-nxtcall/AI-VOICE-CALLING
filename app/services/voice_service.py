import os
import logging
import io
import base64
from typing import Optional, Tuple
from openai import OpenAI
from gtts import gTTS
import requests

logger = logging.getLogger(__name__)

def _get_api_key(key_name: str) -> str:
    try:
        from flask import current_app
        key = current_app.config.get(key_name)
    except RuntimeError:
        key = None
    return key or os.environ.get(key_name, "")

class VoiceService:
    @staticmethod
    def transcribe(audio_file) -> str:
        """
        Transcribes audio using OpenAI Whisper.
        audio_file should be a file-like object or a path.
        """
        api_key = _get_api_key("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not configured.")
        
        client = OpenAI(api_key=api_key)
        
        try:
            # Ensure we're at the beginning of the file
            if hasattr(audio_file, 'seek'):
                audio_file.seek(0)

            # Determine extension from filename or content_type
            orig_filename = getattr(audio_file, 'filename', '') or getattr(audio_file, 'name', '') or 'audio.wav'
            content_type = getattr(audio_file, 'content_type', '')
            
            ext = os.path.splitext(orig_filename)[1]
            if not ext:
                if 'audio/webm' in content_type:
                    ext = '.webm'
                elif 'audio/mp4' in content_type or 'audio/m4a' in content_type:
                    ext = '.m4a'
                elif 'audio/mpeg' in content_type:
                    ext = '.mp3'
                elif 'audio/ogg' in content_type:
                    ext = '.ogg'
                else:
                    ext = '.wav'
            
            filename = f"audio{ext}"

            transcript = client.audio.transcriptions.create(
                model="whisper-1", 
                file=(filename, audio_file)
            )
            return transcript.text
        except Exception as e:
            logger.exception(f"Whisper transcription failed: {str(e)}")
            raise e

    @staticmethod
    def synthesize(text: str) -> Tuple[bytes, str]:
        """
        Synthesizes text to speech using ElevenLabs (if key available) or gTTS.
        Returns a tuple of (audio_bytes, content_type).
        """
        eleven_key = _get_api_key("ELEVENLABS_API_KEY")
        voice_id = _get_api_key("ELEVENLABS_VOICE_ID") or "21m00Tcm4TlvDq8ikWAM" # Default: Rachel
        
        if eleven_key:
            try:
                url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
                headers = {
                    "Accept": "audio/mpeg",
                    "Content-Type": "application/json",
                    "xi-api-key": eleven_key
                }
                data = {
                    "text": text,
                    "model_id": "eleven_turbo_v2", # Faster and multilingual
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75
                    }
                }
                response = requests.post(url, json=data, headers=headers)
                if response.status_code == 200:
                    return response.content, "audio/mpeg"
                else:
                    logger.error(f"ElevenLabs API failed with status {response.status_code}: {response.text}")
                    # Fallback to gTTS
            except Exception as e:
                logger.exception("ElevenLabs synthesis failed, falling back to gTTS")
        
        # Fallback to gTTS
        try:
            tts = gTTS(text=text, lang='en')
            fp = io.BytesIO()
            tts.write_to_fp(fp)
            fp.seek(0)
            return fp.read(), "audio/mpeg"
        except Exception as e:
            logger.exception("gTTS synthesis failed")
            raise e

    @staticmethod
    def make_outbound_call(to_number: str, kb_id: str) -> str:
        """
        Initiates an outbound Twilio call.
        Returns the Call SID.
        """
        account_sid = _get_api_key("TWILIO_ACCOUNT_SID")
        auth_token = _get_api_key("TWILIO_AUTH_TOKEN")
        from_number = _get_api_key("TWILIO_PHONE_NUMBER")
        
        # We assume the same PUBLIC_BASE_URL is used as in twilio_voice route.
        try:
            from flask import current_app
            base_url = current_app.config.get("PUBLIC_BASE_URL", "").strip().rstrip("/")
        except RuntimeError:
            base_url = os.environ.get("PUBLIC_BASE_URL", "").strip().rstrip("/")

        if not account_sid or not auth_token:
            raise ValueError("TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is not configured.")
        if not from_number:
            raise ValueError("TWILIO_PHONE_NUMBER is not configured for outbound calls.")
        if not base_url:
            raise ValueError("PUBLIC_BASE_URL is not configured.")

        from twilio.rest import Client
        client = Client(account_sid, auth_token)

        webhook_url = f"{base_url}/voice?kb_id={kb_id}"

        try:
            call = client.calls.create(
                to=to_number,
                from_=from_number,
                url=webhook_url,
                status_callback=f"{base_url}/voice/status-callback?kb_id={kb_id}",
                status_callback_event=["completed", "failed", "busy", "no-answer", "canceled"],
                status_callback_method="POST",
            )
            logger.info("Initiated outbound call to %s. SID: %s", to_number, call.sid)
            return call.sid
        except Exception as e:
            logger.exception("Failed to initiate outbound call to %s: %s", to_number, str(e))
            raise e

