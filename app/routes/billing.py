from datetime import datetime, timezone

from flask_restful import Resource
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.models.subscription import Subscription, Plan
from app.utils.responses import success, error


class BillingSummaryResource(Resource):
    @jwt_required()
    def get(self):
        user_id = get_jwt_identity()
        subscription = Subscription.query.filter_by(user_id=user_id).first()
        if not subscription:
            return error("Subscription not found for this user.", 404)

        plans = Plan.query.filter_by(is_active=True).all()
        now = datetime.now(timezone.utc)
        days_left = max((subscription.current_period_end - now).days, 0)

        return success(
            {
                "billing": {
                    "subscription": subscription.to_dict(),
                    "days_left_in_cycle": days_left,
                    "available_plans": [p.to_dict() for p in plans],
                }
            },
            200,
        )
