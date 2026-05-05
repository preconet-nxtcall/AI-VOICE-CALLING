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
    phone_number = db.Column(db.String(40), nullable=False)
    status = db.Column(db.String(50), nullable=False, default="completed")  # completed, failed, missed
    duration_seconds = db.Column(db.Integer, nullable=False, default=0)
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
            "phone_number": self.phone_number,
            "status": self.status,
            "duration_seconds": self.duration_seconds,
            "created_at": self.created_at.isoformat(),
        }
