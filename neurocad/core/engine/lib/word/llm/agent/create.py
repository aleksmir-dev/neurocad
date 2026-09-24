# neurocad/core/engine/lib/word/llm/agent/create.py

"""
Agent: create.

Build a brand-new page from the block catalog. Runs the existing
multi-step flow: plan → fill → effects. Returns the full page HTML,
which replaces the canvas.

This is the "default" behaviour of the editor: the user describes what
they want, the agent picks blocks, fills them, and adds effects.

Intermediate events (step, plan, fill_progress) are forwarded to the
client through the `emit` callback, so the user can see each stage.
"""

from typing import Any, Dict, Optional

from .base import CoreEngineLibWordLlmAgentBase


class CoreEngineLibWordLlmAgentCreate(CoreEngineLibWordLlmAgentBase):
    """Build a new page from the block catalog."""

    name = "create"

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

        from ..step import CoreEngineLibWordLlmStep

        catalog = block_catalog or []
        history = history or []

        # ---- STEP 1: PLAN ----
        plan: list = []
        async for event in CoreEngineLibWordLlmStep.step_plan(
            user_message, catalog, provider,
            history=history,
            run_id=run_id,
            agent_name="create",
        ):
            if emit:
                await emit(event)

            etype = event.get("type")
            if etype == "error":
                return {
                    "message": f"⚠️ {event['message']}",
                    "html": None,
                    "selector": None,
                    "element_html": None,
                }
            if etype == "result":
                plan = event["plan"]

        if not plan:
            return {
                "message": "Не удалось построить план блоков.",
                "html": None,
                "selector": None,
                "element_html": None,
            }

        # ---- STEP 2: FILL ----
        filled: dict = {}
        async for event in CoreEngineLibWordLlmStep.step_fill(
            user_message, plan, catalog, provider,
            history=history,
            run_id=run_id,
            agent_name="create",
        ):
            if emit:
                await emit(event)

            etype = event.get("type")
            if etype == "error":
                return {
                    "message": f"⚠️ {event['message']}",
                    "html": None,
                    "selector": None,
                    "element_html": None,
                }
            if etype == "result":
                filled = event["filled"]

        # ---- Assemble ----
        parts = []
        for item in plan:
            html = filled.get(item["block_id"])
            if html:
                parts.append(html)
        assembled_html = "\n".join(parts)

        if not assembled_html:
            return {
                "message": "Не удалось заполнить блоки.",
                "html": None,
                "selector": None,
                "element_html": None,
            }

        # ---- STEP 3: EFFECTS ----
        final_html = assembled_html
        async for event in CoreEngineLibWordLlmStep.step_effects(
            user_message, assembled_html, provider,
            history=history,
            run_id=run_id,
            agent_name="create",
        ):
            if emit:
                await emit(event)

            if event.get("type") == "result":
                final_html = event["html"]

        return {
            "message": f"Страница собрана из {len(plan)} блоков.",
            "html": final_html,
            "selector": None,
            "element_html": None,
        }