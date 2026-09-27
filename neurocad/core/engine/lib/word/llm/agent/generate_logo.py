# neurocad/core/engine/lib/word/llm/agent/generate_logo.py

"""
Agent: generate_logo.

Generate ONE SVG logo from a page title + description. Thin wrapper
around the LLM: build the prompt, call the provider, extract and
validate the SVG. Nothing is saved to disk here — the caller (the
HTTP endpoint POST /editor/images/generate) does that through
CoreEngineLibWordImagesService.

This agent is NOT registered in _AGENTS and is NOT called by the
WebSocket dispatcher. It is invoked directly from the HTTP endpoint,
because the logo flow is not part of the create / fill / effects /
svg pipeline.

Return shape:
    { "svg": "<svg …>…</svg>" }              — on success
    { "svg": None, "error": "<reason>" }     — on failure
"""

from typing import Any, Dict, Optional

from .base import CoreEngineLibWordLlmAgentBase
from ..prompts.logo import build_logo_prompt
from ..steps.common import (
    build_messages,
    extract_svg,
    log,
    validate_svg,
)


class CoreEngineLibWordLlmAgentGenerateLogo(CoreEngineLibWordLlmAgentBase):
    """Generate one SVG logo from a title + description."""

    name = "generate_logo"

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
        alt: str = "",
    ) -> Dict[str, Any]:
        """
        Generate one SVG logo.

        `user_message` — the prompt sent by the caller (usually
        "Заголовок: ... Описание: ..."). `alt` — an optional hint
        repeated to the model for context.

        Returns {"svg": str} on success, or {"svg": None, "error": str}.
        """
        system_prompt = build_logo_prompt()

        user_content = user_message.strip()
        if alt and alt.strip():
            user_content = f"{user_content}\n\nAlt: {alt.strip()}"

        messages = build_messages(system_prompt, user_content, history or [])

        try:
            raw = await provider.generate_completion(messages)
        except Exception as e:
            log(provider, "error", f"generate_logo LLM error: {e}")
            return {"svg": None, "error": f"LLM error: {e}"}

        svg = extract_svg(raw)
        if not svg:
            log(provider, "warning", "generate_logo: no <svg> in response")
            return {"svg": None, "error": "no <svg> found in response"}

        ok, reason = validate_svg(svg)
        if not ok:
            log(provider, "warning", f"generate_logo rejected: {reason}")
            return {"svg": None, "error": f"validation failed: {reason}"}

        log(provider, "info", "generate_logo: ok")
        return {"svg": svg}