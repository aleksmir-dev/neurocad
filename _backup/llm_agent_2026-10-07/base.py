# neurocad/core/engine/lib/word/llm/agent/base.py

"""
Base interface for LLM editor agents.

Every agent receives the same input context and returns the same
result shape:

    {
        "message":      str,          # text for the chat
        "html":         str | None,   # full page HTML (replaces canvas)
        "selector":     str | None,   # element marker to replace
        "element_html": str | None,   # new HTML for that element
    }

The agent may also emit intermediate events to the client via the
`emit` callback. Typical events:

    {"type": "step", "step": "planning", "message": "..."}
    {"type": "plan", "blocks": [...]}
    {"type": "fill_progress", "request": 1, "total": 3, "block_ids": [...]}

`emit` is optional. If it is None, the agent runs silently (used by
non-streaming callers).

No __init__.py in this package — modules are imported directly.
"""

from abc import ABC, abstractmethod
from typing import Any, Awaitable, Callable, Dict, Optional


#: Type of the emit callback: async function that sends one JSON event.
EmitFn = Callable[[Dict[str, Any]], Awaitable[None]]


class CoreEngineLibWordLlmAgentBase(ABC):
    """Base class for all LLM editor agents."""

    #: Human-readable agent name (also used by the dumper).
    name: str = "base"

    @abstractmethod
    async def run(
        self,
        *,
        provider,
        user_message: str,
        page_id: int,
        run_id: Any,
        emit: Optional[EmitFn] = None,
        selection: Optional[Dict[str, Any]] = None,
        block_catalog: Optional[list] = None,
        current_html: Optional[str] = None,
        history: Optional[list] = None,
    ) -> Dict[str, Any]:
        """
        Run the agent.

        Input context:
          provider       — LLM provider instance (created by ws.py)
          user_message   — what the user typed
          page_id        — page being edited
          run_id         — run record id (for dumping)
          emit           — async callback to send intermediate events to
                           the client (optional; None means silent)
          selection      — element marker {"selector", "tag", "classes",
                           "outer_html"} or legacy {"block_id"}
          block_catalog  — list of blocks from the frontend
          current_html   — current page HTML (if any)
          history        — previous chat messages

        Output:
          {
              "message":      str,
              "html":         str | None,
              "selector":     str | None,
              "element_html": str | None,
          }
        """
        raise NotImplementedError