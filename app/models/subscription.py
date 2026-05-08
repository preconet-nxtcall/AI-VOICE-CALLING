import uuid
from datetime import datetime, timezone

from app.models import db

class Plan(db.Model):
    __tablename__ = "plans"

    id: uuid.UUID = db.Column(db.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: str = db.Column(db.String(255), nullable=False, unique=True)
    description: str | None = db.Column(db.Text, nullable=True)
    price: float = db.Column(db.Numeric(10, 2), nullable=False)
    currency: str = db.Column(db.String(3), nullable=False, default="USD")
    interval: str = db.Column(db.String(50), nullable=False, default="month") # e.g. month, year, lifetime
    is_active: bool = db.Column(db.Boolean, default=True, nullable=False)
    created_at: datetime = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "description": self.description,
            "price": float(self.price),
            "currency": self.currency,
            "interval": self.interval,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
        }

    def __repr__(self):
        return f"<Plan {self.name}>"


class Subscription(db.Model):
    __tablename__ = "subscriptions"

    id: uuid.UUID = db.Column(db.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: uuid.UUID = db.Column(db.UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    plan_id: uuid.UUID = db.Column(db.UUID(as_uuid=True), db.ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False)
    status: str = db.Column(db.String(50), nullable=False, default="active") # active, cancelled, expired
    current_period_start: datetime = db.Column(db.DateTime(timezone=True), nullable=False)
    current_period_end: datetime = db.Column(db.DateTime(timezone=True), nullable=False)
    created_at: datetime = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    user = db.relationship("User", backref=db.backref("subscription", uselist=False))
    plan = db.relationship("Plan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "plan_id": str(self.plan_id),
            "status": self.status,
            "current_period_start": self.current_period_start.isoformat(),
            "current_period_end": self.current_period_end.isoformat(),
            "created_at": self.created_at.isoformat(),
            "plan": self.plan.to_dict() if self.plan else None
        }

    def __repr__(self):
        return f"<Subscription user={self.user_id} plan={self.plan_id}>"
