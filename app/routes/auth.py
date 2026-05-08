from flask import request
from flask_restful import Resource
from flask_jwt_extended import (
    jwt_required,
    get_jwt_identity,
    create_access_token,
)

from app.services.auth_service import AuthService
from app.utils.validators import validate_email, validate_password, validate_full_name
from app.utils.errors import AppError
from app.utils.responses import success, error


class SignupResource(Resource):
    def post(self):
        body = request.get_json(silent=True) or {}
        try:
            email = validate_email(body.get("email", ""))
            password = validate_password(body.get("password", ""))
            full_name = validate_full_name(body.get("full_name", ""))
        except ValueError as exc:
            return error(str(exc), 400)

        try:
            result = AuthService.signup(email, password, full_name)
        except AppError as exc:
            return error(exc.message, exc.status_code)

        return success(result, 201)


class LoginResource(Resource):
    def post(self):
        body = request.get_json(silent=True) or {}
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")

        if not email or not password:
            return error("Email and password are required.", 400)

        try:
            result = AuthService.login(email, password)
        except AppError as exc:
            return error(exc.message, exc.status_code)

        return success(result, 200)


class RefreshResource(Resource):
    @jwt_required(refresh=True)
    def post(self):
        identity = get_jwt_identity()
        access_token = create_access_token(identity=identity)
        return success({"access_token": access_token}, 200)


class MeResource(Resource):
    @jwt_required()
    def get(self):
        user_id = get_jwt_identity()
        try:
            user = AuthService.get_user_by_id(user_id)
        except AppError as exc:
            return error(exc.message, exc.status_code)

        return success({"user": user.to_dict()}, 200)


class ForgotPasswordResource(Resource):
    def post(self):
        body = request.get_json(silent=True) or {}
        email = body.get("email", "").strip().lower()

        if not email:
            return error("Email is required.", 400)

        try:
            success_sent = AuthService.forgot_password(email)
            if not success_sent:
                return error("Failed to send password email. Please try again later.", 500)
        except AppError as exc:
            return error(exc.message, exc.status_code)
        except Exception as e:
            return error(str(e), 500)

        return success({"message": "If an account exists with this email, a new password has been sent."}, 200)
