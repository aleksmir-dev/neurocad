# core/engine/lib/llm/agents/_01_generate_logo/service.py

"""
Service for the generate_logo agent.

LLM logic only:
  - building the system prompt;
  - calling the LLM provider;
  - retrying on transient failures;
  - extracting and validating the SVG from the response.

Balance, provider resolution, image saving, and token charging
live in route.py — this class does not know about them.

Class name follows the project convention CoreEngine<path><Entity>:
    core/engine/lib/llm/agents/_01_generate_logo/service.py
    → CoreEngineLibLlmAgentsGenerateLogoService

Imports (only what the service uses):
  - asyncio, json, re, typing  — standard library
  - .prompt                    — the system prompt class

No module-level functions, no module-level constants — everything
is on the class, so nothing can collide with another file.
"""

import asyncio
import json
import re
from typing import Any, Dict, List, Optional, Tuple

from .prompt import CoreEngineLibLlmAgentsGenerateLogoPrompt


class CoreEngineLibLlmAgentsGenerateLogoService:
    """Turn a prompt into an SVG logo via the LLM provider."""

    # ============================================
    # CLASS CONSTANTS
    # ============================================

    #: How many times to attempt the LLM call (1 = no retry).
    MAX_ATTEMPTS: int = 3

    #: Base delay for exponential backoff (seconds).
    BASE_DELAY: float = 2.0

    #: Cap on max_tokens for the logo call.
    MAX_TOKENS: int = 2048

    #: Substrings in the error text that mark a transient failure.
    RETRY_MARKERS: Tuple[str, ...] = (
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

    # ============================================
    # PUBLIC — generate
    # ============================================

    async def generate(
        self,
        *,
        provider,
        user_message: str,
        alt: str = "",
    ) -> Dict[str, Any]:
        """
        Generate one SVG logo.

        Parameters
        ----------
        provider
            LLM provider instance — anything with an async
            `generate_completion(messages, max_tokens=...)` method.
        user_message
            What the caller wants to draw — usually a short
            description ("Нейрокад — CMS нового поколения").
        alt
            Optional hint repeated to the model for context.

        Returns
        -------
        Dict[str, Any]
            {"svg": "<svg …>"} on success,
            {"svg": None, "error": "<reason>"} on failure.
        """
        system_prompt = CoreEngineLibLlmAgentsGenerateLogoPrompt().build()

        user_content = (user_message or "").strip()
        if alt and alt.strip():
            user_content = f"{user_content}\n\nAlt: {alt.strip()}"

        messages = self._build_messages(system_prompt, user_content, [])

        last_error: str = ""
        svg: Optional[str] = None
        attempt: int = 0

        for attempt in range(1, self.MAX_ATTEMPTS + 1):
            try:
                raw = await provider.generate_completion(
                    messages,
                    max_tokens=self.MAX_TOKENS,
                )
            except Exception as e:
                last_error = f"LLM error: {e}"
                self._log(
                    provider, "warning",
                    f"generate_logo attempt {attempt}/{self.MAX_ATTEMPTS} "
                    f"failed: {last_error}",
                )
            else:
                svg = self._extract_svg(raw)
                if svg:
                    break
                last_error = "no <svg> found in response"
                preview = (raw or "")[:200].replace("\n", " ")
                self._log(
                    provider, "warning",
                    f"generate_logo attempt {attempt}/{self.MAX_ATTEMPTS}: "
                    f"no <svg> in response; raw[:200]={preview!r}",
                )

            if not any(m in last_error for m in self.RETRY_MARKERS):
                break

            if attempt < self.MAX_ATTEMPTS:
                delay = self.BASE_DELAY * (2 ** (attempt - 1))
                self._log(provider, "info",
                          f"generate_logo: retry in {delay}s")
                await asyncio.sleep(delay)

        if not svg:
            self._log(
                provider, "error",
                f"generate_logo failed after {attempt} attempt(s): "
                f"{last_error}",
            )
            return {
                "svg": None,
                "error": last_error or "no <svg> in response",
            }

        ok, reason = self._validate_svg(svg)
        if not ok:
            self._log(provider, "warning",
                      f"generate_logo rejected: {reason}")
            return {"svg": None, "error": f"validation failed: {reason}"}

        self._log(provider, "info", "generate_logo: ok")
        return {"svg": svg}

    # ============================================
    # PRIVATE — helpers
    # ============================================

    def _log(self, provider, level: str, message: str) -> None:
        """Write through provider.log if available, else silently."""
        log_obj = getattr(provider, "log", None)
        if log_obj is None:
            return
        fn = getattr(log_obj, f"log_{level}_sync", None)
        if fn is None:
            return
        try:
            fn(target="llm-generate-logo", message=message)
        except Exception:
            pass

    def _build_messages(
        self,
        system_prompt: str,
        user_content: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> List[Dict[str, str]]:
        """
        Build the messages array for the LLM.

        Order:
          - system prompt
          - previous dialogue turns (if any)
          - current user message
        """
        messages: List[Dict[str, str]] = [
            {"role": "system", "content": system_prompt},
        ]

        if history:
            for m in history:
                role = m.get("role")
                content = m.get("content")
                if role in ("user", "assistant") and content:
                    messages.append(
                        {"role": role, "content": str(content)},
                    )

        messages.append({"role": "user", "content": user_content})
        return messages

    def _extract_json(self, text: str) -> Optional[dict]:
        """
        Pull a JSON object out of the model response.

        Tolerates markdown fences and surrounding prose. Returns
        the first valid JSON object found, or None.
        """
        if not text:
            return None

        s = text.strip()

        if s.startswith("```"):
            first_nl = s.find("\n")
            if first_nl != -1:
                s = s[first_nl + 1:]
            if s.endswith("```"):
                s = s[:-3]
            s = s.strip()

        try:
            data = json.loads(s)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass

        start = s.find("{")
        end = s.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                data = json.loads(s[start:end + 1])
                if isinstance(data, dict):
                    return data
            except json.JSONDecodeError:
                pass

        return None

    def _extract_svg(self, text: str) -> Optional[str]:
        """
        Pull the first `<svg>...</svg>` out of the model response.

        Tolerates markdown fences and surrounding prose. If the
        response is JSON with an "svg" field, that is preferred.
        """
        if not text:
            return None

        s = text.strip()

        if s.startswith("```"):
            nl = s.find("\n")
            if nl != -1:
                s = s[nl + 1:]
            if s.endswith("```"):
                s = s[:-3]
            s = s.strip()

        data = self._extract_json(s)
        if isinstance(data, dict):
            svg_field = data.get("svg")
            if isinstance(svg_field, str) and svg_field.strip():
                return svg_field.strip()

        start = s.lower().find("<svg")
        if start == -1:
            return None
        end = s.lower().rfind("</svg>")
        if end == -1 or end <= start:
            return None
        return s[start:end + len("</svg>")].strip()

    def _validate_svg(self, svg: str) -> Tuple[bool, str]:
        """
        Cheap sanity check on the extracted SVG.

        Rules:
          - non-empty;
          - starts with `<svg`;
          - contains `</svg>`;
          - does NOT contain `<script`;
          - does NOT contain `on\\w+=` (event handlers);
          - does NOT contain `javascript:`;
          - does NOT contain `href="http` (external references).
        """
        if not svg:
            return (False, "empty")

        low = svg.lower()

        if not low.startswith("<svg"):
            return (False, "does not start with <svg")

        if "</svg>" not in low:
            return (False, "no closing </svg>")

        if "<script" in low:
            return (False, "contains <script>")

        if "javascript:" in low:
            return (False, "contains javascript:")

        if re.search(r"\bon[a-z]+\s*=", low):
            return (False, "contains event handler")

        if re.search(
            r"""(?:href|xlink:href)\s*=\s*['"]\s*(?:https?:)?//""",
            low,
        ):
            return (False, "contains external href")

        return (True, "")