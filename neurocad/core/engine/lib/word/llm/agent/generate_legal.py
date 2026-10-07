# neurocad/core/engine/lib/word/llm/agent/generate_legal.py

"""
Agent: generate_legal.

Generate the markdown body of a Policy or Rules document from the
user's home page. Thin wrapper around the LLM: build the prompt,
call the provider, extract the markdown, sanitize it. Nothing is
saved to disk or to the DB here — the caller (the HTTP endpoint
POST /domain/legal/generate) returns the text to the frontend, and
the user decides whether to save it.

This agent is NOT registered in AGENTS (the router) and is NOT
called by the WebSocket dispatcher. It is invoked directly from the
HTTP endpoint, same pattern as generate_logo.

Inputs (kwargs):
  - which           "policy" | "rules"
  - owner_name      User.name of the site owner (or "")
  - home_title      Home page title (or "")
  - home_desc       Home page description (or "")
  - home_text       Visible text of the home page (or "")

Return shape:
    { "text": "<markdown …>", "which": "policy" }        — success
    { "text": None, "error": "<reason>" }                — failure
"""

import asyncio
import re
from typing import Any, Dict, Optional

from .base import CoreEngineLibWordLlmAgentBase
from ..prompts.generate_legal import (
    build_system_prompt,
    build_user_message,
)
from ..steps.common import build_messages, log


# ============================================
# RETRY
# ============================================

MAX_ATTEMPTS = 3
BASE_DELAY = 2.0

RETRY_MARKERS = (
    "403",
    "429",
    "500",
    "502",
    "503",
    "504",
    "timeout",
    "timed out",
    "Timeout",
)


# ============================================
# MARKDOWN EXTRACTION
# ============================================

#: Leading ``` fence with an optional language tag.
_FENCE_OPEN_RE = re.compile(r"^\s*```[a-zA-Z0-9_-]*\s*\n")

#: Trailing ``` fence.
_FENCE_CLOSE_RE = re.compile(r"\n\s*```\s*$")


def _extract_markdown(raw: str) -> str:
    """
    Pull the markdown body out of the model response.

    Accepts:
      - a clean markdown string;
      - a markdown string wrapped in ``` or ```markdown fences;
      - text with a short prose preface and a trailing "Готово."

    Strips only the fences. Does NOT strip prose — if the model
    wrote "Конечно, вот политика:", that would end up in the saved
    text. The prompt explicitly forbids it, and the frontend
    previews the result before saving.

    Returns "" if there is nothing usable.
    """
    if not raw:
        return ""

    s = raw.strip()
    s = _FENCE_OPEN_RE.sub("", s)
    s = _FENCE_CLOSE_RE.sub("", s)
    return s.strip()


# ============================================
# AGENT
# ============================================

class CoreEngineLibWordLlmAgentGenerateLegal(CoreEngineLibWordLlmAgentBase):
    """Generate a policy or rules document for a site."""

    name = "generate_legal"

    async def run(
        self,
        *,
        provider,
        user_message: str = "",
        page_id: int = 0,
        run_id: Any = None,
        emit=None,
        selection: Optional[Dict[str, Any]] = None,
        block_catalog: Optional[list] = None,
        current_html: Optional[str] = None,
        history: Optional[list] = None,
        which: str = "policy",
        owner_name: str = "",
        home_title: str = "",
        home_desc: str = "",
        home_text: str = "",
    ) -> Dict[str, Any]:
        """
        Generate one document.

        Returns:
            {"text": "<markdown>", "which": "policy"}  on success
            {"text": None, "which": ..., "error": "..."} on failure
        """
        if which not in ("policy", "rules"):
            return {"text": None, "which": which, "error": "invalid which"}

        system_prompt = build_system_prompt(which)
        user_content = build_user_message(
            which=which,
            owner_name=owner_name,
            home_title=home_title,
            home_description=home_desc,
            home_text=home_text,
        )

        messages = build_messages(system_prompt, user_content, history or [])

        # ---- dump prompt ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_step(
                run_id=run_id,
                agent_name=f"generate_legal_{which}",
                system_prompt=system_prompt,
                user_content=user_content,
                history=history,
            )
        except Exception as e:
            log(provider, "warning", f"generate_legal dump failed: {e}")

        last_error = ""
        text: Optional[str] = None
        attempt = 0

        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                raw = await provider.generate_completion(messages, max_tokens=4096)
            except Exception as e:
                last_error = f"LLM error: {e}"
                log(provider, "warning",
                    f"generate_legal attempt {attempt}/{MAX_ATTEMPTS} "
                    f"failed: {last_error}")
            else:
                text = _extract_markdown(raw)
                if text and len(text) > 100:
                    break
                last_error = "empty or too-short response"
                log(provider, "warning",
                    f"generate_legal attempt {attempt}/{MAX_ATTEMPTS}: "
                    f"{last_error}")
                text = None

            # Retry only on transient failures.
            if not any(marker in last_error for marker in RETRY_MARKERS):
                break

            if attempt < MAX_ATTEMPTS:
                delay = BASE_DELAY * (2 ** (attempt - 1))
                log(provider, "info",
                    f"generate_legal: retry in {delay}s")
                await asyncio.sleep(delay)

        # ---- dump response ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_response(
                run_id=run_id,
                agent_name=f"generate_legal_{which}",
                raw_response=text or last_error,
            )
        except Exception:
            pass

        if not text:
            log(provider, "error",
                f"generate_legal failed after {attempt} attempt(s): "
                f"{last_error}")
            return {
                "text": None,
                "which": which,
                "error": last_error or "no content",
            }

        log(provider, "info",
            f"generate_legal: ok, {len(text)} chars")
        return {"text": text, "which": which, "error": None}