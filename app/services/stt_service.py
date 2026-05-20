import os
import logging
from pathlib import Path
from typing import Optional
from openai import OpenAI

logger = logging.getLogger(__name__)

# Whisper telephony prompt — primes Whisper with domain context so it handles
# compressed 8 kHz phone audio much more accurately.
_WHISPER_TELEPHONY_PROMPT = (
    "This is a phone conversation between a customer and a sales support agent. "
    "The caller may discuss products, pricing, plans, appointments, or customer support. "
    "Transcribe every word accurately, including brand names and numbers."
)


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

        Supported languages: Hindi, English, Auto-Detect.

        Args:
            audio_path: Absolute path to the audio file on disk.
            language:   'Hindi', 'English', or 'Auto-Detect' (default).

        Returns:
            Transcribed text string (empty string if nothing was captured).
        """
        api_key = _get_openai_key()
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not configured.")

        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        client = OpenAI(api_key=api_key)

        # ── Language → ISO 639-1 (only Hindi and English supported) ──────────
        # Passing None lets Whisper auto-detect — used for 'Auto-Detect' mode.
        lang_code: Optional[str] = None
        if language:
            l_up = language.upper().strip()
            if "HINDI" in l_up:
                lang_code = "hi"
            elif "ENGLISH" in l_up:
                lang_code = "en"
            # Any other value (Auto-Detect, None, empty) → keep None (auto)

        try:
            with audio_path.open("rb") as fh:
                kwargs: dict = {
                    "model": "whisper-1",
                    "file": (audio_path.name, fh),
                    # Telephony prompt drastically improves accuracy on 8 kHz phone audio
                    "prompt": _WHISPER_TELEPHONY_PROMPT,
                }
                if lang_code:
                    kwargs["language"] = lang_code  # only pass when explicitly known
                response = client.audio.transcriptions.create(**kwargs)

            text = (response.text or "").strip()
            logger.info(
                "STT [%s lang=%s]: %.200s",
                audio_path.name, lang_code or "auto-detect", text
            )
            return text
        except Exception:
            logger.exception("STT transcription failed for file: %s", audio_path)
            raise
