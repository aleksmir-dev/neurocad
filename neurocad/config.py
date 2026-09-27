# neurocad/config.py

from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path


class Settings(BaseSettings):
    """
    Application settings.
    All fields have default values. .env file is optional.

    Priority for LLM settings:
      1. Database (settings table, key='llm', encrypted secrets)
      2. .env / this file
      3. Hardcoded default in the provider class
    """

    # ============================================
    # APPLICATION
    # ============================================

    # Application host.
    APP_HOST: str = "127.0.0.1"

    # Application port.
    APP_PORT: int = 8000

    # Main page URL (redirect from /).
    APP_MAIN_PAGE: str = "/core/engine/default"

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
    # USERS
    # ============================================

    # Auto-create a personal "Каталог статей" nav for every new user.
    # When True, every registered user gets their own Nav row pointing
    # at the built-in 'default' module, so they immediately have a
    # place to create pages.
    # Set to False (or 0 in .env) to register users without any nav.
    USER_AUTO_CREATE_NAV: bool = True

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
    # LLM — CORE
    # ============================================

    # Active provider: 'deepseek' | 'openai' | 'yandex' | 'gigachat' | 'gemini'
    LLM_PROVIDER: str = "deepseek"

    # Use mock LLM provider instead of a real one.
    # 1 — return a canned response (no network, no tokens, instant).
    # 0 — use the real provider from LLM_PROVIDER.
    # Handy for testing the WS/run orchestration end-to-end.
    LLM_MOCK: int = 0

    # Artificial delay (seconds) for the mock provider, to mimic real latency.
    # Ignored when LLM_MOCK = 0.
    LLM_MOCK_DELAY: float = 1.0

    # Secret key for encrypting API keys stored in the database (Fernet).
    # Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # If empty — DB-stored secrets are disabled, .env values are used.
    NEUROCAD_SECRET_KEY: Optional[str] = None

    # ============================================
    # LLM — DEEPSEEK (default provider)
    # ============================================

    # DeepSeek API key.
    DEEPSEEK_API_KEY: Optional[str] = None

    # DeepSeek API base URL.
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"

    # DeepSeek model name.
    DEEPSEEK_MODEL: str = "deepseek-flash"

    # Max output tokens.
    DEEPSEEK_MAX_OUTPUT_TOKENS: int = 12000

    # Request timeout (seconds).
    DEEPSEEK_TIMEOUT: int = 150

    # ============================================
    # LLM — OPENAI
    # ============================================

    # OpenAI API key.
    OPENAI_API_KEY: Optional[str] = None

    # OpenAI API base URL.
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"

    # OpenAI model name.
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Max output tokens.
    OPENAI_MAX_OUTPUT_TOKENS: int = 4096

    # Request timeout (seconds).
    OPENAI_TIMEOUT: int = 120

    # ============================================
    # LLM — YANDEXGPT
    # ============================================

    # Yandex Cloud API key.
    YANDEX_API_KEY: Optional[str] = None

    # Yandex Cloud folder ID.
    YANDEX_FOLDER_ID: Optional[str] = None

    # Model name.
    YANDEX_MODEL: str = "yandexgpt-lite"

    # Max output tokens.
    YANDEX_MAX_OUTPUT_TOKENS: int = 4096

    # Request timeout (seconds).
    YANDEX_TIMEOUT: int = 120

    # ============================================
    # LLM — GIGACHAT
    # ============================================

    # GigaChat Authorization Key (from Sber Studio).
    #
    # Can be either:
    #   - "client_id:client_secret" (plain)
    #   - base64("client_id:client_secret") — what Sber Studio gives you
    #
    # The provider detects the format and uses the appropriate endpoint.
    GIGACHAT_AUTH_KEY: Optional[str] = None

    # OAuth scope: GIGACHAT_API_PERS | GIGACHAT_API_B2B | GIGACHAT_API_CORP
    GIGACHAT_SCOPE: str = "GIGACHAT_API_PERS"

    # Model name.
    GIGACHAT_MODEL: str = "GigaChat-2-Lite"

    # Max output tokens.
    GIGACHAT_MAX_OUTPUT_TOKENS: int = 8192

    # Request timeout (seconds).
    GIGACHAT_TIMEOUT: int = 120

    # Russian Trusted Root CA (PEM text). Optional — only needed
    # if the system trust store does not include the Ministry of
    # Digital Development root CA.
    GIGACHAT_CA_PEM: Optional[str] = None

    # ============================================
    # LLM — GOOGLE GEMINI
    # ============================================

    # Google AI Studio API key.
    GEMINI_API_KEY: Optional[str] = None

    # Model name.
    GEMINI_MODEL: str = "gemini-1.5-flash"

    # Max output tokens.
    GEMINI_MAX_OUTPUT_TOKENS: int = 8192

    # Request timeout (seconds).
    GEMINI_TIMEOUT: int = 120

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()