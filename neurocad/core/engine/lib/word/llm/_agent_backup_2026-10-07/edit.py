# neurocad/core/engine/lib/word/llm/agent/edit.py

"""
Agent: edit.

Edits the CSS of ONE existing effect (fx-*) at the user's request.

This agent does NOT touch the page HTML, does NOT add classes to
elements, and does NOT pick from a fixed catalog. It writes CSS for
a single effect file, replacing its content entirely.

The user is in "effect edit mode": the frontend has already opened
the effect for editing and sends the current CSS with every request.
The agent returns a new full CSS for the same effect. The frontend
applies it live to the iframe (as a <style> override), and only when
the user confirms does the frontend PUT it back to the server.

Input:
  effect_id            — e.g. "fx-shadow-top-n"
  effect_css           — current CSS of that effect (the draft, not the file)
  user_message         — what the user wants changed
  effect_label         — current human label (optional)
  existing_effect_ids  — every id currently registered in the palette
                         (list of strings). The model uses this to avoid
                         proposing an id that is already taken when it
                         decides to rename the effect.

Output:
  {
      "message": "Готово.",
      "css":     ".core-engine-lib-word-blocks .fx-shadow-top-n { ... }",
      "new_id":    "fx-new-slug" | None,
      "new_label": "Новое название" | None,
  }

  `new_id` and `new_label` are OPTIONAL. They are only filled when the
  edit CHANGES THE MEANING of the effect (e.g. "звёзды" → "радуга").
  For cosmetic edits ("сделай тень сильнее") both are None and the
  client falls back to an in-place PUT.

  `new_id`, when present, must:
    - match EFFECT_ID_RE (same pattern as create_effect);
    - NOT be present in existing_effect_ids.

  If either condition fails, `new_id` and `new_label` are dropped and
  the agent falls back to an in-place edit.

RESPONSE FORMAT TOLERANCE:
  The model is ASKED to return JSON {css, new_id, new_label}, but we
  accept two more shapes as fallbacks:

    (a) raw CSS with the CURRENT id    → in-place edit;
    (b) raw CSS with a NEW id          → rename (new_id extracted
                                         from the CSS selector).

  This makes the agent robust to a model that ignores the JSON schema
  and just returns CSS with a renamed selector. We extract the new id
  from the selector and validate it against existing_effect_ids, the
  same as if the model had returned it in a JSON field.

The agent never returns HTML — the element_update path is not used
here. The caller (ws.py) sends the result as a separate `css_update`
event, not as `element_update`.

Safety:
  If the model returns something that does not look like CSS for a
  plausible effect selector, the agent returns css=None. The client
  then skips the update entirely, so the effect file is not damaged.
"""

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from .base import CoreEngineLibWordLlmAgentBase
from ..prompts.edit_effect import build_effect_edit_prompt


#: Same pattern create_effect validates against.
EFFECT_ID_RE = re.compile(r"^fx-[a-z0-9][a-z0-9-]{0,63}$")

#: Extract the FIRST `.fx-<slug>` selector from a CSS string.
#: The slug is a sequence of lowercase letters, digits and dashes.
_CSS_FX_SELECTOR_RE = re.compile(r"\.(fx-[a-z0-9][a-z0-9-]{0,63})(?![\w-])")


