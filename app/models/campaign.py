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
    script_id = db.Column(
        db.UUID(as_uuid=True),
        db.ForeignKey("scripts.id", ondelete="SET NULL"),
        nullable=True,
    )
    name = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(50), nullable=False, default="draft")  # draft, active, paused
    channel = db.Column(db.String(50), nullable=False, default="voice")
    daily_limit = db.Column(db.Integer, nullable=False, default=100)
    caller_id = db.Column(db.String(40), nullable=True)
    schedule_start_at = db.Column(db.DateTime(timezone=True), nullable=True)
    schedule_end_at = db.Column(db.DateTime(timezone=True), nullable=True)
    daily_start_time = db.Column(db.Time, nullable=True)
    daily_end_time = db.Column(db.Time, nullable=True)
    dialing_speed = db.Column(db.String(50), nullable=False, default="normal") # normal, fast, aggressive
    retry_attempts = db.Column(db.Integer, nullable=False, default=0)
    retry_interval_seconds = db.Column(db.Integer, nullable=False, default=300)
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

    script = db.relationship("Script", back_populates="campaigns", lazy="joined")

    def to_dict(self):
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "knowledge_base_id": str(self.knowledge_base_id) if self.knowledge_base_id else None,
            "script_id": str(self.script_id) if self.script_id else None,
            "name": self.name,
            "status": self.status,
            "channel": self.channel,
            "daily_limit": self.daily_limit,
            "caller_id": self.caller_id,
            "schedule_start_at": self.schedule_start_at.isoformat() if self.schedule_start_at else None,
            "schedule_end_at": self.schedule_end_at.isoformat() if self.schedule_end_at else None,
            "daily_start_time": self.daily_start_time.isoformat() if self.daily_start_time else None,
            "daily_end_time": self.daily_end_time.isoformat() if self.daily_end_time else None,
            "dialing_speed": self.dialing_speed,
            "retry_attempts": self.retry_attempts,
            "retry_interval_seconds": self.retry_interval_seconds,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
