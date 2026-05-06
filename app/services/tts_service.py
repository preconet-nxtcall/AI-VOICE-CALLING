import os
import uuid
import logging
import requests
from pathlib import Path
from typing import Optional
from gtts import gTTS

logger = logging.getLogger(__name__)

_DEFAULT_TTS_DIR = "./tts_audio"


def _get_config(key: str) -> str:
    try:
        from flask import current_app
        val = current_app.config.get(key)
    except RuntimeError:
        val = None
    return val or os.environ.get(key, "")


class TTSService:
    @staticmethod
    def generate_audio(text: str, output_dir: Optional[str] = None) -> str:
        """Convert text to speech, save as MP3, and return the absolute file path."""
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")

        save_dir = Path(
            output_dir or _get_config("TTS_AUDIO_DIR") or _DEFAULT_TTS_DIR
        ).resolve()
        save_dir.mkdir(parents=True, exist_ok=True)

        filename = f"{uuid.uuid4().hex}.mp3"
        file_path = save_dir / filename

        eleven_key = _get_config("ELEVENLABS_API_KEY")
        if eleven_key:
            try:
                audio_bytes = TTSService._elevenlabs(text, eleven_key)
                file_path.write_bytes(audio_bytes)
                logger.info("TTS (ElevenLabs) saved: %s", file_path)
                return str(file_path)
            except Exception:
                logger.exception("ElevenLabs TTS failed, falling back to gTTS")

        try:
            tts = gTTS(text=text, lang="hi")
            tts.save(str(file_path))
            logger.info("TTS (gTTS) saved: %s", file_path)
            return str(file_path)
        except Exception:
            logger.exception("gTTS synthesis failed")
            raise

    @staticmethod
    def _elevenlabs(text: str, api_key: str) -> bytes:
        voice_id = _get_config("ELEVENLABS_VOICE_ID") or "21m00Tcm4TlvDq8ikWAM"
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        headers = {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": api_key,
        }
        payload = {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        return resp.content
