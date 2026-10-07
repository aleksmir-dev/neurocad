# neurocad/core/engine/lib/word/llm/agent/create_effect.py

"""
Agent: create_effect.

Builds a DRAFT of a new effect from a user's free-form request.

This agent does NOT write anything to disk. It returns a JSON draft:

    {
      "id":    "fx-shimmer-dots",
      "label": "Мерцающие точки",
      "hint":  "Мелкие точки с плавным мерцанием",
      "css":   ".core-engine-lib-word-blocks .fx-shimmer-dots { ... }",
      "media": "<svg viewBox='0 0 24 24'>...</svg>"
    }

The draft is applied to the selected element immediately by the
frontend (see chat/create.js → CreateSession.handleDraft). The user
judges the result by looking at the element, not by reading CSS.

The user may ask for tweaks ("сделай точки крупнее", "переименуй").
In that case the agent is called again with the previous draft
embedded in the prompt, and returns a new draft. The frontend
re-applies it live.

Saving is NOT done through the chat. When the user is satisfied they
click the SAVE icon on the pending block in the palette. Only then
does the frontend POST /editor/effects to persist the effect.

Agent output shape:

    {
      "message": "Готово. Я применил эффект к выделенному элементу. ...",
      "draft":   { "id": ..., "label": ..., "hint": ..., "css": ..., "media": ... },
    }

The `message` is intentionally short and technical-detail-free: the
user works as a "vibecoder" and should not see CSS, ids, labels, or
hints in the chat log. The `draft` is structured data — the frontend
uses it to apply the effect; the chat UI does not display it.

If the model fails to produce a valid draft, `draft` is None and
`message` explains what happened.

Id collisions
-------------
The client sends `existing_effect_ids` — the list of ids already
registered in the palette. The prompt embeds this list and asks the
LLM not to pick any of them. `_sanitize_draft` also rejects a draft
whose id is already taken, so we never hand a colliding id to the
frontend only for it to fail on POST with 409. If the id is taken,
the agent returns `draft=None` with a message asking the user to
rephrase — the model will generate a fresh draft next turn.

Safety:
  - The model's CSS and SVG are sanitized here so the user sees a
    VALID draft. If sanitization strips too much, the agent returns
    a clear message instead of a broken draft.
  - The draft's `id` is validated against `existing_effect_ids` so
    the user cannot save a draft that would collide with a real
    effect.

Namespace: CoreEngineLibWordLlmAgentCreateEffect
"""

import json
import re
from typing import Any, Dict, List, Optional

from .base import CoreEngineLibWordLlmAgentBase
from ..prompts.create_effect import build_create_effect_prompt


# ============================================
# CONSTANTS
# ============================================

#: Same pattern the service validates against on POST.
EFFECT_ID_RE = re.compile(r"^fx-[a-z0-9][a-z0-9-]{0,63}$")

#: Forbidden constructs in the draft CSS.
_FORBIDDEN_CSS = [
    re.compile(r"@import", re.IGNORECASE),
    re.compile(r"expression\s*\(", re.IGNORECASE),
    re.compile(r"javascript\s*:", re.IGNORECASE),
    re.compile(r"behavior\s*:", re.IGNORECASE),
    re.compile(r"-moz-binding", re.IGNORECASE),
    re.compile(r"url\s*\(\s*['\"]?\s*javascript:", re.IGNORECASE),
]

#: Forbidden constructs in the draft SVG.
_FORBIDDEN_SVG = [
    re.compile(r"<script", re.IGNORECASE),
    re.compile(r"javascript\s*:", re.IGNORECASE),
    re.compile(r"on\w+\s*=", re.IGNORECASE),         # onload=, onclick=, ...
    re.compile(r"<foreignObject", re.IGNORECASE),
    re.compile(r"<use\s+[^>]*href\s*=\s*['\"]https?:", re.IGNORECASE),
]


