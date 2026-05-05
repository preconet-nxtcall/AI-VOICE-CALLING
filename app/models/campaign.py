import uuid
from datetime import datetime, timezone

from app.models import db


class Campaign(db.Model):
    __tablename__ = "campaigns"

    id = db.Column(db.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = db.Column(
        db.UUID(as_uuid=True),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    knowledge_base_id = db.Column(
        db.UUID(as_uuid=True),
        db.ForeignKey("knowledge_base.id", ondelete="SET NULL"),
        nullable=True,
    )
    name = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(50), nullable=False, default="draft")  # draft, active, paused
    channel = db.Column(db.String(50), nullable=False, default="voice")
    daily_limit = db.Column(db.Integer, nullable=False, default=100)
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
            "user_id": str(self.user_id),
            "knowledge_base_id": str(self.knowledge_base_id) if self.knowledge_base_id else None,
            "name": self.name,
            "status": self.status,
            "channel": self.channel,
            "daily_limit": self.daily_limit,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
