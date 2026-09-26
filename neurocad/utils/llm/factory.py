# neurocad/utils/llm/factory.py

"""
LLM provider factory.

Usage:
    from neurocad.utils.llm.factory import get_provider

    provider = await get_provider(log=request.app.state.log)           # active provider (from DB)
    provider = await get_provider("openai", log=request.app.state.log) # explicit

Providers are imported lazily on first use, so a missing optional
dependency (e.g. cryptography for GigaChat) does not break the whole
package at import time.

The provider config is loaded from the `settings` table
(key='llm') via CoreEngineLibBaseSetupLlmService — so changes made
in the admin UI take effect immediately, without a restart.

Both get_provider() and get_configured_providers() are async
(they hit the DB).

Logging: pass `log=app.state.log` from the endpoint (Request / WebSocket).
If `log` is None — provider works silently (CLI, tests, UI listing).
"""

import importlib
from typing import Optional

from .base import LLMProvider


# ============================================
# REGISTRY
# ============================================

#: Map of provider name → (module path, class name).
#: Names are used in .env (LLM_PROVIDER), in the DB row (llm.provider),
#: and in the UI. Keep them lowercase, no spaces.
_PROVIDERS: dict[str, tuple[str, str]] = {
    "deepseek": ("neurocad.utils.llm.deepseek", "DeepSeekProvider"),
    "openai":   ("neurocad.utils.llm.openai",   "OpenAIProvider"),
    "yandex":   ("neurocad.utils.llm.yandex",   "YandexProvider"),
    "gigachat": ("neurocad.utils.llm.gigachat", "GigaChatProvider"),
    "gemini":   ("neurocad.utils.llm.gemini",   "GeminiProvider"),
}

#: Fallback if the DB row is missing and settings.LLM_PROVIDER is not set.
DEFAULT_PROVIDER = "deepseek"


# ============================================
# PUBLIC API
# ============================================

def list_providers() -> list[str]:
    """Return all registered provider names (regardless of configuration)."""
    return list(_PROVIDERS.keys())


async def get_provider(
    name: Optional[str] = None,
    log=None,
) -> LLMProvider:
    """
    Instantiate a provider by name.

    name=None → active provider from the DB (fallback: settings.LLM_PROVIDER,
    then DEFAULT_PROVIDER).

    log — app.state.log from the endpoint (Request / WebSocket).
          If None — provider works silently (CLI, tests).

    The provider config is loaded from the DB via
    CoreEngineLibBaseSetupLlmService.get_provider_config(), with
    .env / hardcoded defaults as a fallback for missing fields.

    Raises ValueError if the name is unknown.
    Raises ImportError if the provider module cannot be loaded.
    """
    from neurocad.config import settings
    from neurocad.core.engine.lib.base.setup.service import (
        CoreEngineLibBaseSetupLlmService,
    )

    if not name:
        try:
            name = await CoreEngineLibBaseSetupLlmService.get_active_provider(log=log)
        except Exception as e:
            if log is not None:
                log.log_warning_sync(
                    target="llm",
                    message=(
                        f"Failed to read active provider from DB ({e}); "
                        f"falling back to settings.LLM_PROVIDER"
                    ),
                )
            name = getattr(settings, "LLM_PROVIDER", None) or DEFAULT_PROVIDER

    name = name.lower()

    if name not in _PROVIDERS:
        raise ValueError(
            f"Unknown LLM provider: {name!r}. "
            f"Available: {sorted(_PROVIDERS.keys())}"
        )

    module_path, class_name = _PROVIDERS[name]
    module = importlib.import_module(module_path)
    cls = getattr(module, class_name)

    config = await CoreEngineLibBaseSetupLlmService.get_provider_config(name, log=log)
    return cls(config=config, log=log)


async def get_configured_providers() -> list[str]:
    """
    Return names of providers that have credentials set.

    Used by the UI to show only providers the user can actually use.
    Silently skips providers whose module fails to import.
    """
    result: list[str] = []
    for name in _PROVIDERS:
        try:
            provider = await get_provider(name)
            if provider.is_configured:
                result.append(name)
        except Exception:
            # UI helper — silent on purpose. A provider that fails to
            # import just doesn't show up in the list.
            pass
    return result