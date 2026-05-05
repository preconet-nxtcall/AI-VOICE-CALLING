from flask import request
from flask_restful import Resource
from flask_jwt_extended import jwt_required, get_jwt_identity
import uuid
import csv
import io
import re

from app.models import db
from app.models.campaign import Campaign
from app.models.lead import Lead
from app.models.knowledge_base import KnowledgeBase
from app.utils.responses import success, error


# Simple E.164-ish phone number validation
_PHONE_RE = re.compile(r"^\+?[1-9]\d{6,14}$")


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

        # Attach lead stats to each campaign
        result = []
        for c in campaigns:
            d = c.to_dict()
            total = Lead.query.filter_by(campaign_id=c.id).count()
            completed = Lead.query.filter_by(campaign_id=c.id, status="completed").count()
            failed = Lead.query.filter_by(campaign_id=c.id, status="failed").count()
            pending = Lead.query.filter_by(campaign_id=c.id, status="pending").count()
            calling = Lead.query.filter_by(campaign_id=c.id, status="calling").count()
            d["lead_stats"] = {
                "total": total,
                "completed": completed,
                "failed": failed,
                "pending": pending,
                "calling": calling,
            }
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
        kb_uuid = None
        if knowledge_base_id:
            try:
                kb_uuid = uuid.UUID(str(knowledge_base_id))
            except ValueError:
                return error("Invalid knowledge_base_id format.", 400)
            kb = KnowledgeBase.query.filter_by(id=kb_uuid, user_id=user_uuid).first()
            if not kb:
                return error("Knowledge base not found or access denied.", 404)

        campaign = Campaign(
            user_id=user_uuid,
            name=name,
            status=status,
            channel="voice",
            daily_limit=daily_limit,
            knowledge_base_id=kb_uuid,
        )
        db.session.add(campaign)
        db.session.commit()
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

        for row_idx, row in enumerate(reader, start=1):
            if not row:
                continue

            # Take the first column as the phone number
            phone = row[0].strip()
            if not phone:
                continue

            # Skip header-like rows
            if row_idx == 1 and phone.lower() in {"phone", "phone_number", "number", "mobile", "tel"}:
                continue

            # Normalize: add + if missing
            if not phone.startswith("+"):
                phone = "+" + phone

            if not _PHONE_RE.match(phone):
                skipped += 1
                if len(errors_list) < 10:
                    errors_list.append(f"Row {row_idx}: Invalid number '{row[0].strip()}'")
                continue

            # Check for duplicates within the same campaign
            existing = Lead.query.filter_by(campaign_id=campaign_uuid, phone_number=phone).first()
            if existing:
                skipped += 1
                continue

            lead = Lead(
                campaign_id=campaign_uuid,
                phone_number=phone,
                status="pending",
            )
            db.session.add(lead)
            added += 1

        db.session.commit()

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
