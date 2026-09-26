# neurocad/core/engine/lib/word/llm/prompts/edit_effect.py

"""
Effect edit prompt — rewrite the CSS of ONE existing effect.

Used when the user is in "edit effect" mode (see
editor/effects/index.js → trigger 'word:effect-edit-start').
The model receives the current CSS of ONE effect and writes a new
full CSS for the same effect, based on the user's request.

The model may ALSO propose a rename (new_id + new_label) — but ONLY
if the edit changes the MEANING of the effect (e.g. "звёзды" →
"радуга"). For cosmetic edits ("сделай тень сильнее") it must NOT
propose a rename, and the client falls back to an in-place PUT.

The response is a JSON object:

    {
      "css":       ".core-engine-lib-word-blocks .<id> { ... }",
      "new_id":    "fx-new-slug"   (optional, or null),
      "new_label": "Новое название" (optional, or null)
    }

The prompt is deliberately SHORT and SCHEMA-FIRST: the format block
is at the top, the rules are numbered one-liners, the examples are
concrete JSON. Long prose makes the model drift and return raw CSS
instead of JSON.

No static imports beyond the standard library. This module is pure —
it only builds a string.
"""

from typing import List, Optional


def build_effect_edit_prompt(
    effect_id: str,
    current_css: str,
    effect_label: str = "",
    existing_effect_ids: Optional[List[str]] = None,
) -> str:
    """
    System prompt for the effect-edit flow.

    The model returns a JSON object with the new full CSS and,
    optionally, a new id / label if the edit changes the meaning of
    the effect.

    @param effect_id            — current id, e.g. "fx-rotating-globe"
    @param current_css          — current CSS of the effect
    @param effect_label         — current human label (optional, for context)
    @param existing_effect_ids  — ids of all OTHER effects, so the model
                                  does not pick a taken one when it
                                  proposes a rename
    @returns the full system prompt as a string
    """
    existing = [str(x).strip() for x in (existing_effect_ids or []) if str(x).strip()]
    existing = [x for x in existing if x != effect_id]
    if existing:
        existing_block = "\n".join(f"  - {x}" for x in existing)
    else:
        existing_block = "  (нет других эффектов)"

    label_line = f'Текущее название: "{effect_label}".' if effect_label else ""

    return f"""Ты — редактор CSS-эффектов для CMS NeuroCad.

Пользователь редактирует ОДИН эффект. Ты возвращаешь JSON с новым CSS.

СХЕМА ОТВЕТА — ТОЛЬКО ЭТОТ JSON, БЕЗ MARKDOWN, БЕЗ ПОЯСНЕНИЙ:

{{
  "css": ".core-engine-lib-word-blocks .{effect_id} {{ ... }}",
  "new_id": null,
  "new_label": null
}}

ПОЛЯ:
  "css"       — ОБЯЗАТЕЛЬНО. Полный CSS эффекта.
  "new_id"    — null, ИЛИ строка вида "fx-..." при смене смысла.
  "new_label" — null, ИЛИ короткое название по-русски (вместе с new_id).

КОНТЕКСТ:
  id:      {effect_id}
  {label_line}
  Занятые id (нельзя брать для new_id):
{existing_block}

ПРАВИЛА:
1. Внешний селектор CSS: `.core-engine-lib-word-blocks .{effect_id}`.
2. Не добавляй `background-color` и `color`.
3. Не добавляй `@import`, `url(...)`, `expression(...)`, `javascript:`.
4. Можно: background-image, box-shadow, filter, mask, @keyframes,
   ::before/::after (с тем же префиксом).
5. new_id заполняй ТОЛЬКО при смене СМЫСЛА эффекта.
6. Примеры смены смысла:
     "звёзды" → "радуга"   → new_id: "fx-rainbow-arc"
     "точки" → "полосы"    → new_id: "fx-diagonal-stripes"
     "уголок" → "рамка"    → new_id: "fx-inner-frame"
7. Примеры КОСМЕТИКИ (new_id: null):
     "тень сильнее", "круги чаще", "уголок больше".
8. new_id: только строчные латинские, цифры, дефисы, префикс `fx-`.
9. new_id не должен быть в списке занятых и не равен текущему id.

ПРИМЕРЫ ОТВЕТОВ:

Косметика:
{{"css": ".core-engine-lib-word-blocks .{effect_id} {{ box-shadow: inset 0 8px 20px rgba(15,23,42,0.35); }}", "new_id": null, "new_label": null}}

Смена смысла:
{{"css": ".core-engine-lib-word-blocks .fx-light-hatch-strokes {{ background-image: repeating-linear-gradient(112deg, rgba(100,116,139,0.22) 0 2px, transparent 2px 10px); }}", "new_id": "fx-light-hatch-strokes", "new_label": "Тонкие штрихи"}}

ТЕКУЩИЙ CSS:

{current_css}

ОТВЕТ — ТОЛЬКО JSON. Всегда включай поле "css".
"""