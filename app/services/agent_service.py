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
    def ask(knowledge_base_id: str, query: str, document_id: str = None, mode: str = "chat") -> Dict[str, Any]:
        """
        Answers a user query using RAG over the specified knowledge base.
        :param knowledge_base_id: UUID of the knowledge base.
        :param query: User's question.
        :param document_id: Optional UUID of a specific document to restrict context to.
        :param mode: 'chat' for text (respond in user's language) or 'voice' for Hindi voice calls.
        """
        # 1. Build search filter
        search_filter = None
        if document_id:
            search_filter = {"document_id": str(document_id)}
            
        # 2. Retrieve similar chunks
        chunks = EmbeddingService.similarity_search(
            knowledge_base_id, 
            query, 
            k=5, 
            filter=search_filter
        )
        
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
        
        if mode == "voice":
            system_prompt = (
                "You are a helpful AI voice assistant. You answer user queries based primarily on the provided context. "
                "IMPORTANT: Always respond in Hindi (Devanagari script) — this is a Hindi voice call. "
                "Keep responses concise and natural for spoken conversation (2-3 sentences max). "
                "If the answer is not contained within the context, politely say so in Hindi. "
                "Do not make up information."
            )
        else:
            system_prompt = (
                "You are a helpful AI assistant. Answer user queries based on the provided context from their knowledge base documents. "
                "Respond in the same language the user writes in. "
                "Be clear, accurate, and helpful. If the answer is not in the context, say so honestly. "
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
