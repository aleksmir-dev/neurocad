# neurocad/core/engine/lib/word/llm/agent/none.py

"""
Agent: none.

The request is not related to the NeuroCad editor. No LLM call is made —
the agent returns a canned message immediately, so nothing is spent.

No intermediate events are emitted — the response is instant.
"""

from typing import Any, Dict, Optional

from .base import CoreEngineLibWordLlmAgentBase


class CoreEngineLibWordLlmAgentNone(CoreEngineLibWordLlmAgentBase):
    """Reject off-topic requests without touching the LLM."""

    name = "none"

    #: Canned reply for off-topic requests.
    MESSAGE = (
        "Я помогаю только с редактором NeuroCad. "
        "Спросите про блоки, пресеты, стили, чат или работу редактора."
    )

    async def run(
        self,
        *,
        provider,
        user_message: str,
        page_id: int,
        run_id: Any,
        emit=None,
        selection: Optional[Dict[str, Any]] = None,
        block_catalog: Optional[list] = None,
        current_html: Optional[str] = None,
        history: Optional[list] = None,
    ) -> Dict[str, Any]:
        # No emit — the answer is instant, nothing to stream.
        return {
            "message": self.MESSAGE,
            "html": None,
            "selector": None,
            "element_html": None,
        }