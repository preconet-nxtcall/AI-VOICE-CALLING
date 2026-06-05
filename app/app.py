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
    if os.environ.get("SKIP_MIGRATIONS") != "true":
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

    @app.get("/api/v1/sys-info")
    def sys_info():
        import sys
        try:
            import audioop
            has_audioop = True
        except ImportError:
            has_audioop = False
        return {
            "has_audioop": has_audioop,
            "python": sys.version
        }

    global_ws_logs = []
    app.config['WS_LOGS'] = global_ws_logs

    global_webhook_logs = []
    app.config['WEBHOOK_LOGS'] = global_webhook_logs

    @app.get("/api/v1/ws-logs")
    def ws_logs():
        return {"logs": app.config.get('WS_LOGS', [])[-200:]}

    @app.get("/api/v1/ws-file-logs")
    def ws_file_logs():
        from pathlib import Path
        paths_to_try = [Path("/data/voicelink_ws.log"), Path("./voicelink_ws.log")]
        lines = []
        for path in paths_to_try:
            if path.exists():
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        lines = f.readlines()
                    break
                except Exception:
                    continue
        filtered = [line.rstrip("\n") for line in lines if "MEDIA RECEIVED" not in line]
        return {"logs": filtered[-1000:]}

    @app.get("/api/v1/webhook-logs")
    def webhook_logs():
        return {"logs": app.config.get('WEBHOOK_LOGS', [])[-25:]}

    @app.get("/api/v1/debug-logs")
    def get_debug_logs():
        from flask import Response
        output = []
        for fn in ["gunicorn_error.log", "gunicorn_access.log", "debug.log"]:
            if os.path.exists(fn):
                try:
                    with open(fn, "r", encoding="utf-8", errors="ignore") as f:
                        output.append(f"=== {fn} ===\n" + f.read()[-10000:])
                except Exception as e:
                    output.append(f"=== {fn} error: {e} ===")
            else:
                output.append(f"=== {fn} does not exist ===")
        return Response("\n\n".join(output), mimetype="text/plain")


    @app.get("/api/v1/kb-diagnostics")
    def kb_diagnostics():
        """Diagnostic: check which FAISS indices exist on disk vs what DB says."""
        from pathlib import Path
        from app.models.knowledge_base import KnowledgeBase, Document
        from app.models.ingestion_job import IngestionJob
        from app.services.embedding_service import _get_index_base_dir

        faiss_dir = Path(_get_index_base_dir())
        result = {
            "faiss_base_dir": str(faiss_dir),
            "faiss_dir_exists": faiss_dir.exists(),
            "knowledge_bases": []
        }

        try:
            kbs = KnowledgeBase.query.all()
            for kb in kbs:
                kb_path = faiss_dir / str(kb.id)
                index_file = kb_path / "index.faiss"
                docs = Document.query.filter_by(knowledge_base_id=kb.id).all()
                jobs = IngestionJob.query.filter_by(knowledge_base_id=kb.id).all()
                result["knowledge_bases"].append({
                    "kb_id": str(kb.id),
                    "kb_name": kb.name,
                    "user_id": str(kb.user_id),
                    "index_dir_exists": kb_path.exists(),
                    "index_faiss_exists": index_file.exists(),
                    "index_faiss_size_bytes": index_file.stat().st_size if index_file.exists() else 0,
                    "document_count": len(docs),
                    "documents": [{
                        "id": str(d.id),
                        "filename": d.filename,
                        "has_content": bool(d.content and d.content.strip()),
                        "content_len": len(d.content or "")
                    } for d in docs],
                    "ingestion_jobs": [{
                        "id": str(j.id),
                        "status": j.status,
                        "chunks_embedded": j.chunks_embedded,
                        "error": j.error_message
                    } for j in jobs]
                })
        except Exception as ex:
            result["error"] = str(ex)

        return jsonify(result), 200

    @app.post("/api/v1/kb-reindex")
    def kb_reindex():
        """Re-build FAISS index for a KB from document content already stored in DB."""
        from flask import request as req
        from app.models.knowledge_base import KnowledgeBase, Document
        from app.services.embedding_service import EmbeddingService
        import uuid as _uuid

        data = req.get_json(silent=True) or {}
        kb_id = str(data.get("kb_id") or "").strip()
        secret = str(data.get("secret") or "").strip()

        if secret != "reindex-2026":
            return jsonify({"success": False, "error": "Unauthorized"}), 403

        if not kb_id:
            return jsonify({"success": False, "error": "kb_id required"}), 400

        try:
            kb = KnowledgeBase.query.filter_by(id=_uuid.UUID(kb_id)).first()
            if not kb:
                return jsonify({"success": False, "error": "KB not found"}), 404

            docs = Document.query.filter_by(knowledge_base_id=kb.id).all()
            if not docs:
                return jsonify({"success": False, "error": "No documents in KB"}), 404

            total_chunks = 0
            results = []
            for doc in docs:
                if not doc.content or not doc.content.strip():
                    results.append({"doc": doc.filename, "status": "skipped - no content"})
                    continue
                chunks = EmbeddingService.embed_document(
                    knowledge_base_id=str(kb.id),
                    document_id=str(doc.id),
                    filename=doc.filename,
                    text=doc.content,
                )
                total_chunks += chunks
                results.append({"doc": doc.filename, "chunks": chunks, "status": "ok"})

            return jsonify({
                "success": True,
                "kb_id": kb_id,
                "total_chunks": total_chunks,
                "documents": results
            }), 200
        except Exception as exc:
            import traceback
            return jsonify({"success": False, "error": str(exc), "traceback": traceback.format_exc()}), 500

    def pre_warm_tts():
        with app.app_context():
            try:
                app.logger.info("[TTS Pre-warm] Starting pre-warm of default Hindi welcome message...")
                from app.services.tts_service import TTSService, _get_config
                welcome_msg = "नमस्ते, मैं आपका एआई एजेंट हूं। मैं आपकी कैसे मदद कर सकता हूं?"
                female_voice = _get_config("ELEVENLABS_VOICE_ID_HINDI_FEMALE")
                male_voice = _get_config("ELEVENLABS_VOICE_ID_HINDI_MALE")
                default_voice = _get_config("ELEVENLABS_VOICE_ID") or "21m00Tcm4TlvDq8ikWAM"

                TTSService.generate_alaw_8k(welcome_msg, voice_id=None, language="Hindi", gender="female")
                TTSService.generate_alaw_8k(welcome_msg, voice_id=None, language="Hindi", gender="male")
                if female_voice:
                    TTSService.generate_alaw_8k(welcome_msg, voice_id=female_voice, language="Hindi", gender="female")
                if default_voice:
                    TTSService.generate_alaw_8k(welcome_msg, voice_id=default_voice, language="Hindi", gender="female")

                # Pre-warm all active scripts from the database
                try:
                    from app.models.script import Script
                    from app.routes.twilio_voice import _parse_script_config
                    active_scripts = Script.query.filter_by(is_active=True).all()
                    app.logger.info("[TTS Pre-warm] Pre-warming %d active scripts...", len(active_scripts))
                    for script in active_scripts:
                        try:
                            cfg = _parse_script_config(script.content)
                            welcome = str(cfg.get("welcome_message") or "").strip()
                            if welcome:
                                lang = cfg.get("primary_language", "Hindi")
                                gender = cfg.get("voice_style", "female")
                                voice_id = str(cfg.get("voice_id") or "").strip() or None
                                TTSService.generate_alaw_8k(welcome, voice_id=voice_id, language=lang, gender=gender)
                        except Exception as se:
                            app.logger.error("[TTS Pre-warm] Failed to pre-warm script %s: %s", script.id, se)
                except Exception as db_err:
                    app.logger.error("[TTS Pre-warm] Failed to query scripts for pre-warming: %s", db_err)

                app.logger.info("[TTS Pre-warm] Cache pre-warm completed successfully.")
            except Exception as e:
                app.logger.error("[TTS Pre-warm] Failed to pre-warm cache: %s", e)

    import threading
    threading.Thread(target=pre_warm_tts, daemon=True).start()

    return app
