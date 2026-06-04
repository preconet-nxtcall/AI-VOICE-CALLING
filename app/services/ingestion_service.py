import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from app.models import db
from app.models.knowledge_base import Document
from app.models.ingestion_job import IngestionJob
from app.services.embedding_service import EmbeddingService
from app.services.extraction_service import ExtractionService
from app.services.scraper_service import ScraperService

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=4)


class IngestionService:
    @staticmethod
    def enqueue_file_ingestion(app, job_id: str, file_bytes: bytes, filename: str) -> None:
        _executor.submit(IngestionService._process_file_job, app, job_id, file_bytes, filename)

    @staticmethod
    def enqueue_url_ingestion(app, job_id: str, url: str) -> None:
        _executor.submit(IngestionService._process_url_job, app, job_id, url)

    @staticmethod
    def _mark_processing(job: IngestionJob) -> None:
        job.status = "processing"
        job.error_message = None
        db.session.commit()

    @staticmethod
    def _mark_failed(job: IngestionJob, message: str) -> None:
        job.status = "failed"
        job.error_message = message[:2000]
        job.completed_at = datetime.now(timezone.utc)
        db.session.commit()

    @staticmethod
    def _mark_completed(job: IngestionJob, document_id: uuid.UUID, chunks_embedded: int) -> None:
        job.status = "completed"
        job.document_id = document_id
        job.chunks_embedded = max(int(chunks_embedded or 0), 0)
        job.completed_at = datetime.now(timezone.utc)
        db.session.commit()

    @staticmethod
    def _create_document(job: IngestionJob, filename: str, file_type: str, extracted_text: str) -> Document:
        document = Document(
            knowledge_base_id=job.knowledge_base_id,
            user_id=job.user_id,
            filename=filename,
            file_type=file_type,
            content=extracted_text,
        )
        db.session.add(document)
        db.session.commit()
        return document

    @staticmethod
    def _process_file_job(app, job_id: str, file_bytes: bytes, filename: str) -> None:
        with app.app_context():
            job_uuid = uuid.UUID(job_id)
            job = db.session.get(IngestionJob, job_uuid)
            if not job:
                return
            try:
                IngestionService._mark_processing(job)
                extracted_text = ExtractionService.process_file(file_bytes, filename)
                if not extracted_text or not extracted_text.strip():
                    raise ValueError("No readable text could be extracted from the file.")

                file_type = filename.split(".")[-1].lower() if "." in filename else "unknown"
                document = IngestionService._create_document(job, filename, file_type, extracted_text)
                chunks = EmbeddingService.embed_document(
                    knowledge_base_id=str(job.knowledge_base_id),
                    document_id=str(document.id),
                    filename=filename,
                    text=extracted_text,
                )
                IngestionService._mark_completed(job, document.id, chunks)
            except Exception as exc:
                logger.exception("File ingestion job failed job_id=%s", job_id)
                db.session.rollback()
                IngestionService._mark_failed(job, str(exc))
            finally:
                db.session.remove()

    @staticmethod
    def _process_url_job(app, job_id: str, url: str) -> None:
        with app.app_context():
            job_uuid = uuid.UUID(job_id)
            job = db.session.get(IngestionJob, job_uuid)
            if not job:
                return
            try:
                IngestionService._mark_processing(job)
                extracted_text = ScraperService.extract_text_from_url(url)
                if not extracted_text or not extracted_text.strip():
                    raise ValueError("No readable text could be extracted from the URL.")

                document = IngestionService._create_document(job, url, "url", extracted_text)
                chunks = EmbeddingService.embed_document(
                    knowledge_base_id=str(job.knowledge_base_id),
                    document_id=str(document.id),
                    filename=url,
                    text=extracted_text,
                )
                IngestionService._mark_completed(job, document.id, chunks)
            except Exception as exc:
                logger.exception("URL ingestion job failed job_id=%s", job_id)
                db.session.rollback()
                IngestionService._mark_failed(job, str(exc))
            finally:
                db.session.remove()
