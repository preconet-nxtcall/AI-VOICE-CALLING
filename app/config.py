import os
from datetime import timedelta
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(override=True)


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _ensure_writable_dir(dir_path: str, default_fallback: str) -> str:
    if not dir_path:
        return default_fallback
    try:
        path = Path(dir_path)
        path.mkdir(parents=True, exist_ok=True)
        # Test write permission by creating a temporary file
        test_file = path / f".write_test_{os.getpid()}"
        test_file.touch()
        test_file.unlink()
        return dir_path
    except Exception:
        import logging
        logging.getLogger(__name__).warning(
            "Directory '%s' is not writable or cannot be created. Falling back to '%s'.",
            dir_path,
            default_fallback,
        )
        try:
            fallback_path = Path(default_fallback)
            fallback_path.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass
        return default_fallback


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-this-in-production")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "jwt-change-this-in-production")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    BCRYPT_LOG_ROUNDS = 12
    # RAG / embeddings
    OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
    FAISS_INDEX_DIR = os.environ.get("FAISS_INDEX_DIR", "./faiss_indices")
    # VoiceLink Telephony
    VOICELINK_API_TOKEN = os.environ.get("VOICELINK_API_TOKEN", "")
    VOICELINK_DID_NUMBER = os.environ.get("VOICELINK_DID_NUMBER", "")
    VOICELINK_COUNTRY_CODE = os.environ.get("VOICELINK_COUNTRY_CODE", "")
    # Public URL for VoiceLink WebSocket + webhook callbacks
    PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")
    # Voice AI
    ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
    ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
    # Recording storage
    RECORDINGS_DIR = os.environ.get("RECORDINGS_DIR", "./recordings")
    # TTS audio output
    TTS_AUDIO_DIR = os.environ.get("TTS_AUDIO_DIR", "./tts_audio")
    # Distributed task queue / dialer
    CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
    CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0"))
    DIALER_USE_CELERY = _env_bool("DIALER_USE_CELERY", False)
    DIALER_SWEEP_TASK_INTERVAL_SECONDS = int(os.environ.get("DIALER_SWEEP_TASK_INTERVAL_SECONDS", "15"))
    CELERY_TASK_DEFAULT_QUEUE = os.environ.get("CELERY_TASK_DEFAULT_QUEUE", "default")
    CELERY_TASK_DIALER_QUEUE = os.environ.get("CELERY_TASK_DIALER_QUEUE", "dialer")
    CELERY_TASK_ACKS_LATE = _env_bool("CELERY_TASK_ACKS_LATE", True)
    CELERY_WORKER_PREFETCH_MULTIPLIER = int(os.environ.get("CELERY_WORKER_PREFETCH_MULTIPLIER", "1"))
    CELERY_TASK_TIME_LIMIT = int(os.environ.get("CELERY_TASK_TIME_LIMIT", "90"))
    CELERY_TASK_SOFT_TIME_LIMIT = int(os.environ.get("CELERY_TASK_SOFT_TIME_LIMIT", "60"))
    CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = _env_bool("CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP", True)
    CELERY_DIALER_RETRY_BACKOFF = _env_bool("CELERY_DIALER_RETRY_BACKOFF", True)
    CELERY_DIALER_RETRY_BACKOFF_MAX = int(os.environ.get("CELERY_DIALER_RETRY_BACKOFF_MAX", "120"))
    CELERY_DIALER_RETRY_JITTER = _env_bool("CELERY_DIALER_RETRY_JITTER", True)
    CELERY_DIALER_MAX_RETRIES = int(os.environ.get("CELERY_DIALER_MAX_RETRIES", "8"))


class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/saas_ai_dev",
    )


class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=30)
    BCRYPT_LOG_ROUNDS = 13


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "TEST_DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/saas_ai_test",
    )


config_map = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}


def get_config():
    # Use APP_ENV or check if running on Render
    env = os.environ.get("APP_ENV")
    if not env:
        # Auto-detect Render environment
        if os.environ.get("RENDER"):
            env = "production"
        else:
            env = "development"
            
    config_obj = config_map.get(env, DevelopmentConfig)
    
    # Ensure writable directories for storage
    config_obj.FAISS_INDEX_DIR = _ensure_writable_dir(
        os.environ.get("FAISS_INDEX_DIR", config_obj.FAISS_INDEX_DIR),
        "./faiss_indices"
    )
    config_obj.RECORDINGS_DIR = _ensure_writable_dir(
        os.environ.get("RECORDINGS_DIR", config_obj.RECORDINGS_DIR),
        "./recordings"
    )
    config_obj.TTS_AUDIO_DIR = _ensure_writable_dir(
        os.environ.get("TTS_AUDIO_DIR", config_obj.TTS_AUDIO_DIR),
        "./tts_audio"
    )
    
    # Keep os.environ up-to-date so os.environ.get() matches the validated writable paths
    os.environ["FAISS_INDEX_DIR"] = config_obj.FAISS_INDEX_DIR
    os.environ["RECORDINGS_DIR"] = config_obj.RECORDINGS_DIR
    os.environ["TTS_AUDIO_DIR"] = config_obj.TTS_AUDIO_DIR
    
    # Fix Render's 'postgres://' to 'postgresql://' for SQLAlchemy 1.4+
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        # Fallback to the one defined in render.yaml if missing from environment
        db_url = "postgresql://ai_voice_calling_user:KUAWPmFAhXjggtKiEUEUnww8hIBTYs3w@dpg-d7sssk67r5hc738j8ogg-a/ai_voice_calling"
        
    if db_url:
        if db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql://", 1)
        config_obj.SQLALCHEMY_DATABASE_URI = db_url
        
    return config_obj
