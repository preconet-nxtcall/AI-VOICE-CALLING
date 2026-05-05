import logging
from typing import Dict, Any
import os

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
    def ask(knowledge_base_id: str, query: str) -> Dict[str, Any]:
        """
        Answers a user query using RAG over the specified knowledge base.
        """
        # 1. Retrieve similar chunks
        chunks = EmbeddingService.similarity_search(knowledge_base_id, query, k=5)
        
        if not chunks:
            return {
                "answer": "No information found in the selected knowledge base to answer your query. Please upload some documents first.",
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
        
        system_prompt = (
            "You are a helpful AI assistant. You answer user queries based primarily on the provided context. "
            "If the answer is not contained within the context, answer politely that you don't know based on the provided documents. "
            "Do not make up information."
        )
        
        user_message = f"Context Information:\n{combined_context}\n\nUser Query: {query}\n\nAnswer:"
        
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                temperature=0.2,
            )
            answer = response.choices[0].message.content
        except Exception as e:
            logger.exception("Failed to generate answer from OpenAI")
            raise e
            
        return {
            "answer": answer,
            "context_used": context_used
        }
