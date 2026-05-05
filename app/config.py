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
    # Voice AI
    ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
    ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
    # Recording storage
    RECORDINGS_DIR = os.environ.get("RECORDINGS_DIR", "./recordings")
    # TTS audio output
    TTS_AUDIO_DIR = os.environ.get("TTS_AUDIO_DIR", "./tts_audio")


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
    # Use APP_ENV instead of FLASK_ENV (removed in Flask 3.0)
    env = os.environ.get("APP_ENV", "development")
    return config_map.get(env, DevelopmentConfig)
