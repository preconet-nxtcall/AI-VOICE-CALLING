import os
import logging
from pathlib import Path
from typing import Optional
from openai import OpenAI

logger = logging.getLogger(__name__)


def _get_openai_key() -> str:
    try:
        from flask import current_app
        key = current_app.config.get("OPENAI_API_KEY")
    except RuntimeError:
        key = None
    return key or os.environ.get("OPENAI_API_KEY", "")


class STTService:
    @staticmethod
    def transcribe_file(audio_path: Path, language: Optional[str] = None) -> str:
        """
        Transcribe a saved audio file using OpenAI Whisper.

        Args:
            audio_path: Absolute path to the audio file on disk.
            language: Language hint (e.g. 'Hindi', 'English').

        Returns:
            Transcribed text string.
        """
        api_key = _get_openai_key()
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not configured.")

        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        client = OpenAI(api_key=api_key)

        # Map display name to ISO code
        lang_code = "hi"  # default
        if language:
            l_up = language.upper()
            if "ENGLISH" in l_up:
                lang_code = "en"
            elif "HINDI" in l_up:
                lang_code = "hi"

        try:
            with audio_path.open("rb") as fh:
                response = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=(audio_path.name, fh),
                    language=lang_code
                )
            text = (response.text or "").strip()
            logger.info("Transcription [%s]: %.200s", audio_path.name, text)
            return text
        except Exception:
            logger.exception("STT transcription failed for file: %s", audio_path)
            raise
