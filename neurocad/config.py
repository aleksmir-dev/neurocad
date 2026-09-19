# neurocad/config.py

from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path


class Settings(BaseSettings):
    """
    Application settings.
    All fields have default values. .env file is optional.
    """

    # ============================================
    # APPLICATION
    # ============================================

    # Application host.
    APP_HOST: str = "127.0.0.1"

    # Application port.
    APP_PORT: int = 8000

    # Main page URL (redirect from /).
    APP_MAIN_PAGE: str = "/core/engine/app"

    # Debug mode.
    DEBUG: bool = True

    # ============================================
    # DATABASES
    # ============================================

    # MySQL URL (optional).
    DATABASE_URL: str = ""

    # SQLite URL for async.
    SQLITE_URL: str = "sqlite+aiosqlite:///base/neurocad.db"

    # SQLite URL for sync (Alembic).
    SQLITE_URL_SYNC: str = "sqlite:///base/neurocad.db"

    # ============================================
    # SECURITY
    # ============================================

    # Secret key for JWT.
    SECRET_KEY: str = "your-secret-key-change-in-production"

    # JWT algorithm.
    ALGORITHM: str = "HS256"

    # Access token lifetime (minutes).
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # ============================================
    # SUPERADMIN
    # ============================================

    # Default superadmin login.
    SUPERADMIN_LOGIN: str = "admin"

    # Default superadmin password.
    SUPERADMIN_PASSWORD: str = "admin"

    # ============================================
    # PATHS (relative to cwd)
    # ============================================

    # Media files directory.
    MEDIA_PATH: Path = Path("media")

    # Database directory.
    BASE_PATH: Path = Path("base")

    # Static files directory.
    STATIC_PATH: Path = Path("static")

    # Logs directory.
    LOG_PATH: Path = Path("log")

    # ============================================
    # LLM
    # ============================================

    # Active provider: 'deepseek' | 'yandex' | 'gigachat' | 'gemini'
    LLM_PROVIDER: str = "deepseek"

    # --- DeepSeek ---

    # DeepSeek API key.
    DEEPSEEK_API_KEY: Optional[str] = None

    # DeepSeek API base URL.
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"

    # DeepSeek model name.
    DEEPSEEK_MODEL: str = "deepseek-flash"

    # Max output tokens.
    DEEPSEEK_MAX_OUTPUT_TOKENS: int = 12000

    # Temperature (0.0 - 1.0).
    DEEPSEEK_TEMPERATURE: float = 0.3

    # Request timeout (seconds).
    DEEPSEEK_TIMEOUT: int = 150

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()