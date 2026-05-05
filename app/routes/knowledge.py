import logging
import uuid

from flask import request, current_app
from flask_restful import Resource
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.models import db
from app.models.knowledge_base import KnowledgeBase, Document
from app.models.ingestion_job import IngestionJob
from app.services.embedding_service import EmbeddingService
from app.services.ingestion_service import IngestionService
from app.utils.responses import success, error

logger = logging.getLogger(__name__)
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def _parse_user_uuid() -> tuple[uuid.UUID | None, tuple | None]:
    user_id = get_jwt_identity()
    try:
        return uuid.UUID(str(user_id)), None
    except ValueError:
        return None, error("Invalid user identity format.", 401)


def _resolve_user_kb(user_uuid: uuid.UUID, knowledge_base_id: str | None):
    if knowledge_base_id:
        try:
            kb_uuid = uuid.UUID(str(knowledge_base_id))
        except ValueError:
            return None, error("Invalid knowledge base ID format.", 400)
        kb = KnowledgeBase.query.filter_by(id=kb_uuid, user_id=user_uuid).first()
        if not kb:
            return None, error("Knowledge Base not found", 404)
        return kb, None

    kb = KnowledgeBase.query.filter_by(user_id=user_uuid, name="Default Knowledge Base").first()
    if not kb:
        kb = KnowledgeBase(name="Default Knowledge Base", user_id=user_uuid)
        db.session.add(kb)
        db.session.commit()
    return kb, None


class KnowledgeUploadResource(Resource):
    @jwt_required()
    def post(self):
        user_uuid, auth_err = _parse_user_uuid()
        if auth_err:
            return auth_err

        if "file" not in request.files:
            return error("No file part in the request", 400)

        file = request.files["file"]
        if file.filename == "":
            return error("No selected file", 400)

        knowledge_base_id = request.form.get("knowledge_base_id")

        try:
            kb, kb_err = _resolve_user_kb(user_uuid, knowledge_base_id)
            if kb_err:
                return kb_err

            file_stream = file.read()
            filename = file.filename
            if len(file_stream) > _MAX_UPLOAD_BYTES:
                return error("File is too large (max 10MB).", 400)

            job = IngestionJob(
                user_id=user_uuid,
                knowledge_base_id=kb.id,
                source_type="file",
                source_name=filename,
                status="queued",
            )
            db.session.add(job)
            db.session.commit()

            IngestionService.enqueue_file_ingestion(
                current_app._get_current_object(),
                str(job.id),
                file_stream,
                filename,
            )

            return success(
                {
                    "message": "File queued for ingestion",
                    "ingestion_job": job.to_dict(),
                },
                202,
            )

        except Exception:
            db.session.rollback()
            return error("An error occurred during file upload", 500)


class KnowledgeListResource(Resource):
    @jwt_required()
    def get(self):
        user_uuid, auth_err = _parse_user_uuid()
        if auth_err:
            return auth_err
        try:
            kbs = KnowledgeBase.query.filter_by(user_id=user_uuid).all()

            result = []
            for kb in kbs:
                kb_dict = kb.to_dict()
                docs = Document.query.filter_by(knowledge_base_id=kb.id, user_id=user_uuid).all()
                kb_dict["documents"] = [doc.to_dict() for doc in docs]
                result.append(kb_dict)

            return success({"knowledge_bases": result}, 200)

        except Exception:
            return error("An error occurred while fetching knowledge bases", 500)


class KnowledgeUrlResource(Resource):
    @jwt_required()
    def post(self):
        user_uuid, auth_err = _parse_user_uuid()
        if auth_err:
            return auth_err
        body = request.get_json(silent=True) or {}
        url = body.get("url", "").strip()

        if not url:
            return error("URL is required", 400)

        knowledge_base_id = body.get("knowledge_base_id")

        try:
            kb, kb_err = _resolve_user_kb(user_uuid, knowledge_base_id)
            if kb_err:
                return kb_err

            job = IngestionJob(
                user_id=user_uuid,
                knowledge_base_id=kb.id,
                source_type="url",
                source_name=url,
                status="queued",
            )
            db.session.add(job)
            db.session.commit()

            IngestionService.enqueue_url_ingestion(
                current_app._get_current_object(),
                str(job.id),
                url,
            )

            return success(
                {
                    "message": "URL queued for ingestion",
                    "ingestion_job": job.to_dict(),
                },
                202,
            )

        except Exception:
            db.session.rollback()
            return error("An error occurred during URL ingestion", 500)


class KnowledgeBaseResource(Resource):
    @jwt_required()
    def delete(self, knowledge_base_id):
        user_uuid, auth_err = _parse_user_uuid()
        if auth_err:
            return auth_err
        try:
            kb_uuid = uuid.UUID(str(knowledge_base_id))
        except ValueError:
            return error("Invalid knowledge base ID format.", 400)
        try:
            kb = KnowledgeBase.query.filter_by(id=kb_uuid, user_id=user_uuid).first()
            if not kb:
                return error("Knowledge Base not found", 404)

            EmbeddingService.delete_index(str(kb.id))

            db.session.delete(kb)
            db.session.commit()

            return success({"message": "Knowledge Base deleted successfully"}, 200)
        except Exception:
            db.session.rollback()
            logger.exception("Failed to delete Knowledge Base %s", knowledge_base_id)
            return error("An error occurred while deleting Knowledge Base", 500)


class DocumentResource(Resource):
    @jwt_required()
    def delete(self, document_id):
        user_uuid, auth_err = _parse_user_uuid()
        if auth_err:
            return auth_err
        try:
            document_uuid = uuid.UUID(str(document_id))
        except ValueError:
            return error("Invalid document ID format.", 400)
        try:
            document = Document.query.filter_by(id=document_uuid, user_id=user_uuid).first()
            if not document:
                return error("Document not found", 404)

            kb = KnowledgeBase.query.filter_by(id=document.knowledge_base_id, user_id=user_uuid).first()
            if not kb:
                return error("Document not found or unauthorized", 404)

            EmbeddingService.delete_document_chunks(str(kb.id), str(document.id))

            db.session.delete(document)
            db.session.commit()

            return success({"message": "Document deleted successfully"}, 200)
        except Exception:
            db.session.rollback()
            logger.exception("Failed to delete Document %s", document_id)
            return error("An error occurred while deleting Document", 500)


class IngestionJobListResource(Resource):
    @jwt_required()
    def get(self):
        user_uuid, auth_err = _parse_user_uuid()
        if auth_err:
            return auth_err
        try:
            jobs = (
                IngestionJob.query.filter_by(user_id=user_uuid)
                .order_by(IngestionJob.created_at.desc())
                .limit(100)
                .all()
            )
            return success({"ingestion_jobs": [j.to_dict() for j in jobs]}, 200)
        except Exception:
            return error("An error occurred while fetching ingestion jobs", 500)


class IngestionJobResource(Resource):
    @jwt_required()
    def get(self, job_id):
        user_uuid, auth_err = _parse_user_uuid()
        if auth_err:
            return auth_err
        try:
            job_uuid = uuid.UUID(str(job_id))
        except ValueError:
            return error("Invalid ingestion job ID format.", 400)

        job = IngestionJob.query.filter_by(id=job_uuid, user_id=user_uuid).first()
        if not job:
            return error("Ingestion job not found", 404)
        return success({"ingestion_job": job.to_dict()}, 200)
