# neurocad/config.py

from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path


class Settings(BaseSettings):
    """Настройки приложения.
    
    Все поля имеют дефолтные значения. .env-файл опционален.
    """

    # ============================================
    # ПРИЛОЖЕНИЕ
    # ============================================
    APP_HOST: str = "127.0.0.1"
    APP_PORT: int = 8000
    APP_PROT: str = "http"
    APP_DOMAIN: str = "127.0.0.1"
    APP_THEME: str = "default"
    APP_TITLE: str = "NeuroCad"
    APP_MAIN_PAGE: str = "/core/engine/app"
    DEBUG: bool = True
    DEVELOP: bool = False

    # ============================================
    # БАЗЫ ДАННЫХ
    # ============================================
    DATABASE_URL: str = "" # "mysql+aiomysql://user:pass@localhost/neurocad"
    SQLITE_URL: str = "sqlite+aiosqlite:///base/neurocad.db"        # async
    SQLITE_URL_SYNC: str = "sqlite:///base/neurocad.db"             # sync (Alembic)

    # ============================================
    # БЕЗОПАСНОСТЬ
    # ============================================
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # ============================================
    # СУПЕРАДМИН
    # ============================================
    SUPERADMIN_LOGIN: str = "admin"
    SUPERADMIN_PASSWORD: str = "admin"

    # ============================================
    # ПУТИ (относительно cwd)
    # ============================================
    APP_JSON: Path = Path("app/app.json")
    MEDIA_PATH: Path = Path("media")
    BASE_PATH: Path = Path("base")
    STATIC_PATH: Path = Path("static")
    LOG_PATH: Path = Path("log")
    PLUGINS_PATH: Path = Path("plugins")

    # ============================================
    # LLM
    # ============================================
    # Активный провайдер: 'deepseek' | 'yandex' | 'gigachat' | 'gemini'
    LLM_PROVIDER: str = "deepseek"

    # --- DeepSeek ---
    DEEPSEEK_API_KEY: Optional[str] = None
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-flash"
    DEEPSEEK_MAX_OUTPUT_TOKENS: int = 12000
    DEEPSEEK_TEMPERATURE: float = 0.3
    DEEPSEEK_TIMEOUT: int = 150    

    # ============================================
    # Яндекс.Вебмастер
    # ============================================
    RSS_YANDEX_CLIENT_ID: Optional[str] = None
    RSS_YANDEX_CLIENT_SECRET: Optional[str] = None
    RSS_YANDEX_ENABLED: bool = False
    RSS_YANDEX_TOKEN_FILE: str = "base/rss_yandex_token.txt"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    @property
    def RSS_YANDEX_SITE_URL(self) -> str:
        """Полный URL сайта из APP_PROT и APP_DOMAIN"""
        return f"{self.APP_PROT}://{self.APP_DOMAIN}"


settings = Settings()