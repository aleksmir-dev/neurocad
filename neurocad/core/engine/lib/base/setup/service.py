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

No cache: the DB row is read on every get(). SQLite is fast enough
(indexed lookup by key), and this keeps a single source of truth —
no cache invalidation, no multi-worker desync.

Logging: callers pass `log=app.state.log` (from the endpoint or from
the provider factory). If `log` is None — the service is silent.

Test endpoint:
    test_provider(provider_name, config, log) instantiates the given
    provider with the supplied config and sends a short "ping" request.
    Returns { success, message, detail } — used by POST /test.

    The ping prompt is explicit ("Ответь одним словом: pong") so that
    reasoning models (DeepSeek, some Gemini versions) don't spend all
    their max_tokens on the reasoning trace and return an empty content.
    If the provider still returns an empty content — that is treated as
    success: the connection and the key work, the model just had nothing
    to say.

Namespace: CoreEngineLibBaseSetupLlmService
"""

import json
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
        "ca_pem": settings.GIGACHAT_CA_PEM,
    },
    "gemini": {
        "api_key": settings.GEMINI_API_KEY,
        "base_url": getattr(settings, "GEMINI_BASE_URL", None),
        "proxy_url": getattr(settings, "GEMINI_PROXY_URL", None),
        "model": settings.GEMINI_MODEL,
        "max_output_tokens": settings.GEMINI_MAX_OUTPUT_TOKENS,
        "timeout": settings.GEMINI_TIMEOUT,
    },
}

# Default active provider — from env, overridden by the DB row.
DEFAULT_ACTIVE_PROVIDER = settings.LLM_PROVIDER

#: Provider class names, keyed by provider name — used by test_provider().
#: Keep in sync with neurocad/utils/llm/factory.py _PROVIDERS.
_PROVIDER_MODULES: Dict[str, tuple] = {
    "deepseek": ("neurocad.utils.llm.deepseek", "DeepSeekProvider"),
    "openai":   ("neurocad.utils.llm.openai",   "OpenAIProvider"),
    "yandex":   ("neurocad.utils.llm.yandex",   "YandexProvider"),
    "gigachat": ("neurocad.utils.llm.gigachat", "GigaChatProvider"),
    "gemini":   ("neurocad.utils.llm.gemini",   "GeminiProvider"),
}

#: Prompt for the test endpoint. Kept short and explicit so that
#: reasoning models answer directly instead of spending all their
#: max_tokens on the reasoning trace.
_TEST_SYSTEM_PROMPT = "Отвечай максимально коротко, одним словом."
_TEST_USER_PROMPT = "Ответь одним словом: pong"

#: max_tokens for the test request. Generous enough for reasoning
#: models to produce a short final answer even after thinking.
_TEST_MAX_TOKENS = 64


# ============================================
# SERVICE
# ============================================

class CoreEngineLibBaseSetupLlmService:
    """Read / write LLM settings — a single row in `settings`."""

    # ========================================
    # LOG HELPER
    # ========================================

    @staticmethod
    def _log(log, level: str, message: str) -> None:
        """Write through app.state.log if available, else silently."""
        if log is None:
            return
        fn = getattr(log, f"log_{level}_sync", None)
        if fn is None:
            return
        try:
            fn(target="llm-settings", message=message)
        except Exception:
            pass

    # ========================================
    # PUBLIC — ASYNC (DB access)
    # ========================================

    @classmethod
    async def get(
        cls,
        log=None,
    ) -> CoreEngineLibBaseSetupLlmSettings:
        """
        Read LLM settings.

        Resolution order:
          1. settings table row (key='llm')
          2. env defaults (seeds the row on first read)

        On the very first call (no row in DB), the row is created
        from PROVIDER_DEFAULTS. Secrets are encrypted before insert.

        log — app.state.log from the endpoint (Request / WebSocket).
              If None — the service is silent.
        """
        row = await cls._load_row()

        if row is None:
            # No row yet — seed from env.
            cls._log(log, "info", "No DB row — seeding from env defaults")
            settings_obj = cls._build_default_settings()
            await cls._save_row(settings_obj)
            return settings_obj

        return cls._parse_value(row.value, log=log)

    @classmethod
    async def save(
        cls,
        payload: CoreEngineLibBaseSetupLlmSettings,
        log=None,
    ) -> CoreEngineLibBaseSetupLlmSettings:
        """
        Save LLM settings.

        The payload contains plaintext secrets (client just fetched them
        decrypted and is sending them back). Secrets are encrypted before
        persisting.

        log — app.state.log from the endpoint (Request).
        """
        await cls._save_row(payload)
        return payload

    # ========================================
    # PUBLIC — ASYNC (for providers)
    # ========================================

    @classmethod
    async def get_active_provider(cls, log=None) -> str:
        """Name of the active provider (from the DB row)."""
        settings_obj = await cls.get(log=log)
        return settings_obj.active_provider or DEFAULT_ACTIVE_PROVIDER

    @classmethod
    async def get_provider_config(cls, name: str, log=None) -> Dict[str, object]:
        """
        Resolved config for a provider — dict with all known fields.

        Falls back to PROVIDER_DEFAULTS for any field missing in the DB.

        Returned dict is safe to hand to the provider class:
        secrets are already decrypted.

        log — app.state.log from the provider factory.
        """
        defaults = dict(PROVIDER_DEFAULTS.get(name, {}))

        settings_obj = await cls.get(log=log)
        provider = settings_obj.providers.get(name)
        if provider is None:
            return defaults

        # Overlay non-None fields from the DB config.
        for field, value in provider.model_dump().items():
            if value is not None:
                defaults[field] = value

        return defaults

    # ========================================
    # PUBLIC — TEST PROVIDER
    # ========================================

    @classmethod
    async def test_provider(
        cls,
        provider_name: str,
        config: Dict[str, object],
        log=None,
    ) -> Dict[str, object]:
        """
        Test one provider with the given config.

        Instantiates the provider class and sends a short explicit
        prompt ("Ответь одним словом: pong"). Returns a dict suitable
        for JSONResponse:

            {
              "success": True | False,
              "message": "OK" | "Ошибка Gemini (400)",
              "detail": "<first ~200 chars of the model reply>" |
                        "<API error body>"
            }

        Never raises — any exception is caught and returned as an error.
        """
        name = (provider_name or "").strip().lower()

        if name not in _PROVIDER_MODULES:
            return {
                "success": False,
                "message": f"Неизвестный провайдер: {name!r}",
                "detail": None,
            }

        # Merge caller's config over PROVIDER_DEFAULTS — so fields the
        # client did not send are taken from env / hardcoded defaults.
        merged = dict(PROVIDER_DEFAULTS.get(name, {}))
        for k, v in (config or {}).items():
            if v is not None and v != "":
                merged[k] = v

        try:
            import importlib
            module_path, class_name = _PROVIDER_MODULES[name]
            module = importlib.import_module(module_path)
            provider_cls = getattr(module, class_name)
        except Exception as e:
            return {
                "success": False,
                "message": f"Не удалось загрузить провайдер {name!r}",
                "detail": str(e),
            }

        provider = provider_cls(config=merged, log=log)

        if not provider.is_configured:
            return {
                "success": False,
                "message": "Провайдер не настроен",
                "detail": "Не хватает обязательных полей (ключ / folder_id / auth_key).",
            }

        # Explicit ping — short, direct answer. Reasoning models
        # (DeepSeek, some Gemini) otherwise burn all max_tokens on
        # the reasoning trace and return empty content.
        messages = [
            {"role": "system", "content": _TEST_SYSTEM_PROMPT},
            {"role": "user", "content": _TEST_USER_PROMPT},
        ]

        collected = ""
        try:
            async for chunk in provider.get_response(
                messages,
                temperature=0.0,
                max_tokens=_TEST_MAX_TOKENS,
            ):
                collected += chunk
                if len(collected) > 400:
                    break
        except Exception as e:
            return {
                "success": False,
                "message": "Ошибка при обращении к провайдеру",
                "detail": str(e),
            }

        collected = collected.strip()

        # Provider yields a human-readable error string on failure —
        # it starts with the ⚠️ marker (see provider implementations).
        if collected.startswith("⚠️"):
            # Strip the leading ⚠️ and any whitespace.
            text = collected.lstrip("⚠️").strip()
            # Split "Ошибка Gemini (400): detail" into message + detail.
            message = "Ошибка провайдера"
            detail = text
            if ":" in text:
                head, _, tail = text.partition(":")
                message = head.strip()
                detail = tail.strip() or None
            else:
                message = text

            return {
                "success": False,
                "message": message,
                "detail": detail,
            }

        if not collected:
            # Empty content, but no error — the connection and the key
            # work. Reasoning models may return empty content when the
            # reasoning trace consumes all max_tokens. Treat as success.
            return {
                "success": True,
                "message": "OK",
                "detail": "(пустой ответ — модель не вернула текст, но соединение работает)",
            }

        # Success — keep the detail short for the UI.
        detail = collected[:200]
        if len(collected) > 200:
            detail += "…"

        return {
            "success": True,
            "message": "OK",
            "detail": detail,
        }

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
    def _parse_value(
        value: str,
        log=None,
    ) -> CoreEngineLibBaseSetupLlmSettings:
        """
        Parse settings.value JSON into CoreEngineLibBaseSetupLlmSettings,
        decrypting secret fields.
        """
        try:
            raw = json.loads(value) if value else {}
        except (TypeError, ValueError) as e:
            CoreEngineLibBaseSetupLlmService._log(
                log, "error", f"Failed to parse value JSON: {e}"
            )
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