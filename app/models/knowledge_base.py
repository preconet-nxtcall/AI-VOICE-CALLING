import uuid
from datetime import datetime, timezone

from app.models import db

class KnowledgeBase(db.Model):
    __tablename__ = "knowledge_base"

    id = db.Column(db.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(255), nullable=False)
    user_id = db.Column(db.UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
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

    documents = db.relationship("Document", backref="knowledge_base", lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "user_id": str(self.user_id),
            "created_at": self.created_at.isoformat(),
        }

    def __repr__(self):
        return f"<KnowledgeBase {self.name}>"

class Document(db.Model):
    __tablename__ = "documents"

    id = db.Column(db.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    knowledge_base_id = db.Column(db.UUID(as_uuid=True), db.ForeignKey("knowledge_base.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    file_type = db.Column(db.String(50), nullable=False)
    content = db.Column(db.Text, nullable=True)
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

    def to_dict(self):
        return {
            "id": str(self.id),
            "knowledge_base_id": str(self.knowledge_base_id),
            "user_id": str(self.user_id),
            "filename": self.filename,
            "file_type": self.file_type,
            "created_at": self.created_at.isoformat(),
        }

    def __repr__(self):
        return f"<Document {self.filename}>"
