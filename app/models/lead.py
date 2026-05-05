import uuid
from datetime import datetime, timezone

from app.models import db

class Lead(db.Model):
    __tablename__ = "leads"

    id = db.Column(db.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id = db.Column(
        db.UUID(as_uuid=True),
        db.ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    phone_number = db.Column(db.String(50), nullable=False)
    status = db.Column(db.String(50), nullable=False, default="pending")  # pending, calling, completed, failed
    call_sid = db.Column(db.String(255), nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    
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
            "campaign_id": str(self.campaign_id),
            "phone_number": self.phone_number,
            "status": self.status,
            "call_sid": self.call_sid,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
