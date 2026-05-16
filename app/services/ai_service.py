import os
import logging
import json
import re
from collections import defaultdict, deque
from datetime import datetime, timedelta
from threading import Lock
from typing import Any, Deque, Dict, List, Optional
from openai import OpenAI

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "You are a professional AI voice assistant on a live phone call. "
    "PERSONALITY: Friendly, confident, and natural — never robotic. Speak like a real human agent, not a chatbot. "
    "RULES: Never use markdown, bullet points, numbers, or any formatting. Keep every response under 2 sentences. "
    "Never say 'As an AI' or 'I am a language model'. Never repeat the same phrase twice in a row. "
    "LANGUAGE: Use simple, conversational Hindi and English. Avoid technical jargon. "
    "If unsure, say: 'Let me check that for you.' Always use the caller's name if you know it. "
    "ROLE: You are a sales agent for NxtCall, helping businesses set up AI-powered calling campaigns."
)
_MAX_TOKENS = 120  # headroom for 2 complete sentences without mid-sentence cut-off
_MAX_MEMORY_MESSAGES = 10  # 5 turns: User, AI, User, AI, User, AI, User, AI, User, AI
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
        primary_language: str = "English",
        secondary_language: Optional[str] = None,
        script_prompt: Optional[str] = None,
    ) -> str:
        """
        Generate a short conversational reply from user speech text.

        Returns:
            A short reply (max 2 sentences) suitable for voice playback.
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

        # Construct the specialized system instructions for multi-language
        # Filter out 'None' string from frontend
        s_lang = secondary_language if secondary_language and secondary_language.lower() != "none" else None
        
        if primary_language == "Auto-Detect":
            lang_instruction = "Respond in the same language the user speaks in (Auto-Detect mode). "
        else:
            lang_instruction = f"Primary language is {primary_language}. "
            
        if s_lang:
            lang_instruction += f"Secondary language is {s_lang}. Understand and respond in both naturally. "
        elif primary_language != "Auto-Detect":
            lang_instruction += f"Always respond in {primary_language}. "
            
        if "HINDI" in [primary_language.upper(), (s_lang or "").upper()]:
            lang_instruction += "If responding in Hindi, use Devanagari script. "

        script_instruction = (script_prompt or "").strip()
        if script_instruction:
            full_system_prompt = (
                f"{_SYSTEM_PROMPT}\n\n"
                f"{lang_instruction}\n"
                "Follow these campaign-specific instructions:\n"
                f"{script_instruction}"
            )
        else:
            full_system_prompt = f"{_SYSTEM_PROMPT}\n\n{lang_instruction}"

        if not user_text or not user_text.strip():
            return "Hello? Are you still there?"

        try:
            # For voice calls, we still want short replies, but gpt-4o is better at nuances
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": full_system_prompt},
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

        # Only prune by count if we exceed the limit by 10% to avoid sorting too often
        if len(_CALL_LAST_SEEN) <= int(_MAX_ACTIVE_CONVERSATIONS * 1.1):
            return

        # Drop oldest conversations first to enforce hard cap back to 100%
        oldest_ids = sorted(_CALL_LAST_SEEN, key=_CALL_LAST_SEEN.get)[
            : len(_CALL_LAST_SEEN) - _MAX_ACTIVE_CONVERSATIONS
        ]
        for cid in oldest_ids:
            _CALL_LAST_SEEN.pop(cid, None)
            _CALL_MEMORY.pop(cid, None)

    @staticmethod
    def analyze_transcript_for_tags(
        transcript: str,
        script_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Analyze call transcript and return lead tags + handoff intent.
        """
        script_config = script_config or {}
        tag_options = AIService._extract_tag_options(script_config)
        handoff_triggers = [str(x).strip().lower() for x in (script_config.get("handoff_triggers") or []) if str(x).strip()]
        handoff_number = str(script_config.get("handoff_number") or "").strip()
        text = (transcript or "").strip()

        if not text:
            return {"tags": {"call_outcome": "no_transcript"}, "should_handoff": False, "handoff_reason": ""}

        try:
            ai_result = AIService._analyze_with_llm(text, tag_options, handoff_triggers, bool(handoff_number))
            if ai_result:
                return ai_result
        except Exception:
            logger.exception("Transcript AI analysis failed; using keyword fallback")

        return AIService._analyze_with_keywords(text, tag_options, handoff_triggers, bool(handoff_number))

    @staticmethod
    def _analyze_with_llm(
        transcript: str,
        tag_options: List[str],
        handoff_triggers: List[str],
        has_handoff_number: bool,
    ) -> Optional[Dict[str, Any]]:
        api_key = _get_openai_key()
        if not api_key:
            return None

        client = OpenAI(api_key=api_key)
        prompt = (
            "You are a professional sales lead classifier for a CRM.\n"
            f"Allowed lead tags: {tag_options or ['interested', 'not_interested', 'follow_up', 'invalid_number']}.\n"
            f"Handoff trigger hints: {handoff_triggers or ['human', 'agent', 'manager']}.\n"
            "SPECIAL TASKS:\n"
            "1. Detect if the user explicitly wants to book a meeting, demo, or appointment.\n"
            "2. Detect if the user requested to speak with a human/manager (handoff).\n"
            "Return strict JSON with keys:\n"
            "- tags: (object) current lead tags\n"
            "- should_handoff: (boolean) true if human agent requested\n"
            "- handoff_reason: (string) specific reason for handoff\n"
            "- appointment_detected: (boolean) true if a date/time or meeting request was mentioned\n"
            "- appointment_details: (string) the mentioned date/time/purpose if found\n\n"
            f"Transcript:\n{transcript}"
        )

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a precise sales lead analyzer. Extract tags and appointment intents."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=300,
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        content = (response.choices[0].message.content or "").strip() if response.choices else ""
        if not content:
            return None

        parsed = AIService._parse_json_object(content)
        if not parsed:
            return None

        tags = parsed.get("tags") if isinstance(parsed.get("tags"), dict) else {}
        # Auto-inject appointment tag if detected
        if parsed.get("appointment_detected"):
            tags["appointment_status"] = "requested"
            tags["appointment_info"] = str(parsed.get("appointment_details") or "Requested but no specific time").strip()

        return {
            "tags": tags or {"call_outcome": "unknown"},
            "should_handoff": bool(parsed.get("should_handoff")) and has_handoff_number,
            "handoff_reason": str(parsed.get("handoff_reason") or "").strip(),
            "appointment_detected": bool(parsed.get("appointment_detected")),
            "appointment_details": str(parsed.get("appointment_details") or "").strip()
        }

    @staticmethod
    def _analyze_with_keywords(
        transcript: str,
        tag_options: List[str],
        handoff_triggers: List[str],
        has_handoff_number: bool,
    ) -> Dict[str, Any]:
        lowered = transcript.lower()
        tags: Dict[str, str] = {}

        if any(w in lowered for w in ["interested", "haan", "yes", "buy", "pricing"]):
            tags["intent"] = "interested"
        elif any(w in lowered for w in ["not interested", "nahi", "no thanks", "stop calling"]):
            tags["intent"] = "not_interested"
        else:
            tags["intent"] = "neutral"

        if any(w in lowered for w in ["later", "tomorrow", "next week", "callback"]):
            tags["follow_up"] = "required"

        if tag_options:
            tags["allowed_tags"] = ",".join(tag_options[:8])

        should_handoff = has_handoff_number and any(t and t in lowered for t in handoff_triggers)
        if not handoff_triggers:
            should_handoff = has_handoff_number and any(k in lowered for k in ["human", "agent", "manager", "representative"])

        # Appointment keyword detection
        appointment_keywords = [
            "meeting", "appointment", "demo", "schedule", "book", "call me back",
            "milna", "baat karna", "samay", "waqt", "kal", "parso", "monday", "tuesday", 
            "wednesday", "thursday", "friday", "saturday", "sunday", "morning", "evening"
        ]
        appointment_detected = any(k in lowered for k in appointment_keywords)
        if appointment_detected:
            tags["appointment_intent"] = "detected_via_keywords"

        return {
            "tags": tags,
            "should_handoff": should_handoff,
            "handoff_reason": "trigger_keyword_match" if should_handoff else "",
            "appointment_detected": appointment_detected,
            "appointment_details": "Detected via keywords" if appointment_detected else ""
        }

    @staticmethod
    def _extract_tag_options(script_config: Dict[str, Any]) -> List[str]:
        tag_options: List[str] = []
        for key in ("lead_tags", "tags", "tag_options"):
            raw = script_config.get(key)
            if isinstance(raw, list):
                for item in raw:
                    if isinstance(item, str) and item.strip():
                        tag_options.append(item.strip())
                    elif isinstance(item, dict):
                        tag = str(item.get("tag") or item.get("name") or "").strip()
                        if tag:
                            tag_options.append(tag)
        seen = set()
        deduped = []
        for tag in tag_options:
            if tag.lower() not in seen:
                deduped.append(tag)
                seen.add(tag.lower())
        return deduped

    @staticmethod
    def _parse_json_object(raw: str) -> Optional[Dict[str, Any]]:
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            pass
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None

    @staticmethod
    def analyze_post_call(transcript: str) -> Dict[str, str]:
        """
        Post-call analytics for CRM:
        - sentiment: Positive | Angry | Neutral
        - lead_intent: Highly Interested | Interested | Not Interested | Neutral
        - call_summary: one-sentence summary
        """
        text = (transcript or "").strip()
        if not text:
            return {
                "sentiment": "Neutral",
                "lead_intent": "Neutral",
                "call_summary": "No meaningful transcript was captured.",
            }

        api_key = _get_openai_key()
        if api_key:
            try:
                client = OpenAI(api_key=api_key)
                prompt = (
                    "Analyze this phone call transcript for sales lead scoring.\n"
                    "Return strict JSON with keys:\n"
                    "- sentiment: one of [Positive, Angry, Neutral]\n"
                    "- lead_intent: one of [Highly Interested, Interested, Not Interested, Neutral]\n"
                    "- appointment_detected: boolean\n"
                    "- appointment_info: string (details of any scheduled demo or meeting)\n"
                    "- call_summary: exactly one sentence, concise.\n\n"
                    "Rules:\n"
                    "1) If customer asks about pricing/cost/plan/availability/stock/delivery timeline, "
                    "lead_intent should be Highly Interested unless clearly rejecting.\n"
                    "2) Keep outputs business-friendly and factual.\n\n"
                    f"Transcript:\n{text}"
                )
                resp = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": "You are a precise call analytics engine."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.1,
                    response_format={"type": "json_object"},
                    max_tokens=220,
                )
                content = (resp.choices[0].message.content or "").strip() if resp.choices else ""
                parsed = AIService._parse_json_object(content) if content else None
                if isinstance(parsed, dict):
                    sentiment = str(parsed.get("sentiment") or "Neutral").strip().title()
                    if sentiment not in {"Positive", "Angry", "Neutral"}:
                        sentiment = "Neutral"

                    lead_intent = str(parsed.get("lead_intent") or "Neutral").strip()
                    if lead_intent not in {"Highly Interested", "Interested", "Not Interested", "Neutral"}:
                        lead_intent = "Neutral"

                    summary = str(parsed.get("call_summary") or "").strip()
                    if not summary:
                        summary = "Customer and assistant discussed the inquiry with no clear final outcome."
                    
                    # Add appointment info to summary if detected
                    if parsed.get("appointment_detected"):
                        summary = f"{summary.rstrip('.')} (Appointment: {parsed.get('appointment_info')})."

                    return {
                        "sentiment": sentiment,
                        "lead_intent": lead_intent,
                        "call_summary": summary,
                        "appointment_detected": bool(parsed.get("appointment_detected")),
                        "appointment_info": str(parsed.get("appointment_info") or "")
                    }
            except Exception:
                logger.exception("Post-call LLM analytics failed; using keyword fallback")

        lowered = text.lower()
        if any(w in lowered for w in ["angry", "upset", "frustrated", "stop calling", "annoyed"]):
            sentiment = "Angry"
        elif any(w in lowered for w in ["thank", "great", "good", "interested", "yes"]):
            sentiment = "Positive"
        else:
            sentiment = "Neutral"

        highly_interested_terms = [
            "price", "pricing", "cost", "plan", "availability", "available", "stock", "delivery",
            "quote", "discount", "when can", "how soon",
        ]
        if any(w in lowered for w in ["not interested", "no thanks", "don't call", "do not call"]):
            lead_intent = "Not Interested"
        elif any(w in lowered for w in highly_interested_terms):
            lead_intent = "Highly Interested"
        elif any(w in lowered for w in ["interested", "tell me more", "follow up", "callback"]):
            lead_intent = "Interested"
        else:
            lead_intent = "Neutral"

        return {
            "sentiment": sentiment,
            "lead_intent": lead_intent,
            "call_summary": "Customer and assistant discussed the request; review transcript for full context.",
        }
