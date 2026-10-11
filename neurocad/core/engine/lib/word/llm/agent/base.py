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
        "question":     str | None,   # NEW: ask the user instead of
                                      # doing the work; dispatcher
                                      # saves it with is_quest=1 and
                                      # ends the run in
                                      # "awaiting_answer". When set,
                                      # "html" is ignored.
    }

The agent may also emit intermediate events to the client via the
`emit` callback. Typical events:

    {"type": "step", "step": "planning", "message": "..."}
    {"type": "plan", "blocks": [...]}
    {"type": "fill_progress", "request": 1, "total": 3, "block_ids": [...]}

`emit` is optional. If it is None, the agent runs silently (used by
non-streaming callers).

Asking a clarifying question
----------------------------
An agent that needs more information from the user BEFORE it can
do its work returns `{"question": "<text>"}` instead of HTML. The
dispatcher handles it exactly like a router question:

  1. saves the question with is_quest=1;
  2. sets the run status to "awaiting_answer";
  3. sends the question as an assistant_message;
  4. sends "done" — no HTML, no CSS.

On the NEXT `start` message, the agent runs again. It receives the
same `history` (now containing the question + the user's reply) and
can continue where it left off. To avoid re-reading the whole chat
on every turn, an agent may keep a structured "brief" in `Run.brief`
(see the Run model docstring) — this module passes it through as
the `brief` argument.

The `brief` argument is optional context; the base class does not
interpret it. Agents that do not ask questions ignore it.

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
        brief: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Run the agent.

        Input context:
          provider       — LLM provider instance (created by ws.py)
          user_message   — what the user typed
          page_id        — page being edited
          run_id         — run record id (for dumping)
          emit           — async callback to send intermediate events
                           to the client (optional; None = silent)
          selection      — element marker {"selector", "tag",
                           "classes", "outer_html"} or legacy
                           {"block_id"}
          block_catalog  — list of blocks from the frontend
          current_html   — current page HTML (if any)
          history        — previous chat messages
          brief          — structured dialog state (optional; only
                           used by agents that ask questions, see
                           the module docstring). None for agents
                           that do not use it.

        Output:
          {
              "message":      str,
              "html":         str | None,
              "selector":     str | None,
              "element_html": str | None,
              "question":     str | None,   # optional; see docstring
          }

        When "question" is set, "html" is ignored by the dispatcher.
        """
        raise NotImplementedError