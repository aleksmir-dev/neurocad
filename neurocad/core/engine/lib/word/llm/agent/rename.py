# neurocad/core/engine/lib/word/llm/agent/rename.py

"""
Agent: rename.

Proposes a NEW label and SVG miniature for an existing effect, based
on its current CSS. Does NOT change the id or the CSS — both are
returned exactly as received.

This is a specialised variant of the `edit` agent, triggered from
the UI when the user clicks the "pencil" (rename) button on an
active effect block. Unlike `edit`, this agent does not ask the LLM
to rewrite anything — it only asks for a human-readable label and a
new icon.

Why the id does NOT change:
  Renaming by changing the id would require rewriting the CSS
  selector, re-registering the block under the new id, deleting the
  old effect and replacing the class on every element that uses it.
  Any failure along that chain leaves the canvas broken. Keeping the
  id intact means the effect keeps its class `.fx-<id>`, its .css
  file, and every element that uses it keeps working — only the name
  in the palette and the icon change.

Input:
  effect_id            — e.g. "fx-rotating-globe"
  effect_css           — current CSS (returned unchanged)
  user_message         — system-generated, but kept for logging
  effect_label         — current human label (optional)

Output:
  {
      "message":   "Готово.",
      "css":       "<the same CSS we received>",
      "effect_id": "<the same id we received>",
      "new_label": "Короткое название",
      "new_media": "<svg viewBox='0 0 24 24'>...</svg>",
  }

Safety:
  - `new_label` must be non-empty. If it is empty, the agent returns
    `css=None` so the client skips the update entirely.
  - `new_media` is OPTIONAL: if the model did not produce a valid SVG
    (or forgot it entirely), the agent returns an empty string, and
    the client falls back to reusing the OLD miniature.

The agent never touches the page HTML.
"""

import json
import re
from typing import Any, Dict, List, Optional

from .base import CoreEngineLibWordLlmAgentBase
from ..prompts.rename_effect import build_effect_rename_prompt


#: A very cheap sanity check for the SVG media. The prompt asks for
#: a 24x24 <svg> one-liner; we only need to be sure it's an SVG at
#: all — the client will fall back to the old miniature if not.
_SVG_HINT_RE = re.compile(r"<\s*svg\b", re.IGNORECASE)


