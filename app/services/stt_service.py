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
            language: Language hint (e.g. 'Hindi', 'English', 'Auto-Detect').
                      Pass None or 'Auto-Detect' to let Whisper auto-detect.

        Returns:
            Transcribed text string.
        """
        api_key = _get_openai_key()
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not configured.")

        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        client = OpenAI(api_key=api_key)

        # Map display name to ISO 639-1 code.
        # Pass None to let Whisper auto-detect (handles Auto-Detect and unknown values).
        lang_code: Optional[str] = None
        if language:
            l_up = language.upper().strip()
            if "ENGLISH" in l_up:
                lang_code = "en"
            elif "HINDI" in l_up:
                lang_code = "hi"
            # "Auto-Detect", empty, or unknown → keep None so Whisper auto-detects

        try:
            with audio_path.open("rb") as fh:
                kwargs = {
                    "model": "whisper-1",
                    "file": (audio_path.name, fh),
                }
                if lang_code:
                    kwargs["language"] = lang_code  # only pass when explicit
                response = client.audio.transcriptions.create(**kwargs)
            text = (response.text or "").strip()
            logger.info("Transcription [%s lang=%s]: %.200s", audio_path.name, lang_code or "auto", text)
            return text
        except Exception:
            logger.exception("STT transcription failed for file: %s", audio_path)
            raise
