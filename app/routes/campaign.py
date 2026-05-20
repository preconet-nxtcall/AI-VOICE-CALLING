from flask import request, current_app
from flask_restful import Resource
from flask_jwt_extended import jwt_required, get_jwt_identity
import uuid
import csv
import io
import re
from datetime import datetime

from app.models import db
from app.models.campaign import Campaign
from app.models.lead import Lead
from app.models.knowledge_base import KnowledgeBase
from app.models.script import Script
from app.utils.responses import success, error


# Simple E.164-ish phone number validation
_PHONE_RE = re.compile(r"^\+?[1-9]\d{6,14}$")


def _enqueue_dialer_sweep() -> None:
    """Trigger a distributed dialer sweep if Celery mode is enabled."""
    try:
        if not current_app.config.get("DIALER_USE_CELERY", False):
            return
        task = current_app.extensions.get("dialer_sweep_task")
        if task:
            task.delay()
    except Exception:
        current_app.logger.exception("Failed to enqueue dialer sweep task")


def _parse_iso_datetime(value):
    if not value:
        return None
    try:
        value = str(value).strip()
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        return datetime.fromisoformat(value)
    except Exception:
        return None

def _parse_time(value):
    if not value:
        return None
    try:
        return datetime.strptime(str(value).strip(), "%H:%M").time()
    except Exception:
        return None


class CampaignListResource(Resource):
    @jwt_required()
    def get(self):
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
        except ValueError:
            return error("Invalid user identity.", 401)
        campaigns = (
            Campaign.query.filter_by(user_id=user_uuid)
            .order_by(Campaign.created_at.desc())
            .all()
        )

        # Get lead stats using a single query grouping by campaign_id and status
        from sqlalchemy import func
        campaign_ids = [c.id for c in campaigns]
        
        stats_by_campaign = {
            cid: {"total": 0, "completed": 0, "failed": 0, "pending": 0, "calling": 0} 
            for cid in campaign_ids
        }
        
        if campaign_ids:
            stats_query = db.session.query(
                Lead.campaign_id,
                Lead.status,
                func.count(Lead.id)
            ).filter(Lead.campaign_id.in_(campaign_ids)).group_by(Lead.campaign_id, Lead.status).all()
            
            for cid, status, count in stats_query:
                if status in stats_by_campaign[cid]:
                    stats_by_campaign[cid][status] = count
                stats_by_campaign[cid]["total"] += count

        # Attach lead stats to each campaign
        result = []
        for c in campaigns:
            d = c.to_dict()
            d["lead_stats"] = stats_by_campaign[c.id]
            result.append(d)

        return success({"campaigns": result}, 200)

    @jwt_required()
    def post(self):
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
        except ValueError:
            return error("Invalid user identity.", 401)
        body = request.get_json(silent=True) or {}

        name = (body.get("name") or "").strip()
        if not name:
            return error("Campaign name is required.", 400)

        status = (body.get("status") or "draft").strip().lower()
        if status not in {"draft", "active", "paused"}:
            return error("Invalid campaign status.", 400)

        daily_limit = body.get("daily_limit", 100)
        if not isinstance(daily_limit, int) or daily_limit <= 0:
            return error("daily_limit must be a positive integer.", 400)

        # Validate knowledge_base_id
        knowledge_base_id = body.get("knowledge_base_id")
        if not knowledge_base_id:
            return error("Knowledge Base ID is required.", 400)

        try:
            kb_uuid = uuid.UUID(str(knowledge_base_id))
        except ValueError:
            return error("Invalid knowledge_base_id format.", 400)
            
        kb = KnowledgeBase.query.filter_by(id=kb_uuid, user_id=user_uuid).first()
        if not kb:
            return error("Knowledge base not found or access denied.", 404)

        script_uuid = None
        script_id = body.get("script_id")
        if script_id:
            try:
                script_uuid = uuid.UUID(str(script_id))
            except ValueError:
                return error("Invalid script_id format.", 400)
            script = Script.query.filter_by(id=script_uuid, user_id=user_uuid).first()
            if not script:
                return error("Script not found or access denied.", 404)

        caller_id = (body.get("caller_id") or "").strip() or None
        if caller_id and not _PHONE_RE.match(caller_id):
            return error("caller_id must be a valid E.164 phone number.", 400)

        schedule_start_at = _parse_iso_datetime(body.get("schedule_start_at"))
        if body.get("schedule_start_at") and not schedule_start_at:
            return error("Invalid schedule_start_at. Use ISO datetime.", 400)
        schedule_end_at = _parse_iso_datetime(body.get("schedule_end_at"))
        if body.get("schedule_end_at") and not schedule_end_at:
            return error("Invalid schedule_end_at. Use ISO datetime.", 400)
        if schedule_start_at and schedule_end_at and schedule_end_at <= schedule_start_at:
            return error("schedule_end_at must be after schedule_start_at.", 400)

        retry_attempts = body.get("retry_attempts", 0)
        retry_interval_seconds = body.get("retry_interval_seconds", 300)
        if not isinstance(retry_attempts, int) or retry_attempts < 0:
            return error("retry_attempts must be a non-negative integer.", 400)
        if not isinstance(retry_interval_seconds, int) or retry_interval_seconds < 30:
            return error("retry_interval_seconds must be an integer >= 30.", 400)

        daily_start_time = _parse_time(body.get("daily_start_time"))
        daily_end_time = _parse_time(body.get("daily_end_time"))
        dialing_speed = (body.get("dialing_speed") or "normal").strip().lower()
        if dialing_speed not in {"normal", "fast", "aggressive"}:
            dialing_speed = "normal"

        # Logical check: if both start/end times are provided, they shouldn't be identical
        if daily_start_time and daily_end_time and daily_start_time == daily_end_time:
            return error("daily_start_time and daily_end_time cannot be the same.", 400)

        campaign = Campaign(
            user_id=user_uuid,
            name=name,
            status=status,
            channel="voice",
            daily_limit=daily_limit,
            knowledge_base_id=kb_uuid,
            script_id=script_uuid,
            caller_id=caller_id,
            schedule_start_at=schedule_start_at,
            schedule_end_at=schedule_end_at,
            daily_start_time=daily_start_time,
            daily_end_time=daily_end_time,
            dialing_speed=dialing_speed,
            retry_attempts=retry_attempts,
            retry_interval_seconds=retry_interval_seconds,
        )
        db.session.add(campaign)
        db.session.commit()

        if status == "active":
            _enqueue_dialer_sweep()

        return success({"campaign": campaign.to_dict()}, 201)


