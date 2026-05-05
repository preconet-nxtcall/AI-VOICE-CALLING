import os
import logging
from collections import defaultdict, deque
from datetime import datetime, timedelta
from threading import Lock
from typing import Deque, Dict, List, Optional
from openai import OpenAI

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "You are a helpful voice assistant. "
    "Use the conversation history to keep replies contextual and natural. "
    "Reply in at most 2 short sentences."
)
_MAX_TOKENS = 120  # headroom for 2 complete sentences without mid-sentence cut-off
_MAX_MEMORY_MESSAGES = 6  # 3 turns: User, AI, User, AI, User, AI
_MAX_ACTIVE_CONVERSATIONS = 5000
_MEMORY_TTL_MINUTES = 30

_CALL_MEMORY: Dict[str, Deque[str]] = defaultdict(
    lambda: deque(maxlen=_MAX_MEMORY_MESSAGES)
)
_CALL_LAST_SEEN: Dict[str, datetime] = {}
_MEMORY_LOCK = Lock()


def _get_openai_key() -> str:
    try:
        from flask import current_app
        key = current_app.config.get("OPENAI_API_KEY")
    except (RuntimeError, ImportError):
        key = None
    return key or os.environ.get("OPENAI_API_KEY", "")


class AIService:
    @staticmethod
    def generate_reply(
        user_text: str,
        conversation_id: Optional[str] = None,
        knowledge_context: Optional[str] = None,
    ) -> str:
        """
        Generate a short conversational reply from user speech text.

        Returns:
            A short reply (max 2 sentences) suitable for voice playback.

        Raises:
            ValueError: If OPENAI_API_KEY is not configured or the model
                        returns no usable content.
        """
        api_key = _get_openai_key()
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not configured.")

        client = OpenAI(api_key=api_key)

        history_block = AIService._history_text(conversation_id)
        context_block = (knowledge_context or "").strip()

        prompt_parts: List[str] = []
        if history_block:
            prompt_parts.append(f"Conversation history:\n{history_block}")
        if context_block:
            prompt_parts.append(f"Knowledge context:\n{context_block}")
        prompt_parts.append(f"User: {user_text.strip()}")

        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": "\n\n".join(prompt_parts)},
                ],
                max_tokens=_MAX_TOKENS,
                temperature=0.7,
            )
        except Exception:
            logger.exception("AI completion request failed")
            raise

        if not response.choices:
            raise ValueError("OpenAI returned no choices in the response.")

        choice = response.choices[0]

        if choice.finish_reason == "length":
            logger.warning(
                "AI reply was truncated at token limit (%d); consider raising _MAX_TOKENS",
                _MAX_TOKENS,
            )

        content = choice.message.content
        if content is None:
            raise ValueError(
                "OpenAI returned None content (finish_reason=%r).", choice.finish_reason
            )

        reply = content.strip()
        AIService._append_memory(conversation_id, user_text, reply)
        logger.info("AI reply: %s", reply)
        return reply

    @staticmethod
    def _history_text(conversation_id: Optional[str]) -> str:
        if not conversation_id:
            return ""
        with _MEMORY_LOCK:
            AIService._prune_memory_locked()
            history = list(_CALL_MEMORY.get(conversation_id, []))
            if history:
                _CALL_LAST_SEEN[conversation_id] = datetime.utcnow()
        return "\n".join(history)

    @staticmethod
    def _append_memory(conversation_id: Optional[str], user_text: str, ai_text: str) -> None:
        if not conversation_id:
            return
        user_line = f"User: {user_text.strip()}"
        ai_line = f"AI: {ai_text.strip()}"
        with _MEMORY_LOCK:
            AIService._prune_memory_locked()
            bucket = _CALL_MEMORY[conversation_id]
            bucket.append(user_line)
            bucket.append(ai_line)
            _CALL_LAST_SEEN[conversation_id] = datetime.utcnow()

    @staticmethod
    def _prune_memory_locked() -> None:
        """Prune expired or excess in-memory conversations (lock must be held)."""
        now = datetime.utcnow()
        cutoff = now - timedelta(minutes=_MEMORY_TTL_MINUTES)

        expired_ids = [cid for cid, seen_at in _CALL_LAST_SEEN.items() if seen_at < cutoff]
        for cid in expired_ids:
            _CALL_LAST_SEEN.pop(cid, None)
            _CALL_MEMORY.pop(cid, None)

        if len(_CALL_LAST_SEEN) <= _MAX_ACTIVE_CONVERSATIONS:
            return

        # Drop oldest conversations first to enforce hard cap.
        oldest_ids = sorted(_CALL_LAST_SEEN, key=_CALL_LAST_SEEN.get)[
            : len(_CALL_LAST_SEEN) - _MAX_ACTIVE_CONVERSATIONS
        ]
        for cid in oldest_ids:
            _CALL_LAST_SEEN.pop(cid, None)
            _CALL_MEMORY.pop(cid, None)
