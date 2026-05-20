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


def _parse_and_validate(body: dict):
    """
    Parse and validate the script POST/PUT body.
    Returns (name, content_str, parsed_dict, warnings_list) or raises ValueError.
    """
    name = (body.get("name") or "").strip()
    content = body.get("content")

    if not name:
        raise ValueError("Script name is required.")
    if content is None:
        raise ValueError("Script content is required.")

    content_str = str(content).strip()
    if not content_str:
        raise ValueError("Script content is required.")

    try:
        parsed = json.loads(content_str)
    except json.JSONDecodeError:
        raise ValueError("Script content must be valid JSON.")

    if not isinstance(parsed, dict):
        raise ValueError("Script content must be a JSON object.")

    # Validate handoff number
    handoff_number = ""
    raw_handoff = parsed.get("handoff_number")
    if isinstance(raw_handoff, str):
        handoff_number = raw_handoff.strip().replace(" ", "")
    if handoff_number and not _PHONE_RE.match(handoff_number):
        raise ValueError("handoff_number must be a valid E.164 phone number.")

    # Validate lead tags
    if bool(parsed.get("lead_capture_enabled")):
        tags = parsed.get("lead_tags") or []
        if not isinstance(tags, list):
            raise ValueError("lead_tags must be a list.")

    # Warnings (non-fatal)
    warnings = []
    if not str(parsed.get("welcome_message") or "").strip():
        warnings.append("welcome_message is empty — the AI will start the call in silence.")
    if not str(parsed.get("prompt") or "").strip():
        warnings.append("AI instructions (prompt) is empty — the AI will use only its default behaviour.")

    return name, content_str, parsed, warnings


class ScriptListResource(Resource):
    @jwt_required()
    def get(self):
        """List all active scripts for the current user."""
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
        """Create a new AI script/agent."""
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
        except ValueError:
            return error("Invalid user identity.", 401)

        body = request.get_json(silent=True) or {}
        try:
            name, content_str, _, warnings = _parse_and_validate(body)
        except ValueError as exc:
            return error(str(exc), 400)

        script = Script(
            user_id=user_uuid,
            name=name,
            content=content_str,
            version=1,
            is_active=True,
        )
        db.session.add(script)
        db.session.commit()

        resp = {"script": script.to_dict()}
        if warnings:
            resp["warnings"] = warnings
        return success(resp, 201)


class ScriptDetailResource(Resource):
    @jwt_required()
    def get(self, script_id: str):
        """Get a single script by ID."""
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
            s_uuid = uuid.UUID(str(script_id))
        except ValueError:
            return error("Invalid ID format.", 400)

        script = Script.query.filter_by(id=s_uuid, user_id=user_uuid, is_active=True).first()
        if not script:
            return error("Script not found.", 404)

        return success({"script": script.to_dict()}, 200)

    @jwt_required()
    def put(self, script_id: str):
        """Update an existing script. Increments version on each save."""
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
            s_uuid = uuid.UUID(str(script_id))
        except ValueError:
            return error("Invalid ID format.", 400)

        script = Script.query.filter_by(id=s_uuid, user_id=user_uuid, is_active=True).first()
        if not script:
            return error("Script not found.", 404)

        body = request.get_json(silent=True) or {}
        try:
            name, content_str, _, warnings = _parse_and_validate(body)
        except ValueError as exc:
            return error(str(exc), 400)

        script.name = name
        script.content = content_str
        script.version = (script.version or 1) + 1  # increment version on every update
        db.session.commit()

        resp = {"script": script.to_dict()}
        if warnings:
            resp["warnings"] = warnings
        return success(resp, 200)

    @jwt_required()
    def delete(self, script_id: str):
        """Soft-delete a script (sets is_active=False)."""
        user_id = get_jwt_identity()
        try:
            user_uuid = uuid.UUID(str(user_id))
            s_uuid = uuid.UUID(str(script_id))
        except ValueError:
            return error("Invalid ID format.", 400)

        script = Script.query.filter_by(id=s_uuid, user_id=user_uuid, is_active=True).first()
        if not script:
            return error("Script not found.", 404)

        # Check if the script is in use by any active campaign
        active_campaigns = [
            c for c in script.campaigns
            if getattr(c, "status", None) in ("active", "running", "paused")
        ]
        if active_campaigns:
            names = ", ".join(getattr(c, "name", str(c.id)) for c in active_campaigns[:3])
            return error(
                f"Cannot delete: script is used by active campaign(s): {names}. "
                "Stop the campaign first.",
                409,
            )

        script.is_active = False
        db.session.commit()
        return success({"message": "Script deleted successfully."}, 200)