class CampaignStatusResource(Resource):
    @jwt_required()
    def patch(self, campaign_id):
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
        except ValueError:
            return error("Invalid user identity.", 401)

        try:
            campaign_uuid = uuid.UUID(str(campaign_id))
        except ValueError:
            return error("Invalid campaign ID format.", 400)

        campaign = Campaign.query.filter_by(id=campaign_uuid, user_id=user_uuid).first()
        if not campaign:
            return error("Campaign not found.", 404)

        body = request.get_json(silent=True) or {}
        status = (body.get("status") or "").strip().lower()
        if status not in {"draft", "active", "paused"}:
            return error("Invalid campaign status.", 400)

        campaign.status = status
        db.session.commit()
        if status == "active":
            _enqueue_dialer_sweep()
        return success({"campaign": campaign.to_dict()}, 200)


class CampaignLeadUploadResource(Resource):
    """Upload a CSV file of phone numbers to a campaign."""

    @jwt_required()
    def post(self, campaign_id):
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
        except ValueError:
            return error("Invalid user identity.", 401)

        try:
            campaign_uuid = uuid.UUID(str(campaign_id))
        except ValueError:
            return error("Invalid campaign ID format.", 400)

        campaign = Campaign.query.filter_by(id=campaign_uuid, user_id=user_uuid).first()
        if not campaign:
            return error("Campaign not found.", 404)

        if "file" not in request.files:
            return error("No CSV file uploaded. Use 'file' field.", 400)

        file = request.files["file"]
        if not file.filename or not file.filename.lower().endswith(".csv"):
            return error("Only .csv files are accepted.", 400)

        try:
            stream = io.StringIO(file.stream.read().decode("utf-8"))
            reader = csv.reader(stream)
        except Exception:
            return error("Failed to read CSV file. Ensure it is valid UTF-8.", 400)

        added = 0
        skipped = 0
        errors_list = []
        
        batch_size = 5000
        current_batch_phones = set()

        def process_batch():
            nonlocal added, skipped, current_batch_phones
            if not current_batch_phones:
                return
            
            # Query existing phones in this batch
            existing_records = Lead.query.with_entities(Lead.phone_number).filter(
                Lead.campaign_id == campaign_uuid,
                Lead.phone_number.in_(current_batch_phones)
            ).all()
            existing_phones = {r[0] for r in existing_records}
            
            new_leads = []
            for phone in current_batch_phones:
                if phone in existing_phones:
                    skipped += 1
                else:
                    new_leads.append(Lead(
                        campaign_id=campaign_uuid,
                        phone_number=phone,
                        status="pending"
                    ))
                    
            if new_leads:
                db.session.bulk_save_objects(new_leads)
                added += len(new_leads)
                
            current_batch_phones.clear()

        for row_idx, row in enumerate(reader, start=1):
            if not row:
                continue

            # Take the first column as the phone number
            raw_phone = row[0].strip() if row else ""
            if not raw_phone:
                continue

            # Clean the number: remove quotes, spaces, and common separators
            phone = re.sub(r'["\'\s\(\)\-]', '', raw_phone)
            
            if not phone:
                continue

            # Skip header-like rows
            if row_idx == 1 and phone.lower() in {"phone", "phone_number", "number", "mobile", "tel"}:
                continue

            # Normalize: add +91 if it looks like a 10-digit Indian number without prefix
            if not phone.startswith("+"):
                if len(phone) == 10 and phone.isdigit():
                    phone = "+91" + phone
                else:
                    phone = "+" + phone

            if not _PHONE_RE.match(phone):
                skipped += 1
                if len(errors_list) < 10:
                    errors_list.append(f"Row {row_idx}: Invalid number format '{raw_phone}'")
                continue

            # Handle duplicates within the CSV itself
            if phone in current_batch_phones:
                skipped += 1
                continue

            current_batch_phones.add(phone)
            
            if len(current_batch_phones) >= batch_size:
                process_batch()

        # Process any remaining leads
        process_batch()
        
        db.session.commit()
        if campaign.status == "active" and added > 0:
            _enqueue_dialer_sweep()

        return success({
            "message": f"Uploaded {added} leads. Skipped {skipped}.",
            "added": added,
            "skipped": skipped,
            "errors": errors_list,
        }, 200)


