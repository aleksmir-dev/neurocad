# neurocad/utils/llm/base.py

"""
Base class for LLM providers.

All providers implement the same async interface, so the editor does not
care which backend is used. The factory returns an instance, and the
caller only sees `get_response` / `generate_completion`.

Token accounting
----------------
Every provider keeps a `tokens_used` counter. It is reset to 0 at the
start of each `get_response()` call and incremented:
  - for input messages (prompt tokens),
  - for every chunk yielded (completion tokens).

Callers read `provider.tokens_used` AFTER the generator is fully
consumed — that is the total cost of the call (prompt + completion).

`count_tokens(text)` is the provider's own tokenizer. The base
implementation is an approximation (len * 0.6) used by providers that
have no exact tokenizer available. Subclasses override it.
"""

from abc import ABC, abstractmethod
from typing import AsyncGenerator


class LLMProvider(ABC):
    """
    Common interface for all LLM providers.

    Subclasses must:
      - set `name` (short identifier used in the factory and UI);
      - implement `is_configured` (whether credentials are present);
      - implement `get_response` (async generator of chunks).

    `generate_completion` is a convenience wrapper that collects all
    chunks into a single string — provided here, no need to override.

    Token accounting:
      - `self.tokens_used` is reset at the start of `get_response()`;
      - subclasses should call `self._add_tokens(text)` for input
        messages and for every yielded chunk;
      - after the generator is fully consumed, `self.tokens_used`
        holds the total (prompt + completion) for that call.
    """

    #: Human-readable name (for UI / logs)
    name: str = "base"

    def __init__(self):
        # Total tokens for the LAST get_response() call.
        # Reset at the start of each call.
        self.tokens_used: int = 0

    # ============================================
    # TOKEN COUNTING
    # ============================================

    def count_tokens(self, text: str) -> int:
        """
        Approximate token count for arbitrary text.

        The base implementation is a rough heuristic (len * 0.6),
        used only as a fallback. Providers with a real tokenizer
        override this method.

        Never raises.
        """
        if not text:
            return 0
        return int(len(text) * 0.6)

    def _reset_tokens(self) -> None:
        """Reset the per-call token counter. Called at the top of
        each get_response() implementation."""
        self.tokens_used = 0

    def _add_tokens(self, text: str) -> int:
        """Add the token count of `text` to the running total.
        Returns the number added."""
        n = self.count_tokens(text)
        self.tokens_used += n
        return n

    # ============================================
    # PROVIDER INTERFACE
    # ============================================

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """
        Whether the provider has all the credentials it needs to work.

        Used by the factory to list providers available to the user,
        and by the UI to disable providers that are not set up.
        """
        ...

    @abstractmethod
    async def get_response(
        self,
        messages_list: list,
        temperature: float | None = None,
        max_tokens: int | None = None,
        stream: bool = False,
    ) -> AsyncGenerator[str, None]:
        """
        Async generator of response chunks.

        stream=False → one chunk with the whole response.
        stream=True  → chunks as they arrive.

        On errors the generator yields a human-readable error string
        instead of raising — the caller decides what to do with it.

        Implementations MUST call `self._reset_tokens()` at the very
        start, then `self._add_tokens(...)` for every input message
        and every yielded chunk. After the generator is fully
        consumed, `self.tokens_used` holds the total cost.
        """
        ...

    async def generate_completion(
        self,
        messages_list: list,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """
        Non-streaming convenience wrapper: collect all chunks into one string.

        After this returns, `self.tokens_used` holds the total cost.
        """
        full = ""
        async for chunk in self.get_response(
            messages_list,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False,
        ):
            full += chunk
        return full