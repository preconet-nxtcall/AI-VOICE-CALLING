from flask import Flask, jsonify
from flask_restful import Api
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from flask_cors import CORS

from app.config import get_config
from app.models import db, bcrypt
from app.routes import register_routes


def create_app(config_override=None):
    app = Flask(__name__)
    CORS(app) # Enable CORS for frontend integration
    app.config.from_object(get_config())

    if config_override:
        app.config.update(config_override)

    db.init_app(app)
    bcrypt.init_app(app)
    Migrate(app, db)
    jwt = JWTManager(app)

    # Import models here so Flask-Migrate can detect them
    from app.models import user  # noqa: F401
    from app.models import knowledge_base  # noqa: F401
    from app.models import subscription  # noqa: F401
    from app.models import campaign  # noqa: F401
    from app.models import call_log  # noqa: F401
    from app.models import ingestion_job  # noqa: F401
    from app.models import lead  # noqa: F401

    api = Api(app, prefix="/api/v1")
    register_routes(api)

    from app.routes.twilio_voice import twilio_voice_bp
    app.register_blueprint(twilio_voice_bp)

    # --- JWT error handlers (return JSON, not HTML) ---

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({"success": False, "error": "Token has expired."}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error_string):
        return jsonify({"success": False, "error": "Invalid token."}), 422

    @jwt.unauthorized_loader
    def missing_token_callback(error_string):
        return jsonify({"success": False, "error": "Authorization token is required."}), 401

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return jsonify({"success": False, "error": "Token has been revoked."}), 401

    # --- Global error handler ---

    from werkzeug.exceptions import HTTPException

    @app.errorhandler(Exception)
    def handle_exception(exc):
        if isinstance(exc, HTTPException):
            return jsonify({"success": False, "error": exc.description}), exc.code
        
        import traceback
        with open("debug.log", "a") as f:
            f.write(f"URI: {app.config.get('SQLALCHEMY_DATABASE_URI')}\n")
            f.write(traceback.format_exc())
        app.logger.exception("Unhandled exception: %s", exc)
        return jsonify({"success": False, "error": "An internal server error occurred."}), 500

    @app.get("/")
    def index():
        return jsonify({
            "status": "online",
            "message": "AINxt.call Backend API is running.",
            "version": "v1",
            "api_prefix": "/api/v1"
        })

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "saas-ai-backend"}

    return app
