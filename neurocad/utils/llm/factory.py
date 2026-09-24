# neurocad/utils/llm/factory.py

"""
LLM provider factory.

Usage:
    from neurocad.utils.llm.factory import get_provider

    provider = get_provider()                # default (from settings.LLM_PROVIDER)
    provider = get_provider("openai")        # explicit
    async for chunk in provider.get_response(messages):
        ...

Providers are imported lazily on first use, so a missing optional
dependency (e.g. cryptography for GigaChat) does not break the whole
package at import time.
"""

import importlib
import logging
from typing import Optional

from .base import LLMProvider

logger = logging.getLogger(__name__)


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

#: Fallback if settings.LLM_PROVIDER is not set or invalid.
DEFAULT_PROVIDER = "deepseek"


# ============================================
# PUBLIC API
# ============================================

def list_providers() -> list[str]:
    """Return all registered provider names (regardless of configuration)."""
    return list(_PROVIDERS.keys())


def get_provider(name: Optional[str] = None) -> LLMProvider:
    """
    Instantiate a provider by name.

    name=None → use settings.LLM_PROVIDER (or DEFAULT_PROVIDER).
    Raises ValueError if the name is unknown.
    Raises ImportError if the provider module cannot be loaded
    (e.g. an optional dependency is missing).
    """
    from neurocad.config import settings

    name = (name or getattr(settings, "LLM_PROVIDER", None) or DEFAULT_PROVIDER).lower()

    if name not in _PROVIDERS:
        raise ValueError(
            f"Unknown LLM provider: {name!r}. "
            f"Available: {sorted(_PROVIDERS.keys())}"
        )

    module_path, class_name = _PROVIDERS[name]
    module = importlib.import_module(module_path)
    cls = getattr(module, class_name)
    return cls()


def get_configured_providers() -> list[str]:
    """
    Return names of providers that have credentials set.

    Used by the UI to show only providers the user can actually use.
    Silently skips providers whose module fails to import.
    """
    result: list[str] = []
    for name in _PROVIDERS:
        try:
            provider = get_provider(name)
            if provider.is_configured:
                result.append(name)
        except Exception as e:
            logger.warning(f"Provider {name!r} is not available: {e}")
    return result