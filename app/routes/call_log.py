from datetime import datetime, timedelta, timezone

from flask_restful import Resource
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.models.call_log import CallLog
from app.utils.responses import success


class CallLogListResource(Resource):
    @jwt_required()
    def get(self):
        user_id = get_jwt_identity()
        logs = (
            CallLog.query.filter_by(user_id=user_id)
            .order_by(CallLog.created_at.desc())
            .limit(100)
            .all()
        )

        total_calls = len(logs)
        completed_calls = sum(1 for l in logs if l.status == "completed")
        failed_calls = sum(1 for l in logs if l.status == "failed")
        total_duration = sum(l.duration_seconds for l in logs)

        one_day_ago = datetime.now(timezone.utc) - timedelta(days=1)
        last_24h_calls = sum(1 for l in logs if l.created_at >= one_day_ago)

        return success(
            {
                "call_logs": [log.to_dict() for log in logs],
                "summary": {
                    "total_calls": total_calls,
                    "completed_calls": completed_calls,
                    "failed_calls": failed_calls,
                    "total_duration_seconds": total_duration,
                    "calls_last_24h": last_24h_calls,
                },
            },
            200,
        )
