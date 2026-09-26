# neurocad/core/engine/lib/word/llm/websocket/provider.py

"""
ProviderMixin — resolve the LLM provider for one run.

The provider is the object every agent talks to via
`provider.generate_completion(messages)`. Which provider is used
is decided at run time:

  - LLM_MOCK=1 (env / settings) → a mock provider, no network calls.
    Used in tests and local development when no real API key is
    configured.

  - Otherwise → the factory `get_provider(log=...)` reads the active
    provider name and its config from the DB (`settings` table, key
    'llm') and returns an instance wired to that vendor.

`log` — app.state.log, so the provider can write its own diagnostics
(OAuth refresh failures, TLS/CA issues) into the shared log file. It
is passed through, not stored.

The factory call is async because it hits the DB. Therefore
`_get_provider` is async too.

These methods used to be @staticmethod on CoreEngineLibWordLlmWS.
Now they are regular methods on a mixin — called as
`self._get_provider(log=...)`.

Import depth note
-----------------
This file lives one level deeper than the old ws.py:

    llm/ws.py                ← old location
    llm/websocket/provider.py ← new location (+1 level)

Relative import depth from llm/websocket/provider.py:
    ..              → llm/
    ...             → word/
    ....            → lib/
    .....           → engine/
    ......          → core/
    .......         → neurocad/    ← utils.llm.factory lives here

So the factory import needs SEVEN dots, not six. Anything that was
`from ......X` in ws.py becomes `from .......X` here if X lives
under the neurocad package root (utils/, config, etc.).

For imports into llm/ itself (`..mock`, `..runs`, `..service`,
`..dumper`, `..agent.*`), two dots are enough — the parent of
websocket/ is llm/.

Namespace: CoreEngineLibWordLlmWS (via Base + mixins)
"""

from typing import Any, Optional


class ProviderMixin:
    """Resolve the LLM provider (mock or real) for one run."""

    async def _get_provider(self, log: Optional[Any] = None):
        """
        Resolve the LLM provider.

        Returns an object exposing at least:
          - name           : str, provider identifier (e.g. "openai")
          - model          : str, active model id
          - generate_completion(messages) -> str  (async)

        `log` is passed to the factory so the provider can write
        diagnostics into the shared app log. It is not stored on the
        provider instance.

        Never returns None: the factory raises on misconfiguration,
        and the caller (dispatcher) catches and reports it as a run
        error. That is intentional — a run without a provider cannot
        produce a result.
        """
        # Imported lazily, so this mixin stays importable even when
        # the settings module or the LLM factory are not yet
        # configured (useful for static checks).
        from neurocad.config import settings

        if settings.LLM_MOCK:
            # Mock provider — no network, deterministic answers.
            # Delay comes from settings so tests can speed it up.
            from ..mock import CoreEngineLibWordLlmMock
            return CoreEngineLibWordLlmMock(delay=settings.LLM_MOCK_DELAY)

        # Real provider — resolved from the DB via the factory.
        # Seven dots, because this file is one level deeper than the
        # old ws.py. See the module docstring for the full count.
        from .......utils.llm.factory import get_provider
        return await get_provider(log=log)