import logging
import os
import json
from typing import Dict, Any

from app.services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)

def _get_openai_api_key() -> str:
    try:
        from flask import current_app
        key = current_app.config.get("OPENAI_API_KEY")
    except RuntimeError:
        key = None
    return key or os.environ.get("OPENAI_API_KEY", "")

class AgentService:
    @staticmethod
    def ask(knowledge_base_id: str, query: str, document_id: str = None, mode: str = "chat", history: list = None) -> Dict[str, Any]:
        """
        Answers a user query using RAG over the specified knowledge base.
        :param knowledge_base_id: UUID of the knowledge base.
        :param query: User's question.
        :param document_id: Optional UUID of a specific document to restrict context to.
        :param mode: 'chat' for text (respond in user's language) or 'voice' for Hindi voice calls.
        :param history: Optional list of previous messages [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
        """
        # 1. Build search filter
        search_filter = None
        if document_id:
            search_filter = {"document_id": str(document_id)}
            
        # 2. Retrieve similar chunks
        chunks = EmbeddingService.hybrid_search(
            knowledge_base_id, 
            query, 
            k=5, 
            filter=search_filter
        )
        
        if not chunks:
            return {
                "answer": "No information found in the selected knowledge base to answer your query. Please upload some documents first.",
                "language_code": "en",
                "context_used": []
            }
            
        # 2. Format context
        context_texts = []
        context_used = []
        for chunk in chunks:
            context_texts.append(f"--- Document: {chunk['filename']} ---\n{chunk['text']}\n")
            context_used.append({
                "document_id": chunk.get("document_id"),
                "filename": chunk.get("filename"),
                "text": chunk.get("text"),
                "score": chunk.get("score")
            })
            
        combined_context = "\n".join(context_texts)
        
        # 3. Call OpenAI Chat API
        from openai import OpenAI
        api_key = _get_openai_api_key()
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not configured.")
            
        client = OpenAI(api_key=api_key)
        
        if mode == "voice":
            system_prompt = (
                "You are a helpful AI voice assistant. You answer user queries based primarily on the provided context. "
                "IMPORTANT: Respond in the user's spoken language or as requested. "
                "Keep responses concise and natural for spoken conversation (2-3 sentences max). "
                "Do not make up information. "
                "Return your response in JSON format: {\"answer\": \"...\", \"language_code\": \"...\"} "
                "where language_code is the ISO 639-1 code of the response (e.g., 'hi', 'en', 'es')."
            )
        else:
            system_prompt = (
                "You are a helpful AI assistant. Answer user queries based on the provided context from their knowledge base documents. "
                "Respond in the same language the user writes in. "
                "Be clear, accurate, and helpful. If the answer is not in the context, say so honestly. "
                "Do not make up information. "
                "Return your response in JSON format: {\"answer\": \"...\", \"language_code\": \"...\"} "
                "where language_code is the ISO 639-1 code of the response (e.g., 'hi', 'en', 'es')."
            )
        
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add history if available
        if history:
            # Only take the last 6 messages to avoid context bloat
            for h in history[-6:]:
                messages.append({
                    "role": h.get("role", "user"),
                    "content": h.get("content", "")
                })
        
        user_message = f"Context Information:\n{combined_context}\n\nUser Query: {query}"
        messages.append({"role": "user", "content": user_message})
        
        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                temperature=0.2,
                response_format={"type": "json_object"}
            )
            raw_content = response.choices[0].message.content
            res_data = json.loads(raw_content)
            answer = res_data.get("answer", "")
            detected_lang = res_data.get("language_code", "en")
        except Exception as e:
            logger.exception("Failed to generate answer from OpenAI")
            raise e
            
        return {
            "answer": answer,
            "language_code": detected_lang,
            "context_used": context_used
        }
