from datetime import datetime, timedelta, timezone
import uuid

from flask_restful import Resource
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func

from app.models import db
from app.models.call_log import CallLog
from app.utils.responses import success


class CallLogListResource(Resource):
    @jwt_required()
    def get(self):
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
        except ValueError:
            return success(
                {
                    "call_logs": [],
                    "summary": {
                        "total_calls": 0,
                        "completed_calls": 0,
                        "failed_calls": 0,
                        "total_duration_seconds": 0,
                        "calls_last_24h": 0,
                    },
                },
                200,
            )

        # Calculate exact metrics using database aggregations
        total_calls = db.session.query(func.count(CallLog.id)).filter_by(user_id=user_uuid).scalar() or 0
        completed_calls = db.session.query(func.count(CallLog.id)).filter_by(user_id=user_uuid, status="completed").scalar() or 0
        failed_calls = db.session.query(func.count(CallLog.id)).filter_by(user_id=user_uuid, status="failed").scalar() or 0
        total_duration = db.session.query(func.sum(CallLog.duration_seconds)).filter_by(user_id=user_uuid).scalar() or 0

        one_day_ago = datetime.now(timezone.utc) - timedelta(days=1)
        last_24h_calls = db.session.query(func.count(CallLog.id)).filter(
            CallLog.user_id == user_uuid,
            CallLog.created_at >= one_day_ago
        ).scalar() or 0

        # Fetch up to 1000 logs for the frontend to render the 7D/30D charts effectively
        logs = (
            CallLog.query.filter_by(user_id=user_uuid)
            .order_by(CallLog.created_at.desc())
            .limit(1000)
            .all()
        )

        return success(
            {
                "call_logs": [log.to_dict() for log in logs],
                "summary": {
                    "total_calls": total_calls,
                    "completed_calls": completed_calls,
                    "failed_calls": failed_calls,
                    "total_duration_seconds": int(total_duration),
                    "calls_last_24h": last_24h_calls,
                },
            },
            200,
        )
