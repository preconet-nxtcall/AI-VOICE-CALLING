import uuid
from datetime import datetime, timezone

from app.models import db


class CallLog(db.Model):
    __tablename__ = "call_logs"

    id = db.Column(db.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = db.Column(
        db.UUID(as_uuid=True),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    campaign_id = db.Column(
        db.UUID(as_uuid=True),
        db.ForeignKey("campaigns.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Twilio CallSid — links all recording turns of one call to a single log row
    call_sid = db.Column(db.String(64), nullable=True, index=True, unique=True)

    phone_number = db.Column(db.String(40), nullable=False)
    status = db.Column(db.String(50), nullable=False, default="completed")  # completed, failed, missed
    duration_seconds = db.Column(db.Integer, nullable=False, default=0)
    tags = db.Column(db.JSON, nullable=False, default=dict)
    is_forwarded = db.Column(db.Boolean, nullable=False, default=False)

    # Full turn-by-turn transcript: [{role, text, ts}, ...]
    # role is either "customer" or "ai"
    conversation = db.Column(db.JSON, nullable=True, default=list)

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    campaign = db.relationship("Campaign", lazy="joined")

    def to_dict(self):
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "campaign_id": str(self.campaign_id) if self.campaign_id else None,
            "campaign_name": self.campaign.name if self.campaign else None,
            "call_sid": self.call_sid,
            "phone_number": self.phone_number,
            "status": self.status,
            "duration_seconds": self.duration_seconds,
            "tags": self.tags or {},
            "is_forwarded": self.is_forwarded,
            "conversation": self.conversation or [],
            "created_at": self.created_at.isoformat(),
        }