class CoreEngineLibWordLlmAgentEdit(CoreEngineLibWordLlmAgentBase):
    """Edit the CSS of one existing effect."""

    name = "edit"

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
                "step": "edit",
                "message": "Готовлю правку эффекта...",
            })

        # ---- guard: effect_id and effect_css are required ----
        if not effect_id or not effect_css:
            return {
                "message": "Режим правки эффекта не активен.",
                "css": None,
                "effect_id": None,
                "new_id": None,
                "new_label": None,
            }

        # ---- normalize the list of existing ids ----
        existing_ids = [
            str(x).strip()
            for x in (existing_effect_ids or [])
            if isinstance(x, (str, int)) and str(x).strip()
        ]
        existing_ids = [x for x in existing_ids if x != effect_id]

        # ---- build system prompt from the current CSS + id + list ----
        system_prompt = build_effect_edit_prompt(
            effect_id=effect_id,
            current_css=effect_css,
            effect_label=effect_label or "",
            existing_effect_ids=existing_ids,
        )

        # ---- user content: just the request ----
        user_content = user_message.strip()

        # ---- dump prompt ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_step(
                run_id=run_id,
                agent_name="edit",
                system_prompt=system_prompt,
                user_content=user_content,
                history=history,
            )
        except Exception as e:
            print(f"[edit] dump request failed: {e}", flush=True)

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
            print(f"[edit] LLM error: {e}", flush=True)
            return {
                "message": f"⚠️ Ошибка LLM: {e}",
                "css": None,
                "effect_id": None,
                "new_id": None,
                "new_label": None,
            }

        # ---- dump response ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_response(
                run_id=run_id,
                agent_name="edit",
                raw_response=raw,
            )
        except Exception as e:
            print(f"[edit] dump response failed: {e}", flush=True)

        # ---- parse: css + optional new_id / new_label ----
        # This handles three shapes:
        #   1) JSON {css, new_id, new_label}
        #   2) raw CSS with the CURRENT id
        #   3) raw CSS with a NEW id (extracted from the selector)
        css, parsed_new_id, parsed_new_label = self._parse_response(
            raw, effect_id
        )

        if not css:
            print(
                f"[edit] model returned a non-css answer: "
                f"{str(raw)[:160]!r}",
                flush=True,
            )
            return {
                "message": "⚠️ Модель вернула некорректный ответ. Попробуйте ещё раз.",
                "css": None,
                "effect_id": None,
                "new_id": None,
                "new_label": None,
            }

        # ---- validate optional new_id / new_label ----
        new_id, new_label = self._validate_new_id(
            parsed_new_id,
            parsed_new_label,
            effect_id,
            existing_ids,
        )

        return {
            "message": "Готово.",
            "css": css,
            "effect_id": effect_id,
            "new_id": new_id,
            "new_label": new_label,
        }

    # ============================================
    # PARSE
    # ============================================

    @classmethod
    def _parse_response(
        cls,
        text: str,
        current_id: str,
    ) -> Tuple[str, Optional[str], Optional[str]]:
        """
        Extract (css, new_id, new_label) from the model response.

        Handles three response shapes:

          A. JSON object with a "css" field (and optional new_id /
             new_label fields) — the shape we ask for.

          B. Raw CSS that uses the CURRENT id in its outer selector
             — no rename. new_id = None.

          C. Raw CSS that uses a NEW id in its outer selector — we
             extract the new id from the selector and return it as
             new_id, so the client can do the rename.

        Returns (css, new_id, new_label). css is "" if nothing usable
        was found.
        """
        if not text:
            return ("", None, None)

        s = text.strip()

        # ---- strip markdown fence ----
        if s.startswith("```"):
            nl = s.find("\n")
            if nl != -1:
                s = s[nl + 1:]
            if s.endswith("```"):
                s = s[:-3]
            s = s.strip()

        # ---- try JSON with a "css" field ----
        try:
            data = json.loads(s)
            if isinstance(data, dict):
                css = data.get("css")
                if css:
                    return (
                        str(css).strip(),
                        data.get("new_id"),
                        data.get("new_label"),
                    )
        except Exception:
            pass

        # ---- try the first {...} JSON block ----
        start = s.find("{")
        end = s.rfind("}")
        if start != -1 and end != -1 and end > start:
            head = s[start:start + 40]
            if '"' in head:
                try:
                    data = json.loads(s[start:end + 1])
                    if isinstance(data, dict):
                        css = data.get("css")
                        if css:
                            return (
                                str(css).strip(),
                                data.get("new_id"),
                                data.get("new_label"),
                            )
                except Exception:
                    pass

        # ---- fallback: raw CSS ----
        # Verify it looks like CSS: contains braces AND at least one
        # `.fx-<slug>` selector.
        if "{" not in s or "}" not in s:
            return ("", None, None)

        m = _CSS_FX_SELECTOR_RE.search(s)
        if not m:
            return ("", None, None)

        selector_slug = m.group(1)

        # Case B: raw CSS with the CURRENT id → in-place edit.
        if selector_slug == current_id:
            return (s, None, None)

        # Case C: raw CSS with a NEW id → rename. The new label
        # defaults to None (the client falls back to using the new
        # id as a label).
        return (s, selector_slug, None)

    # ============================================
    # VALIDATION
    # ============================================

    @staticmethod
    def _validate_new_id(
        raw_new_id: Any,
        raw_new_label: Any,
        current_id: str,
        existing_ids: List[str],
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Sanitize the optional new id / label proposed by the model.

        Returns (new_id, new_label), or (None, None) if:
          - new_id is missing or empty;
          - new_id equals current_id (no actual rename);
          - new_id does not match EFFECT_ID_RE;
          - new_id is in existing_ids (would collide with another
            effect already registered in the palette).

        In every rejection case the caller falls back to an in-place
        PUT — the user keeps their current effect name.
        """
        if not raw_new_id:
            return (None, None)

        new_id = str(raw_new_id).strip()
        if not new_id:
            return (None, None)

        if new_id == current_id:
            print(
                f"[edit] model proposed the same id as current "
                f"({new_id}) — ignoring rename",
                flush=True,
            )
            return (None, None)

        if not EFFECT_ID_RE.match(new_id):
            print(
                f"[edit] model proposed an invalid new_id "
                f"({new_id!r}) — ignoring rename",
                flush=True,
            )
            return (None, None)

        if new_id in existing_ids:
            print(
                f"[edit] model proposed an already-taken new_id "
                f"({new_id!r}) — ignoring rename. existing: {existing_ids}",
                flush=True,
            )
            return (None, None)

        new_label = (str(raw_new_label).strip() if raw_new_label else "")
        if not new_label:
            # No label from the model — fall back to the new id so
            # the palette still has something readable.
            new_label = new_id
        if len(new_label) > 80:
            new_label = new_label[:77] + "..."

        return (new_id, new_label)