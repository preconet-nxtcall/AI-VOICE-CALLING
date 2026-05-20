from flask import Flask, jsonify, send_from_directory
import os
from flask_restful import Api
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from flask_cors import CORS

from app.config import get_config
from app.extensions import sock
from app.models import db, bcrypt
from app.routes import register_routes


def create_app(config_override=None):
    # Set static_folder to the built frontend directory (using absolute path)
    basedir = os.path.abspath(os.path.dirname(__file__))
    static_folder = os.path.join(basedir, "..", "frontend", "dist")
    
    app = Flask(__name__, static_folder=static_folder, static_url_path="/")
    CORS(app) # Enable CORS for development
    sock.init_app(app)
    app.config.from_object(get_config())

    if config_override:
        app.config.update(config_override)

    db.init_app(app)
    bcrypt.init_app(app)
    Migrate(app, db)
    
    # Programmatically run migrations on startup to keep DB in sync
    try:
        from flask_migrate import upgrade
        with app.app_context():
            app.logger.info("Programmatically running database upgrade...")
            upgrade()
            app.logger.info("Database upgrade completed successfully.")
    except Exception as e:
        app.logger.error("Failed to run database upgrade: %s", e)

    jwt = JWTManager(app)

    # Distributed queue / dialer mode selection
    app.celery = None
    if app.config.get("DIALER_USE_CELERY", False):
        try:
            from app.celery_app import create_celery
            from app.tasks.dialer_tasks import register_dialer_tasks

            app.celery = create_celery(app)
            sweep_once_task = register_dialer_tasks(app.celery)
            app.extensions["dialer_sweep_task"] = sweep_once_task
            app.logger.info("Dialer configured for Celery distributed queue mode.")
        except Exception as e:
            app.logger.error("Failed to initialize Celery dialer mode: %s", e)
    elif os.environ.get("START_DIALER", "true").lower() == "true":
        try:
            from app.services.dialer_worker import start_dialer

            start_dialer(app)
            app.logger.info("Dialer configured for in-process thread mode.")
        except Exception as e:
            app.logger.error("Failed to start background dialer: %s", e)

    # Import models here so Flask-Migrate can detect them
    from app.models import user  # noqa: F401
    from app.models import knowledge_base  # noqa: F401
    from app.models import subscription  # noqa: F401
    from app.models import script  # noqa: F401
    from app.models import campaign  # noqa: F401
    from app.models import call_log  # noqa: F401
    from app.models import ingestion_job  # noqa: F401
    from app.models import lead  # noqa: F401

    api = Api(app, prefix="/api/v1")
    register_routes(api)

    from app.routes.twilio_voice import twilio_voice_bp
    app.register_blueprint(twilio_voice_bp)

    from app.routes.voicelink_voice import voicelink_voice_bp, register_voicelink_websocket
    app.register_blueprint(voicelink_voice_bp)
    register_voicelink_websocket(sock)


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
    from werkzeug.exceptions import HTTPException, NotFound

    @app.errorhandler(Exception)
    def handle_exception(exc):
        # If it's a 404 on a non-API route, serve the SPA index.html
        if isinstance(exc, NotFound):
            from flask import request
            if not request.path.startswith("/api/"):
                return send_from_directory(app.static_folder, "index.html")

        if isinstance(exc, HTTPException):
            return jsonify({"success": False, "error": exc.description}), exc.code
        
        import traceback
        with open("debug.log", "a") as f:
            f.write(traceback.format_exc())
        app.logger.exception("Unhandled exception: %s", exc)
        return jsonify({"success": False, "error": "An internal server error occurred."}), 500

    # Route to serve the frontend SPA
    # IMPORTANT: /voice/* paths must NOT be caught here — those are WebSocket/HTTP endpoints
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve(path):
        # Never serve index.html for backend API or voice WebSocket paths
        if path.startswith("api/") or path.startswith("voice/") or path.startswith("health"):
            from flask import abort
            abort(404)
        if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        else:
            return send_from_directory(app.static_folder, "index.html")

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "saas-ai-backend"}

    return app