class CoreEngineLibWordLlmAgentRename(CoreEngineLibWordLlmAgentBase):
    """Propose a new label/media for an existing effect."""

    name = "rename"

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
        effect_id: Optional[str] = None,
        effect_css: Optional[str] = None,
        effect_label: Optional[str] = None,
        existing_effect_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:

        # ---- emit: step at the start ----
        if emit:
            await emit({
                "type": "step",
                "step": "rename",
                "message": "Придумываю новое название...",
            })

        # ---- guard ----
        if not effect_id or not effect_css:
            return {
                "message": "Режим переименования не активен.",
                "css": None,
                "effect_id": None,
                "new_label": None,
                "new_media": None,
            }

        # ---- system prompt ----
        # `existing_effect_ids` is kept in the signature for API
        # symmetry with the other agents, but is not used here — the
        # id of the effect does not change, so there is nothing to
        # collide with.
        system_prompt = build_effect_rename_prompt(
            effect_id=effect_id,
            current_css=effect_css,
            effect_label=effect_label or "",
        )

        user_content = (user_message or "").strip() or (
            "Придумай новое название и иконку для этого эффекта, "
            "id и CSS не меняй."
        )

        # ---- dump prompt ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_step(
                run_id=run_id,
                agent_name="rename",
                system_prompt=system_prompt,
                user_content=user_content,
                history=history,
            )
        except Exception as e:
            print(f"[rename] dump request failed: {e}", flush=True)

        # ---- build messages ----
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            for m in history:
                role = m.get("role")
                content = m.get("content")
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": str(content)})
        messages.append({"role": "user", "content": user_content})

        # ---- provider call ----
        try:
            raw = await provider.generate_completion(messages)
        except Exception as e:
            print(f"[rename] LLM error: {e}", flush=True)
            return {
                "message": f"⚠️ Ошибка LLM: {e}",
                "css": None,
                "effect_id": None,
                "new_label": None,
                "new_media": None,
            }

        # ---- dump response ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_response(
                run_id=run_id,
                agent_name="rename",
                raw_response=raw,
            )
        except Exception as e:
            print(f"[rename] dump response failed: {e}", flush=True)

        # ---- parse ----
        parsed = self._parse_response(raw)

        new_label = parsed.get("new_label")
        new_media = parsed.get("new_media")

        # ---- validate the label ----
        clean_label = self._validate_label(new_label)
        if not clean_label:
            print(
                f"[rename] model did not return a usable new_label: "
                f"{str(raw)[:160]!r}",
                flush=True,
            )
            return {
                "message": "⚠️ Не удалось подобрать новое название. Попробуйте ещё раз.",
                "css": None,
                "effect_id": None,
                "new_label": None,
                "new_media": None,
            }

        # ---- media validation ----
        # The media is OPTIONAL: if the model did not produce a valid
        # SVG (or forgot it entirely), we return an empty string and
        # the client falls back to reusing the OLD miniature.
        clean_media = self._validate_media(new_media)

        return {
            "message": "Готово.",
            "css": effect_css,          # UNCHANGED
            "effect_id": effect_id,     # UNCHANGED
            "new_label": clean_label,
            "new_media": clean_media,   # may be "" if invalid/missing
        }

    # ============================================
    # PARSE
    # ============================================

    @staticmethod
    def _parse_response(text: str) -> Dict[str, Any]:
        """
        Extract `new_label` and `new_media` from the model response.

        Accepts JSON: { "new_label": "...",
                        "new_media": "<svg ...>...</svg>" }.
        Also tolerates an accidental "css" or "new_id" field — they
        are ignored, we never use the model's CSS or id in this agent.
        """
        result: Dict[str, Any] = {
            "new_label": None,
            "new_media": None,
        }

        if not text:
            return result

        s = text.strip()

        # strip markdown fence
        if s.startswith("```"):
            nl = s.find("\n")
            if nl != -1:
                s = s[nl + 1:]
            if s.endswith("```"):
                s = s[:-3]
            s = s.strip()

        # try the whole string
        data = CoreEngineLibWordLlmAgentRename._try_json(s)

        # try the first {...} JSON block
        if data is None:
            start = s.find("{")
            end = s.rfind("}")
            if start != -1 and end != -1 and end > start:
                data = CoreEngineLibWordLlmAgentRename._try_json(
                    s[start:end + 1]
                )

        if isinstance(data, dict):
            result["new_label"] = data.get("new_label")
            result["new_media"] = data.get("new_media")

        return result

    @staticmethod
    def _try_json(text: str) -> Optional[dict]:
        try:
            data = json.loads(text)
        except Exception:
            return None
        return data if isinstance(data, dict) else None

    # ============================================
    # VALIDATION
    # ============================================

    @staticmethod
    def _validate_label(raw_label: Any) -> str:
        """
        Sanitize the required `new_label` field.

        Rules:
          - must be non-empty after stripping;
          - must not exceed 80 characters (cut off at 77 with "...");
          - surrounding quotes (single, double, « », “ ”) are
            stripped — models sometimes wrap the label in them.

        Returns the clean label, or "" if the payload is unusable.
        """
        if not raw_label:
            return ""

        s = str(raw_label).strip()
        if not s:
            return ""

        # Strip a matching pair of quotes at both ends.
        pairs = [('"', '"'), ("'", "'"), ("«", "»"), ("“", "”")]
        for open_q, close_q in pairs:
            if s.startswith(open_q) and s.endswith(close_q) and len(s) >= 2:
                s = s[1:-1].strip()
                break

        if not s:
            return ""

        if len(s) > 80:
            s = s[:77] + "..."

        return s

    @staticmethod
    def _validate_media(raw_media: Any) -> str:
        """
        Sanitize the optional `new_media` field.

        The client can survive without a fresh miniature: if we return
        an empty string, it will reuse the OLD SVG from the previous
        block. So this function is intentionally lax — it only checks
        that the payload looks like an SVG at all.

        Returns the SVG as a string, or "" if the payload is not
        usable.
        """
        if not raw_media:
            return ""

        s = str(raw_media).strip()
        if not s:
            return ""

        if not _SVG_HINT_RE.search(s):
            print(
                f"[rename] new_media does not look like SVG "
                f"(first 60 chars: {s[:60]!r}) — dropping",
                flush=True,
            )
            return ""

        # Collapse internal newlines — the prompt asks for a one-liner
        # but models occasionally emit multi-line SVG. A single line
        # is easier to embed into the block model and to log.
        s = " ".join(s.split())

        return s