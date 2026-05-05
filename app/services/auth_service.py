from flask_jwt_extended import create_access_token, create_refresh_token

from app.models import db, bcrypt
from app.models.user import User
from app.models.subscription import Plan, Subscription
from app.utils.errors import ConflictError, UnauthorizedError, NotFoundError
from datetime import datetime, timezone, timedelta


class AuthService:

    @staticmethod
    def signup(email: str, password: str, full_name: str) -> dict:
        if User.query.filter_by(email=email.lower()).first():
            raise ConflictError("An account with this email already exists.")

        password_hash = bcrypt.generate_password_hash(password).decode("utf-8")
        user = User(
            email=email.lower(),
            password_hash=password_hash,
            full_name=full_name.strip(),
        )
        db.session.add(user)
        
        # Create default Free plan if it doesn't exist
        free_plan = Plan.query.filter_by(name="Free").first()
        if not free_plan:
            free_plan = Plan(
                name="Free",
                description="Default 7 days free plan",
                price=0.00,
                interval="week"
            )
            db.session.add(free_plan)
            db.session.flush() # Ensure free_plan.id is available

        # Assign 7-day free subscription
        now = datetime.now(timezone.utc)
        subscription = Subscription(
            user_id=user.id,
            plan_id=free_plan.id,
            status="active",
            current_period_start=now,
            current_period_end=now + timedelta(days=7)
        )
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
    def login(email: str, password: str) -> dict:
        user = User.query.filter_by(email=email.lower()).first()

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
        # db.session.get() is the SQLAlchemy 2.0 replacement for Query.get()
        user = db.session.get(User, user_id)
        if not user:
            raise NotFoundError("User not found.")
        return user
