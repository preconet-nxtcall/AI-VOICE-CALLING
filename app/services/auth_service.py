import secrets
import string
from datetime import datetime, timezone, timedelta
from typing import Any

from flask_jwt_extended import create_access_token, create_refresh_token

from app.models import db, bcrypt
from app.models.user import User
from app.models.subscription import Plan, Subscription
from app.utils.errors import ConflictError, UnauthorizedError, NotFoundError
from app.services.email_service import EmailService


class AuthService:
    """Service class to handle all authentication-related logic."""

    @staticmethod
    def signup(email: str, password: str, full_name: str) -> dict[str, Any]:
        """Create a new user account and assign a default free plan."""
        # Use db.session.query for better static analysis compatibility
        existing_user = db.session.query(User).filter(User.email == email.lower()).first()
        if existing_user:
            raise ConflictError("An account with this email already exists.")

        password_hash = bcrypt.generate_password_hash(password).decode("utf-8")  # type: ignore
        user = User(email=email.lower(), password_hash=password_hash, full_name=full_name.strip())  # type: ignore
        db.session.add(user)
        
        # Create default Free plan if it doesn't exist
        free_plan = db.session.query(Plan).filter(Plan.name == "Free").first()
        if not free_plan:
            free_plan = Plan(name="Free", description="Default 7 days free plan", price=0.00, interval="week")  # type: ignore
            db.session.add(free_plan)
            db.session.flush() # Ensure free_plan.id is available

        # Assign 7-day free subscription
        now = datetime.now(timezone.utc)
        subscription = Subscription(user_id=user.id, plan_id=free_plan.id, status="active", current_period_start=now, current_period_end=now + timedelta(days=7))  # type: ignore
        db.session.add(subscription)


        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            raise

        return {
            "user": user.to_dict(),
            "access_token": create_access_token(identity=str(user.id)),
            "refresh_token": create_refresh_token(identity=str(user.id)),
        }

    @staticmethod
    def login(email: str, password: str) -> dict[str, Any]:
        """Authenticate a user and return JWT tokens."""
        user = db.session.query(User).filter(User.email == email.lower()).first()

        if not user or not bcrypt.check_password_hash(user.password_hash, password):
            raise UnauthorizedError("Invalid email or password.")

        if not user.is_active:
            raise UnauthorizedError("This account has been deactivated.")

        return {
            "user": user.to_dict(),
            "access_token": create_access_token(identity=str(user.id)),
            "refresh_token": create_refresh_token(identity=str(user.id)),
        }

    @staticmethod
    def get_user_by_id(user_id: str) -> User:
        """Retrieve a user by their UUID."""
        # db.session.get() is the SQLAlchemy 2.0 replacement for Query.get()
        user = db.session.get(User, user_id)
        if not user:
            raise NotFoundError("User not found.")
        return user

    @staticmethod
    def forgot_password(email: str) -> bool:
        """Generate a random password and send it via email."""
        user = db.session.query(User).filter(User.email == email.lower()).first()
        if not user:
            raise NotFoundError("No account found with this email address.")

        if not user.is_active:
            raise UnauthorizedError("This account has been deactivated.")
        
        # Generate a random password that meets validation criteria
        # 12 chars: 1 uppercase, 1 digit, others random
        alphabet = string.ascii_letters + string.digits
        while True:
            new_password = ''.join(secrets.choice(alphabet) for _ in range(12))
            if (any(c.isupper() for c in new_password)
                and any(c.isdigit() for c in new_password)):
                break
        
        # Hash and save
        user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")  # type: ignore
        
        try:

            db.session.commit()
        except Exception:
            db.session.rollback()
            raise

        return EmailService.send_password_reset(user.email, new_password)


