import logging
import os
import shutil
from pathlib import Path
from typing import Optional

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document as LCDocument

logger = logging.getLogger(__name__)

_DEFAULT_CHUNK_SIZE = 500
_DEFAULT_CHUNK_OVERLAP = 50


def _get_openai_api_key() -> str:
    try:
        from flask import current_app
        key = current_app.config.get("OPENAI_API_KEY")
    except RuntimeError:
        key = None
    return key or os.environ.get("OPENAI_API_KEY", "")


def _get_index_base_dir() -> str:
    try:
        from flask import current_app
        base = current_app.config.get("FAISS_INDEX_DIR")
    except RuntimeError:
        base = None
    return base or os.environ.get("FAISS_INDEX_DIR", "./faiss_indices")


def _embeddings() -> OpenAIEmbeddings:
    api_key = _get_openai_api_key()
    if not api_key:
        raise ValueError(
            "OPENAI_API_KEY is not configured. "
            "Set it in your .env file or environment."
        )
    return OpenAIEmbeddings(model="text-embedding-3-small", openai_api_key=api_key)


def _index_path(knowledge_base_id: str) -> Path:
    path = Path(_get_index_base_dir()) / str(knowledge_base_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


class EmbeddingService:
    """
    RAG pipeline: chunk text → OpenAI embeddings → FAISS vector store.

    One FAISS index is maintained per knowledge base and stored on disk
    so it survives restarts.
    """

    @staticmethod
    def chunk_text(
        text: str,
        document_id: str,
        filename: str,
        chunk_size: int = _DEFAULT_CHUNK_SIZE,
        chunk_overlap: int = _DEFAULT_CHUNK_OVERLAP,
    ) -> list[LCDocument]:
        """
        Split *text* into overlapping chunks.

        Returns a list of LangChain Documents, each carrying metadata with
        ``document_id``, ``filename``, ``chunk_index``, and ``total_chunks``.
        """
        if not text or not text.strip():
            return []

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )
        raw_chunks = splitter.split_text(text)
        total = len(raw_chunks)

        return [
            LCDocument(
                page_content=chunk,
                metadata={
                    "document_id": str(document_id),
                    "filename": filename,
                    "chunk_index": idx,
                    "total_chunks": total,
                },
            )
            for idx, chunk in enumerate(raw_chunks)
        ]

    @staticmethod
    def save_index(knowledge_base_id: str, vectorstore: FAISS) -> None:
        """Persist a FAISS vector store to disk."""
        path = _index_path(knowledge_base_id)
        vectorstore.save_local(str(path))
        logger.info("Saved FAISS index for KB %s → %s", knowledge_base_id, path)

    @staticmethod
    def load_index(knowledge_base_id: str) -> Optional[FAISS]:
        """
        Load a FAISS vector store from disk.

        Returns ``None`` when no index exists yet for this knowledge base.
        """
        path = _index_path(knowledge_base_id)
        if not (path / "index.faiss").exists():
            return None
        try:
            store = FAISS.load_local(
                str(path),
                _embeddings(),
                allow_dangerous_deserialization=True,
            )
            logger.info("Loaded FAISS index for KB %s", knowledge_base_id)
            return store
        except Exception:
            logger.exception("Failed to load FAISS index for KB %s", knowledge_base_id)
            return None

    @staticmethod
    def add_documents(
        knowledge_base_id: str,
        lc_documents: list[LCDocument],
    ) -> int:
        """
        Embed *lc_documents* and merge them into the knowledge base index.

        Creates a new index if none exists.  Returns the number of chunks added.
        """
        if not lc_documents:
            return 0

        emb = _embeddings()
        existing = EmbeddingService.load_index(knowledge_base_id)

        if existing is None:
            store = FAISS.from_documents(lc_documents, emb)
        else:
            existing.add_documents(lc_documents)
            store = existing

        EmbeddingService.save_index(knowledge_base_id, store)
        logger.info(
            "Added %d chunks to KB %s index", len(lc_documents), knowledge_base_id
        )
        return len(lc_documents)

    @staticmethod
    def embed_document(
        knowledge_base_id: str,
        document_id: str,
        filename: str,
        text: str,
        chunk_size: int = _DEFAULT_CHUNK_SIZE,
        chunk_overlap: int = _DEFAULT_CHUNK_OVERLAP,
    ) -> int:
        """
        Full RAG ingestion pipeline for one document.

        Steps: chunk → embed → store in FAISS → save to disk.
        Returns the number of chunks stored.
        """
        chunks = EmbeddingService.chunk_text(
            text, document_id, filename, chunk_size, chunk_overlap
        )
        if not chunks:
            logger.warning("No chunks produced for document %s", document_id)
            return 0
        return EmbeddingService.add_documents(knowledge_base_id, chunks)

    @staticmethod
    def similarity_search(
        knowledge_base_id: str,
        query: str,
        k: int = 5,
        filter: Optional[dict] = None
    ) -> list[dict]:
        """
        Return the *k* most relevant chunks for *query* in this knowledge base.

        When a ``filter`` dict is provided (e.g. ``{"document_id": "<uuid>"}``),
        we fetch a larger candidate pool and apply the filter in Python.
        FAISS native metadata filtering is unreliable for UUID string comparisons
        and often returns empty results even when matching documents exist.

        Each result dict contains: ``text``, ``score``, ``document_id``,
        ``filename``, ``chunk_index``.
        Returns an empty list when no index exists.
        """
        store = EmbeddingService.load_index(knowledge_base_id)
        if store is None:
            return []

        if filter:
            # Use native FAISS filtering for reliability and performance.
            # This ensures we only search within the specific document(s) if a filter is provided.
            try:
                results = store.similarity_search_with_score(query, k=k, filter=filter)
            except Exception as e:
                logger.error(f"Native FAISS filter failed: {e}. Falling back to global search.")
                results = store.similarity_search_with_score(query, k=k)
        else:
            results = store.similarity_search_with_score(query, k=k)

        return [
            {
                "text": doc.page_content,
                "score": float(score),
                "document_id": doc.metadata.get("document_id"),
                "filename": doc.metadata.get("filename"),
                "chunk_index": doc.metadata.get("chunk_index"),
            }
            for doc, score in results
        ]

    @staticmethod
    def delete_document_chunks(knowledge_base_id: str, document_id: str) -> bool:
        """
        Remove all chunks belonging to *document_id* from the FAISS index.

        Returns ``True`` when the index was modified, ``False`` when no index exists.
        """
        store = EmbeddingService.load_index(knowledge_base_id)
        if store is None:
            return False

        ids_to_delete = [
            uid for uid, doc in store.docstore._dict.items()
            if doc.metadata.get("document_id") == str(document_id)
        ]

        path = _index_path(knowledge_base_id)

        if not ids_to_delete:
            return False

        if len(ids_to_delete) == len(store.docstore._dict):
            shutil.rmtree(str(path), ignore_errors=True)
            logger.info(
                "Cleared FAISS index for KB %s (removed last document)", knowledge_base_id
            )
            return True

        store.delete(ids_to_delete)
        store.save_local(str(path))
        logger.info(
            "Deleted %d chunks from FAISS index for KB %s (document %s)",
            len(ids_to_delete),
            knowledge_base_id,
            document_id,
        )
        return True

    @staticmethod
    def delete_index(knowledge_base_id: str) -> bool:
        """
        Completely remove the FAISS index directory for a knowledge base.
        Returns ``True`` if the index existed and was deleted, ``False`` otherwise.
        """
        path = _index_path(knowledge_base_id)
        if path.exists():
            shutil.rmtree(str(path), ignore_errors=True)
            logger.info("Deleted FAISS index directory for KB %s", knowledge_base_id)
            return True
        return False
