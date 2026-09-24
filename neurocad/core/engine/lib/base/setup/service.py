# neurocad/core/engine/lib/base/setup/llm/service.py

"""
LLM settings service.

Reads / writes a single row in the `settings` table:

    domain  = 'neurocad'
    subsys  = 'setup'
    module  = 'llm'
    section = NULL
    key     = 'llm'

The `value` column holds JSON in the CoreEngineLibBaseSetupLlmSettings
shape. Secret fields (see SECRET_FIELDS below) are encrypted with Fernet
(neurocad/utils/crypto.py) at rest and decrypted on read.

Priority when resolving a value at runtime:
    1. Database (this row, if present and non-empty)
    2. .env / config.py (fallback, used to seed the row on first read)
    3. Hardcoded default in the provider class

An in-memory cache is kept so providers can read the config synchronously
without hitting the DB on every call. Call invalidate_cache() after any
external write.

Namespace: CoreEngineLibBaseSetupLlmService
"""

import json
import logging
from typing import Dict, Optional

from sqlalchemy import select

from neurocad.config import settings
from neurocad.core.models.setting import Setting
from neurocad.utils.crypto import encrypt, decrypt, is_crypto_available
from neurocad.utils.sqlite import get_db_sqlite
from .schema import (
    CoreEngineLibBaseSetupLlmSettings,
    CoreEngineLibBaseSetupLlmProviderConfig,
)


logger = logging.getLogger(__name__)


# ============================================
# SETTINGS ROW IDENTITY
# ============================================

DOMAIN = "neurocad"
SUBSYS = "setup"
MODULE = "llm"
SECTION = None
KEY = "llm"

# Caption / description for the settings row (used by UI / admin tools).
CAPTION = "Настройки LLM"
DESCRIPTION = "API-ключи, модели и лимиты провайдеров"


# ============================================
# SECRET FIELDS (domain knowledge — LLM only)
# ============================================

# Field names whose values are encrypted at rest.
# Applies to any provider, any nesting level — the field name
# is what matters, not the path.
SECRET_FIELDS = {"api_key", "auth_key", "ca_pem"}


# ============================================
# PROVIDER DEFAULTS (from env / config)
# ============================================

# Used to seed the DB row on first read — and as fallback
# when a field is missing in the DB.
PROVIDER_DEFAULTS: Dict[str, Dict[str, object]] = {
    "deepseek": {
        "api_key": settings.DEEPSEEK_API_KEY,
        "base_url": settings.DEEPSEEK_BASE_URL,
        "model": settings.DEEPSEEK_MODEL,
        "max_output_tokens": settings.DEEPSEEK_MAX_OUTPUT_TOKENS,
        "timeout": settings.DEEPSEEK_TIMEOUT,
    },
    "openai": {
        "api_key": settings.OPENAI_API_KEY,
        "base_url": settings.OPENAI_BASE_URL,
        "model": settings.OPENAI_MODEL,
        "max_output_tokens": settings.OPENAI_MAX_OUTPUT_TOKENS,
        "timeout": settings.OPENAI_TIMEOUT,
    },
    "yandex": {
        "api_key": settings.YANDEX_API_KEY,
        "folder_id": settings.YANDEX_FOLDER_ID,
        "model": settings.YANDEX_MODEL,
        "max_output_tokens": settings.YANDEX_MAX_OUTPUT_TOKENS,
        "timeout": settings.YANDEX_TIMEOUT,
    },
    "gigachat": {
        "auth_key": settings.GIGACHAT_AUTH_KEY,
        "scope": settings.GIGACHAT_SCOPE,
        "model": settings.GIGACHAT_MODEL,
        "max_output_tokens": settings.GIGACHAT_MAX_OUTPUT_TOKENS,
        "timeout": settings.GIGACHAT_TIMEOUT,
    },
    "gemini": {
        "api_key": settings.GEMINI_API_KEY,
        "model": settings.GEMINI_MODEL,
        "max_output_tokens": settings.GEMINI_MAX_OUTPUT_TOKENS,
        "timeout": settings.GEMINI_TIMEOUT,
    },
}

