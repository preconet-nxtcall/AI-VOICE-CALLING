from flask import request
from flask_restful import Resource
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.models.subscription import Plan, Subscription
from app.utils.responses import success, error


class PlanListResource(Resource):
    def get(self):
        try:
            plans = Plan.query.filter_by(is_active=True).all()
            return success({"plans": [plan.to_dict() for plan in plans]}, 200)
        except Exception as e:
            return error("An error occurred while fetching plans.", 500)


class SubscriptionResource(Resource):
    @jwt_required()
    def get(self):
        user_id = get_jwt_identity()
        try:
            subscription = Subscription.query.filter_by(user_id=user_id).first()
            if not subscription:
                return error("Subscription not found for this user.", 404)
            return success({"subscription": subscription.to_dict()}, 200)
        except Exception as e:
            return error("An error occurred while fetching subscription.", 500)
