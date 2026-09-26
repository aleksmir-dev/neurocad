# neurocad/core/engine/lib/word/llm/websocket/history.py

"""
HistoryMixin — history and page-context helpers for the WebSocket endpoint.

Two responsibilities:

  1. _load_history(page_id)
     Loads the last HISTORY_LIMIT messages from `page_chat` and
     returns them in the OpenAI/Anthropic-compatible shape:

         [{"role": "user"|"assistant", "content": "..."}, ...]

     Only user/assistant messages are kept — system prompts are
     constructed fresh by each agent. Non-string content is dropped.

     HISTORY_LIMIT is defined on the base class (20) — this mixin
     reads it via `self.HISTORY_LIMIT`.

  2. _load_current_page_html(page_id)
     Loads `Page.content` for the current page (or None if missing).
     Used by:
       - the router — to know whether the page already has content;
       - the fill/effect agents — to see the current markup.

     Read-only. Never raises.

These methods used to be @staticmethod on CoreEngineLibWordLlmWS. They
are now regular methods on a mixin, so they are called as
`self._load_history(...)` / `self._load_current_page_html(...)`.

Import depth note
-----------------
This file lives one level deeper than the old ws.py:

    llm/ws.py                 ← old location
    llm/websocket/history.py  ← new location (+1 level)

Relative import depth from llm/websocket/history.py:
    ..              → llm/
    ...             → word/
    ....            → lib/
    .....           → engine/
    ......          → core/
    .......         → neurocad/    ← utils/, models/ live here

So imports into neurocad/ need SEVEN dots, imports into
neurocad.core/ need SIX. Anything that was `from .....X` in ws.py
becomes `from ......X` here if X lives under neurocad.core, and
`from .......X` if X lives directly under neurocad.

For imports into llm/ itself (`..service`, `..runs`, `..dumper`,
`..agent.*`, `..mock`), two dots are enough — the parent of
websocket/ is llm/.

Namespace: CoreEngineLibWordLlmWS (via Base + mixins)
"""

from typing import Dict, List, Optional


class HistoryMixin:
    """History and page-context helpers for the WebSocket endpoint."""

    # ============================================
    # CHAT HISTORY
    # ============================================

    async def _load_history(self, page_id: int) -> List[Dict[str, str]]:
        """
        Load the last HISTORY_LIMIT messages from page_chat.

        Returns a list of {"role", "content"} dicts, oldest first.
        Empty list on any failure — the caller treats a missing
        history as "no prior context".
        """
        # Import here, not at module level: the service module pulls
        # in the whole app + DB stack. Keeping the import local to the
        # method means this mixin can be importable even when the DB
        # is not yet configured (useful for tooling / static checks).
        from ..service import CoreEngineLibWordLlmService

        try:
            rows = await CoreEngineLibWordLlmService.load_chat_history(page_id)
        except Exception as e:
            print(f"[ws-history] load failed for page {page_id}: {e}", flush=True)
            return []

        limit = self.HISTORY_LIMIT
        tail = rows[-limit:] if len(rows) > limit else rows

        return [
            {"role": m["role"], "content": m["content"]}
            for m in tail
            if m.get("role") in ("user", "assistant") and m.get("content")
        ]

    # ============================================
    # CURRENT PAGE HTML
    # ============================================

    async def _load_current_page_html(self, page_id: int) -> Optional[str]:
        """
        Load the current page HTML from the Page table.

        Returns the HTML string, or None if the page is missing,
        deleted, or the read fails. Never raises.
        """
        try:
            # Seven dots for neurocad.utils, six for neurocad.core.models.
            # See the module docstring for the full count. Do not
            # "clean up" the dots without checking the tree — this
            # file is one level deeper than ws.py used to be.
            from ......models.base import Page
            from .......utils.sqlite import get_db_sqlite
            from sqlalchemy import select

            async for session in get_db_sqlite():
                stmt = select(Page).where(
                    Page.id == page_id,
                    Page.is_delete == 0,
                )
                result = await session.execute(stmt)
                page = result.scalar_one_or_none()
                if not page:
                    return None
                return page.content or None

        except Exception as e:
            print(f"[ws] load current page failed: {e}", flush=True)
            return None

        return None