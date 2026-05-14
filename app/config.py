import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv(override=True)


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


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
    # Twilio
    TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
    TWILIO_DEFAULT_KB_ID = os.environ.get("TWILIO_DEFAULT_KB_ID", "")
    TWILIO_TENANT_KB_BY_NUMBER = os.environ.get("TWILIO_TENANT_KB_BY_NUMBER", "")
    TWILIO_TENANT_KB_BY_ACCOUNT = os.environ.get("TWILIO_TENANT_KB_BY_ACCOUNT", "")
    TWILIO_REQUIRE_TENANT_MATCH = _env_bool("TWILIO_REQUIRE_TENANT_MATCH", False)
    PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")
    TWILIO_REALTIME_STREAM_ENABLED = _env_bool("TWILIO_REALTIME_STREAM_ENABLED", False)
    TWILIO_MEDIA_STREAM_URL = os.environ.get("TWILIO_MEDIA_STREAM_URL", "")
    TWILIO_MEDIA_STREAM_TRACK = os.environ.get("TWILIO_MEDIA_STREAM_TRACK", "inbound_track")
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
    
    # Fix Render's 'postgres://' to 'postgresql://' for SQLAlchemy 1.4+
    db_url = os.environ.get("DATABASE_URL")
    if db_url and db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
        config_obj.SQLALCHEMY_DATABASE_URI = db_url
        
    return config_obj
