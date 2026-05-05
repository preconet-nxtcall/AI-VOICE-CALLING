import uuid
from datetime import datetime, timezone

from app.models import db


class IngestionJob(db.Model):
    __tablename__ = "ingestion_jobs"

    id = db.Column(db.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = db.Column(
        db.UUID(as_uuid=True),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    knowledge_base_id = db.Column(
        db.UUID(as_uuid=True),
        db.ForeignKey("knowledge_base.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_type = db.Column(db.String(20), nullable=False)  # file | url
    source_name = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="queued")  # queued | processing | completed | failed
    error_message = db.Column(db.Text, nullable=True)
    chunks_embedded = db.Column(db.Integer, nullable=False, default=0)
    document_id = db.Column(db.UUID(as_uuid=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def to_dict(self):
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "knowledge_base_id": str(self.knowledge_base_id),
            "source_type": self.source_type,
            "source_name": self.source_name,
            "status": self.status,
            "error_message": self.error_message,
            "chunks_embedded": self.chunks_embedded,
            "document_id": str(self.document_id) if self.document_id else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
