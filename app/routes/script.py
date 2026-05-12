import uuid
import json
import re

from flask import request
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_restful import Resource

from app.models import db
from app.models.script import Script
from app.utils.responses import error, success

_PHONE_RE = re.compile(r"^\+?[1-9]\d{6,14}$")


class ScriptListResource(Resource):
    @jwt_required()
    def get(self):
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
        except ValueError:
            return error("Invalid user identity.", 401)

        scripts = (
            Script.query.filter_by(user_id=user_uuid, is_active=True)
            .order_by(Script.updated_at.desc())
            .all()
        )
        return success({"scripts": [s.to_dict() for s in scripts]}, 200)

    @jwt_required()
    def post(self):
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
        except ValueError:
            return error("Invalid user identity.", 401)

        body = request.get_json(silent=True) or {}
        name = (body.get("name") or "").strip()
        content = body.get("content")
        if not name:
            return error("Script name is required.", 400)
        if content is None:
            return error("Script content is required.", 400)
        content = str(content).strip()
        if not content:
            return error("Script content is required.", 400)
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            return error("Script content must be valid JSON.", 400)
        if not isinstance(parsed, dict):
            return error("Script content must be a JSON object.", 400)

        handoff_number = (parsed.get("handoff_number") or "").strip() if isinstance(parsed.get("handoff_number"), str) else ""
        if handoff_number and not _PHONE_RE.match(handoff_number):
            return error("handoff_number must be a valid E.164 phone number.", 400)

        if parsed.get("lead_capture_enabled") is True:
            tags = parsed.get("lead_tags") or []
            if not isinstance(tags, list):
                return error("lead_tags must be a list.", 400)

        script = Script(
            user_id=user_uuid,
            name=name,
            content=content,
            version=1,
            is_active=True,
        )
        db.session.add(script)
        db.session.commit()
        return success({"script": script.to_dict()}, 201)