class CampaignLeadListResource(Resource):
    """List all leads for a campaign."""

    @jwt_required()
    def get(self, campaign_id):
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
        except ValueError:
            return error("Invalid user identity.", 401)

        try:
            campaign_uuid = uuid.UUID(str(campaign_id))
        except ValueError:
            return error("Invalid campaign ID format.", 400)

        campaign = Campaign.query.filter_by(id=campaign_uuid, user_id=user_uuid).first()
        if not campaign:
            return error("Campaign not found.", 404)

        leads = (
            Lead.query.filter_by(campaign_id=campaign_uuid)
            .order_by(Lead.created_at.asc())
            .all()
        )

        return success({"leads": [l.to_dict() for l in leads]}, 200)


class CampaignSweepResource(Resource):
    """Manually trigger a dialer sweep (useful for testing or manual dialing)."""

    @jwt_required()
    def post(self):
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
        except ValueError:
            return error("Invalid user identity.", 401)

        # Execute a single dialer sweep
        try:
            from app.services.dialer_worker import dialer_sweep_once
            stats = dialer_sweep_once()
            return success({
                "message": "Manual dialer sweep completed successfully.",
                "stats": stats
            }, 200)
        except Exception as e:
            current_app.logger.exception("Manual dialer sweep failed")
            return error(f"Failed to execute dialer sweep: {str(e)}", 500)
