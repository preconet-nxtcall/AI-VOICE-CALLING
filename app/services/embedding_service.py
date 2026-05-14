import logging
import os
import shutil
import math
import re
import json
from pathlib import Path
from typing import Optional

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document as LCDocument
from openai import OpenAI

logger = logging.getLogger(__name__)

_DEFAULT_CHUNK_SIZE = 500
_DEFAULT_CHUNK_OVERLAP = 50
_TOKEN_RE = re.compile(r"[A-Za-z0-9_]+")


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


def _openai_client() -> OpenAI:
    api_key = _get_openai_api_key()
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not configured.")
    return OpenAI(api_key=api_key)


def _tokenize(text: str) -> list[str]:
    return [tok.lower() for tok in _TOKEN_RE.findall(text or "")]


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
            # FAISS native metadata filtering can be unreliable for string/UUID comparisons in some versions.
            # We fetch a larger candidate pool (e.g. 50 chunks) and filter in Python to ensure 
            # we don't miss matching chunks, then take the top k.
            raw_results = store.similarity_search_with_score(query, k=50)
            
            # Apply filter
            filtered_results = []
            for doc, score in raw_results:
                match = True
                for key, val in filter.items():
                    if str(doc.metadata.get(key)) != str(val):
                        match = False
                        break
                if match:
                    filtered_results.append((doc, score))
            
            # Take top k
            results = filtered_results[:k]
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
    def _keyword_scores(query: str, candidate_texts: list[str]) -> list[float]:
        """
        Lightweight BM25-style keyword scoring over candidate chunks.
        """
        q_tokens = _tokenize(query)
        if not q_tokens or not candidate_texts:
            return [0.0 for _ in candidate_texts]

        docs_tokens = [_tokenize(t) for t in candidate_texts]
        doc_lens = [len(toks) for toks in docs_tokens]
        avgdl = (sum(doc_lens) / len(doc_lens)) if doc_lens else 1.0
        avgdl = max(avgdl, 1.0)
        n_docs = len(docs_tokens)

        df: dict[str, int] = {}
        for toks in docs_tokens:
            seen = set(toks)
            for tok in seen:
                df[tok] = df.get(tok, 0) + 1

        # BM25 params
        k1 = 1.5
        b = 0.75
        scores = [0.0] * n_docs
        for i, toks in enumerate(docs_tokens):
            if not toks:
                continue
            tf: dict[str, int] = {}
            for tok in toks:
                tf[tok] = tf.get(tok, 0) + 1
            dl = max(doc_lens[i], 1)
            for qt in q_tokens:
                term_df = df.get(qt, 0)
                if term_df <= 0:
                    continue
                idf = math.log(1 + ((n_docs - term_df + 0.5) / (term_df + 0.5)))
                freq = tf.get(qt, 0)
                if freq <= 0:
                    continue
                denom = freq + k1 * (1 - b + b * (dl / avgdl))
                scores[i] += idf * ((freq * (k1 + 1)) / max(denom, 1e-9))
        return scores

    @staticmethod
    def _rerank_candidates(
        query: str,
        candidates: list[dict],
        top_n: int,
    ) -> list[dict]:
        """
        Use a smaller LLM as reranker to pick best chunks from retrieved candidates.
        """
        if not candidates or top_n <= 0:
            return []
        if len(candidates) <= top_n:
            return candidates

        payload = {
            "query": query,
            "chunks": [
                {"id": i, "text": c.get("text", "")[:1600], "filename": c.get("filename")}
                for i, c in enumerate(candidates)
            ],
            "top_n": top_n,
        }
        prompt = (
            "You are a retrieval reranker. Choose the most relevant chunk IDs for the query. "
            "Prioritize exact product names, technical terms, and direct answerability. "
            "Return strict JSON with key 'top_ids' as integer list in best-first order."
        )
        try:
            client = _openai_client()
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": json.dumps(payload)},
                ],
                temperature=0,
                response_format={"type": "json_object"},
                max_tokens=180,
            )
            content = (resp.choices[0].message.content or "").strip() if resp.choices else ""
            parsed = json.loads(content) if content else {}
            ids = parsed.get("top_ids") if isinstance(parsed, dict) else None
            if not isinstance(ids, list):
                return candidates[:top_n]
            selected = []
            for idx in ids:
                if isinstance(idx, int) and 0 <= idx < len(candidates):
                    selected.append(candidates[idx])
                if len(selected) >= top_n:
                    break
            return selected or candidates[:top_n]
        except Exception:
            logger.exception("Reranker failed; using pre-rerank order fallback.")
            return candidates[:top_n]

    @staticmethod
    def hybrid_search(
        knowledge_base_id: str,
        query: str,
        k: int = 5,
        filter: Optional[dict] = None,
        vector_k: int = 40,
        keyword_weight: float = 0.45,
        use_reranker: bool = True,
        rerank_pool: int = 10,
    ) -> list[dict]:
        """
        Hybrid retrieval:
        1) vector retrieval candidate pool
        2) BM25-style keyword scoring
        3) weighted fusion
        4) optional LLM reranking over top rerank_pool
        """
        store = EmbeddingService.load_index(knowledge_base_id)
        if store is None:
            return []

        # Candidate pool from vector search.
        raw_results = store.similarity_search_with_score(query, k=max(vector_k, k))
        if not raw_results:
            return []

        # Apply metadata filter.
        filtered: list[tuple[LCDocument, float]] = []
        for doc, score in raw_results:
            if filter:
                matched = True
                for key, val in filter.items():
                    if str(doc.metadata.get(key)) != str(val):
                        matched = False
                        break
                if not matched:
                    continue
            filtered.append((doc, float(score)))
        if not filtered:
            return []

        docs = [d for d, _ in filtered]
        vec_scores = [s for _, s in filtered]
        texts = [d.page_content for d in docs]
        kw_scores = EmbeddingService._keyword_scores(query, texts)

        # Normalize and fuse scores.
        min_vec, max_vec = min(vec_scores), max(vec_scores)
        vec_span = max(max_vec - min_vec, 1e-9)
        # For FAISS distance: lower is better -> invert post-normalization
        norm_vec_relevance = [1.0 - ((s - min_vec) / vec_span) for s in vec_scores]

        min_kw, max_kw = min(kw_scores), max(kw_scores)
        kw_span = max(max_kw - min_kw, 1e-9)
        norm_kw = [(s - min_kw) / kw_span for s in kw_scores]

        kw_w = min(max(keyword_weight, 0.0), 1.0)
        vec_w = 1.0 - kw_w

        merged = []
        for i, doc in enumerate(docs):
            fused = vec_w * norm_vec_relevance[i] + kw_w * norm_kw[i]
            merged.append(
                {
                    "text": doc.page_content,
                    "score": vec_scores[i],
                    "hybrid_score": fused,
                    "keyword_score": kw_scores[i],
                    "document_id": doc.metadata.get("document_id"),
                    "filename": doc.metadata.get("filename"),
                    "chunk_index": doc.metadata.get("chunk_index"),
                }
            )
        merged.sort(key=lambda x: x["hybrid_score"], reverse=True)

        if use_reranker:
            rerank_input = merged[: max(rerank_pool, k)]
            reranked = EmbeddingService._rerank_candidates(query, rerank_input, top_n=k)
            return reranked

        return merged[:k]

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
