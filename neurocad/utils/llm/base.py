# neurocad/utils/llm/base.py

"""
Base class for LLM providers.

All providers implement the same async interface, so the editor does not
care which backend is used. The factory returns an instance, and the
caller only sees `get_response` / `generate_completion`.
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
    """

    #: Human-readable name (for UI / logs)
    name: str = "base"

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