class CoreEngineLibWordLlmAgentCreateEffect(CoreEngineLibWordLlmAgentBase):
    """Build a draft of a new effect from a user request."""

    name = "create_effect"

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
        # Optional: the previous draft (if the user is iterating).
        previous_draft: Optional[Dict[str, Any]] = None,
        # List of effect ids already registered in the palette. Used to
        # ask the LLM not to pick a colliding id, and to reject a draft
        # that still collides.
        existing_effect_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:

        # ---- emit: step at the start ----
        if emit:
            await emit({
                "type": "step",
                "step": "create_effect",
                "message": "Придумываю эффект...",
            })

        # ---- normalize existing ids ----
        existing_ids = self._normalize_existing_ids(existing_effect_ids)
        print(
            f"[create_effect] existing ids: {len(existing_ids)}",
            flush=True,
        )

        system_prompt = build_create_effect_prompt(existing_ids)

        # ---- user content: request + (optional) previous draft ----
        user_content = self._build_user_content(user_message, previous_draft)

        # ---- dump prompt ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_step(
                run_id=run_id,
                agent_name="create_effect",
                system_prompt=system_prompt,
                user_content=user_content,
                history=history,
            )
        except Exception as e:
            print(f"[create_effect] dump request failed: {e}", flush=True)

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
            print(f"[create_effect] LLM error: {e}", flush=True)
            return {
                "message": f"⚠️ Ошибка LLM: {e}",
                "draft": None,
            }

        # ---- dump response ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_response(
                run_id=run_id,
                agent_name="create_effect",
                raw_response=raw,
            )
        except Exception as e:
            print(f"[create_effect] dump response failed: {e}", flush=True)

        # ---- parse JSON draft ----
        data = self._parse_draft(raw)
        if not data:
            print(
                f"[create_effect] failed to parse a draft from: "
                f"{str(raw)[:200]!r}",
                flush=True,
            )
            return {
                "message": "⚠️ Не удалось сгенерировать черновик эффекта. Попробуйте переформулировать запрос.",
                "draft": None,
            }

        # ---- sanitize draft (rejects id collisions) ----
        try:
            draft = self._sanitize_draft(data, existing_ids)
        except ValueError as e:
            print(f"[create_effect] draft rejected: {e}", flush=True)
            return {
                "message": f"⚠️ Модель вернула некорректный черновик: {e}. Попробуйте ещё раз.",
                "draft": None,
            }

        # ---- human-readable message (short, no CSS) ----
        message = self._render_draft_message(draft)

        return {
            "message": message,
            "draft": draft,
        }

    # ============================================
    # EXISTING IDS
    # ============================================

    @staticmethod
    def _normalize_existing_ids(
        raw: Optional[List[Any]],
    ) -> List[str]:
        """
        Normalize the incoming `existing_effect_ids` list.

        - strip whitespace;
        - drop empty entries;
        - drop non-string/int values;
        - deduplicate while preserving order.
        """
        if not raw:
            return []

        seen: set = set()
        result: List[str] = []
        for item in raw:
            if not isinstance(item, (str, int)):
                continue
            s = str(item).strip()
            if not s or s in seen:
                continue
            seen.add(s)
            result.append(s)
        return result

    # ============================================
    # USER CONTENT
    # ============================================

    @staticmethod
    def _build_user_content(
        user_message: str,
        previous_draft: Optional[Dict[str, Any]],
    ) -> str:
        """
        Compose the user-side message.

        If the user is iterating on a previous draft ("переименуй в …",
        "сделай круги чаще"), the previous draft is embedded so the
        model can revise it instead of starting from scratch.
        """
        parts = [user_message.strip()]

        if previous_draft:
            parts.append("")
            parts.append("--- BEGIN PREVIOUS DRAFT ---")
            parts.append(json.dumps(previous_draft, ensure_ascii=False, indent=2))
            parts.append("--- END PREVIOUS DRAFT ---")
            parts.append("")
            parts.append(
                "Это предыдущий черновик. Отредактируй его согласно новому "
                "запросу пользователя и верни обновлённый JSON."
            )

        return "\n".join(parts)

    # ============================================
    # PARSE
    # ============================================

    @staticmethod
    def _parse_draft(raw: str) -> Optional[dict]:
        """
        Parse the LLM response into a draft dict.

        Tolerates markdown fences and surrounding prose. Requires the
        following keys: id, label, css. hint and media are optional
        but will be filled with defaults if missing.
        """
        if not raw:
            return None

        s = raw.strip()

        # ---- strip markdown fence ----
        if s.startswith("```"):
            nl = s.find("\n")
            if nl != -1:
                s = s[nl + 1:]
            if s.endswith("```"):
                s = s[:-3]
            s = s.strip()

        # ---- try the whole string ----
        data = CoreEngineLibWordLlmAgentCreateEffect._try_json(s)

        # ---- try the first {...} block ----
        if not data:
            start = s.find("{")
            end = s.rfind("}")
            if start != -1 and end != -1 and end > start:
                data = CoreEngineLibWordLlmAgentCreateEffect._try_json(
                    s[start:end + 1]
                )

        if not data:
            return None

        # ---- required keys ----
        if not isinstance(data, dict):
            return None
        if not data.get("id") or not data.get("label") or not data.get("css"):
            return None

        return data

    @staticmethod
    def _try_json(text: str) -> Optional[dict]:
        try:
            data = json.loads(text)
        except Exception:
            return None
        return data if isinstance(data, dict) else None

    # ============================================
    # SANITIZE
    # ============================================

    @staticmethod
    def _sanitize_draft(
        data: dict,
        existing_ids: Optional[List[str]] = None,
    ) -> dict:
        """
        Validate and clean a draft.

        Raises ValueError with a human-readable reason if the draft
        cannot be used. Otherwise returns a normalized dict with the
        keys: id, label, hint, css, media.

        `existing_ids` — if the draft's id is in this list, the draft
        is rejected. The caller then asks the user to rephrase; the
        LLM will generate a fresh draft on the next turn.
        """
        effect_id = str(data.get("id", "")).strip()
        label = str(data.get("label", "")).strip()
        hint = str(data.get("hint", "")).strip()
        css = str(data.get("css", "")).strip()
        media = str(data.get("media", "")).strip()

        # ---- id ----
        if not EFFECT_ID_RE.match(effect_id):
            raise ValueError(
                f"некорректный id `{effect_id}` — ожидается fx-<english-slug>"
            )

        # ---- id collision ----
        if existing_ids and effect_id in existing_ids:
            raise ValueError(
                f"id `{effect_id}` уже занят другим эффектом — "
                f"придумайте другое имя"
            )

        # ---- label ----
        if not label:
            raise ValueError("пустое название")
        if len(label) > 80:
            raise ValueError("слишком длинное название (макс. 80)")

        # ---- hint ----
        if len(hint) > 200:
            hint = hint[:197] + "..."

        # ---- css ----
        if not css:
            raise ValueError("пустой CSS")

        for re_bad in _FORBIDDEN_CSS:
            if re_bad.search(css):
                raise ValueError(
                    f"CSS содержит запрещённую конструкцию: {re_bad.pattern}"
                )

        # The outer selector must reference the draft's own id.
        expected_selector = f".core-engine-lib-word-blocks .{effect_id}"
        if expected_selector not in css:
            raise ValueError(
                f"CSS не содержит ожидаемый селектор `{expected_selector}`"
            )

        # ---- media ----
        if media:
            for re_bad in _FORBIDDEN_SVG:
                if re_bad.search(media):
                    raise ValueError(
                        f"SVG содержит запрещённую конструкцию: {re_bad.pattern}"
                    )
            # Must look like an svg tag.
            if "<svg" not in media.lower():
                raise ValueError("media не похож на SVG")

        return {
            "id": effect_id,
            "label": label,
            "hint": hint,
            "css": css,
            "media": media,
        }

    # ============================================
    # MESSAGE
    # ============================================

    @staticmethod
    def _render_draft_message(draft: dict) -> str:
        """
        Build the human-readable message that accompanies the draft.

        IMPORTANT: this message is intentionally minimal. The user
        works as a "vibecoder" and judges the result by LOOKING AT
        THE ELEMENT, not by reading CSS or ids.

        So this method:
          - does NOT include the id, label, hint, or CSS;
          - does NOT ask "does the draft look good?" — the user
            cannot judge CSS text;
          - tells the user to LOOK AT THE ELEMENT and either keep
            the effect (by clicking the SAVE icon on the pending
            block in the palette) or describe a tweak.

        The structured `draft` dict is sent separately by the WS
        layer ({ type: "effect_draft", draft: {...} }) and used by
        chat/create.js to apply the effect. It is NOT rendered in
        the chat.
        """
        return (
            "Готово. Я применил эффект к выделенному элементу.\n\n"
            "Если понравилось — нажмите кнопку **«Сохранить»** на новом блоке в палитре "
            "(иконка-дискета). Если хотите поправить — просто опишите, что изменить "
            "(например: «сделай точки крупнее»)."
        )