# Default active provider — from env, overridden by the DB row.
DEFAULT_ACTIVE_PROVIDER = settings.LLM_PROVIDER


# ============================================
# SERVICE
# ============================================

class CoreEngineLibBaseSetupLlmService:
    """Read / write LLM settings — a single row in `settings`."""

    _cache: Optional[CoreEngineLibBaseSetupLlmSettings] = None

    # ========================================
    # PUBLIC — ASYNC (DB access)
    # ========================================

    @classmethod
    async def get(cls) -> CoreEngineLibBaseSetupLlmSettings:
        """
        Read LLM settings.

        Resolution order:
          1. In-memory cache (if set)
          2. settings table row (key='llm')
          3. env defaults (seeds the row on first read)

        On the very first call (no row in DB), the row is created
        from PROVIDER_DEFAULTS. Secrets are encrypted before insert.
        """
        if cls._cache is not None:
            return cls._cache

        row = await cls._load_row()

        if row is None:
            # No row yet — seed from env.
            logger.info("[LLM settings] No DB row — seeding from env defaults")
            settings_obj = cls._build_default_settings()
            await cls._save_row(settings_obj)
        else:
            settings_obj = cls._parse_value(row.value)

        cls._cache = settings_obj
        return settings_obj

    @classmethod
    async def save(
        cls,
        payload: CoreEngineLibBaseSetupLlmSettings,
    ) -> CoreEngineLibBaseSetupLlmSettings:
        """
        Save LLM settings.

        The payload contains plaintext secrets (client just fetched them
        decrypted and is sending them back). Secrets are encrypted before
        persisting. The cache is refreshed with the payload.
        """
        await cls._save_row(payload)
        cls._cache = payload
        return payload

    # ========================================
    # PUBLIC — SYNC (from cache, for providers)
    # ========================================

    @classmethod
    def get_active_provider(cls) -> str:
        """
        Name of the active provider.

        Sync — reads from cache. Call get() once before use
        (e.g. at application startup).
        """
        if cls._cache is None:
            logger.warning(
                "[LLM settings] Cache is empty — call get() at startup "
                "before using get_active_provider()"
            )
            return DEFAULT_ACTIVE_PROVIDER
        return cls._cache.active_provider or DEFAULT_ACTIVE_PROVIDER

    @classmethod
    def get_provider_config(cls, name: str) -> Dict[str, object]:
        """
        Resolved config for a provider — dict with all known fields.

        Sync — reads from cache. Falls back to PROVIDER_DEFAULTS for
        any field missing in the cache.

        Returned dict is safe to hand to the provider class:
        secrets are already decrypted.
        """
        defaults = dict(PROVIDER_DEFAULTS.get(name, {}))

        if cls._cache is None:
            return defaults

        provider = cls._cache.providers.get(name)
        if provider is None:
            return defaults

        # Overlay non-None fields from the cached config.
        for field, value in provider.model_dump().items():
            if value is not None:
                defaults[field] = value

        return defaults

    @classmethod
    def invalidate_cache(cls) -> None:
        """Drop the in-memory cache. Next get() re-reads from DB."""
        cls._cache = None

    # ========================================
    # INTERNAL — DB
    # ========================================

    @staticmethod
    async def _load_row() -> Optional[Setting]:
        """Load the settings row (key='llm') from the DB."""
        async for session in get_db_sqlite():
            stmt = select(Setting).where(
                Setting.domain == DOMAIN,
                Setting.subsys == SUBSYS,
                Setting.module == MODULE,
                Setting.key == KEY,
                Setting.is_delete == False,  # noqa: E712 (SQLAlchemy needs ==)
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none()
        return None

    @staticmethod
    async def _save_row(payload: CoreEngineLibBaseSetupLlmSettings) -> None:
        """
        Upsert the settings row.

        - If a row with key='llm' exists — update `value` (and caption /
          description for consistency).
        - Otherwise — create it.
        - Secrets are encrypted before JSON serialization.
        """
        encrypted = CoreEngineLibBaseSetupLlmService._encrypt_settings(payload)
        value_json = json.dumps(encrypted, ensure_ascii=False)

        async for session in get_db_sqlite():
            stmt = select(Setting).where(
                Setting.domain == DOMAIN,
                Setting.subsys == SUBSYS,
                Setting.module == MODULE,
                Setting.key == KEY,
            )
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()

            if row is None:
                row = Setting(
                    domain=DOMAIN,
                    subsys=SUBSYS,
                    module=MODULE,
                    section=SECTION,
                    key=KEY,
                    value=value_json,
                    caption=CAPTION,
                    description=DESCRIPTION,
                    is_delete=False,
                )
                session.add(row)
            else:
                row.value = value_json
                row.caption = CAPTION
                row.description = DESCRIPTION
                row.is_delete = False

            await session.commit()
            return

    # ========================================
    # INTERNAL — CONVERSION
    # ========================================

    @staticmethod
    def _build_default_settings() -> CoreEngineLibBaseSetupLlmSettings:
        """Build LLMSettings from env defaults."""
        providers = {}
        for name, cfg in PROVIDER_DEFAULTS.items():
            # Only include non-None fields — leave the rest as None
            # so they don't override env defaults unnecessarily.
            clean = {k: v for k, v in cfg.items() if v is not None}
            providers[name] = CoreEngineLibBaseSetupLlmProviderConfig(**clean)

        return CoreEngineLibBaseSetupLlmSettings(
            active_provider=DEFAULT_ACTIVE_PROVIDER,
            providers=providers,
        )

    @staticmethod
    def _parse_value(value: str) -> CoreEngineLibBaseSetupLlmSettings:
        """
        Parse settings.value JSON into CoreEngineLibBaseSetupLlmSettings,
        decrypting secret fields.
        """
        try:
            raw = json.loads(value) if value else {}
        except (TypeError, ValueError) as e:
            logger.error("[LLM settings] Failed to parse value JSON: %s", e)
            raw = {}

        decrypted = CoreEngineLibBaseSetupLlmService._decrypt_dict(raw)
        return CoreEngineLibBaseSetupLlmSettings(**decrypted)

    @staticmethod
    def _encrypt_settings(
        settings_obj: CoreEngineLibBaseSetupLlmSettings,
    ) -> dict:
        """Serialize settings to dict and encrypt secret fields."""
        data = settings_obj.model_dump()
        return CoreEngineLibBaseSetupLlmService._encrypt_dict(data)

    @staticmethod
    def _encrypt_dict(data: dict) -> dict:
        """Recursively encrypt values of secret fields in a dict."""
        result = {}
        for key, value in data.items():
            if isinstance(value, dict):
                result[key] = CoreEngineLibBaseSetupLlmService._encrypt_dict(value)
            elif key in SECRET_FIELDS and value is not None:
                result[key] = encrypt(value)
            else:
                result[key] = value
        return result

    @staticmethod
    def _decrypt_dict(data: dict) -> dict:
        """Recursively decrypt values of secret fields in a dict."""
        result = {}
        for key, value in data.items():
            if isinstance(value, dict):
                result[key] = CoreEngineLibBaseSetupLlmService._decrypt_dict(value)
            elif key in SECRET_FIELDS and value is not None:
                result[key] = decrypt(value)
            else:
                result[key] = value
        return result

    # ========================================
    # PUBLIC — STATUS
    # ========================================

    @staticmethod
    def is_crypto_available() -> bool:
        """
        True if NEUROCAD_SECRET_KEY is configured and valid.
        Used by the route to warn the client when secrets
        would be stored in plaintext.
        """
        return is_crypto_available()