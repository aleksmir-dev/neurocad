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

Retries
-------
The LLM call is retried on transient failures — CloudFront / CDN
throttling (HTTP 403), rate limits (429), upstream errors (5xx),
network timeouts, and (since this change) an empty / no-SVG
response. Backoff is exponential: BASE_DELAY, then BASE_DELAY * 2.

Why "no <svg>" is now retried:
  The model occasionally responds with plain prose ("К сожалению,
  я не могу...") or with reasoning text instead of the requested
  JSON. This is not a network error — but empirically a second
  attempt with the same prompt often produces the expected SVG.
  Earlier this case broke out of the retry loop immediately
  (RETRY_MARKERS did not include it), so a single unlucky response
  surfaced to the user as a hard 400. Now we retry it too.

Token cap:
  MAX_TOKENS caps the response length for the logo call. Logos are
  short — a full SVG is well under 2k tokens. Passing an explicit
  cap keeps the model from drifting into long prose or reasoning
  that pushes the SVG out of the response window.

Return shape:
    { "svg": "<svg …>…</svg>" }              — on success
    { "svg": None, "error": "<reason>" }     — on failure
"""

import asyncio
from typing import Any, Dict, Optional

from .base import CoreEngineLibWordLlmAgentBase
from ..prompts.logo import build_logo_prompt
from ..steps.common import (
    build_messages,
    extract_svg,
    log,
    validate_svg,
)


# ============================================
# RETRY
# ============================================

#: How many times to attempt the LLM call (1 = no retry).
MAX_ATTEMPTS = 3

#: Base delay for exponential backoff (seconds).
#: Attempt 1 fails → wait BASE_DELAY.
#: Attempt 2 fails → wait BASE_DELAY * 2.
BASE_DELAY = 2.0

#: Cap on max_tokens for the logo call. Logos are short — a full
#: SVG is well under 2k tokens. Passing a small explicit cap keeps
#: the model from drifting into long prose or reasoning that pushes
#: the SVG out of the response window.
MAX_TOKENS = 2048

#: Substrings in the error text that mark a transient failure
#: worth retrying. Matched against the whole error string.
#:   403 — CloudFront / CDN throttling (DeepSeek sometimes)
#:   429 — rate limit
#:   5xx — upstream server errors
#:   timeout / timed out — network, no response
#:   no <svg> — the model responded, but the answer had no SVG
#:              (prose, reasoning, or an empty JSON shell)
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
    "no <svg>",
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

        # ============================================
        # LLM call with retry on transient failures.
        #
        # Attempts: MAX_ATTEMPTS (default 3).
        # Backoff:  BASE_DELAY * 2^(n-1) — 2s, 4s.
        # Retry:    only when the error text contains one of
        #           RETRY_MARKERS. A clean "no <svg> in response"
        #           from a working model IS retried now — the
        #           model sometimes drifts into prose and a second
        #           attempt with the same prompt produces the SVG.
        # ============================================

        last_error: str = ""
        svg: Optional[str] = None
        attempt: int = 0

        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                raw = await provider.generate_completion(
                    messages,
                    max_tokens=MAX_TOKENS,
                )
            except Exception as e:
                last_error = f"LLM error: {e}"
                log(provider, "warning",
                    f"generate_logo attempt {attempt}/{MAX_ATTEMPTS} "
                    f"failed: {last_error}")
            else:
                svg = extract_svg(raw)
                if svg:
                    break
                last_error = "no <svg> found in response"
                # Log a short preview so a "no SVG" failure is
                # actually diagnosable from the backend log —
                # otherwise all we see is a bare "ERROR:" line.
                preview = (raw or "")[:200].replace("\n", " ")
                log(provider, "warning",
                    f"generate_logo attempt {attempt}/{MAX_ATTEMPTS}: "
                    f"no <svg> in response; raw[:200]={preview!r}")

            # Retry only on transient failures.
            if not any(marker in last_error for marker in RETRY_MARKERS):
                break

            if attempt < MAX_ATTEMPTS:
                delay = BASE_DELAY * (2 ** (attempt - 1))
                log(provider, "info",
                    f"generate_logo: retry in {delay}s")
                await asyncio.sleep(delay)

        if not svg:
            log(provider, "error",
                f"generate_logo failed after {attempt} attempt(s): "
                f"{last_error}")
            return {"svg": None, "error": last_error or "no <svg> in response"}

        ok, reason = validate_svg(svg)
        if not ok:
            log(provider, "warning", f"generate_logo rejected: {reason}")
            return {"svg": None, "error": f"validation failed: {reason}"}

        log(provider, "info", "generate_logo: ok")
        return {"svg": svg}