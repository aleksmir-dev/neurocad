# neurocad/core/engine/lib/word/llm/prompts/rename_effect.py

"""
Effect rename prompt — propose a NEW label and SVG miniature for an
existing effect. The id and CSS are NOT changed.

Used when the user clicks the "pencil" (rename) button on an active
effect block (see llm/agent/rename.py). The model is asked to look
at the current CSS and propose:

    - a new label        (short Russian name)
    - a new SVG miniature (24x24 icon that reflects the effect)

The `id` and the CSS are intentionally left alone: the effect keeps
its class `.fx-<id>` and its .css file. Only the human-readable name
in the palette and the icon are updated. This is the safest possible
"rename" — nothing on the canvas can break because the selector does
not change.

Response shape:

    {
      "new_label": "Короткое название",
      "new_media": "<svg viewBox='0 0 24 24'>...</svg>"
    }

The prompt is deliberately SCHEMA-FIRST and explicitly tells the
model NOT to think about CSS rewriting or picking a new id — that
is a separate flow (see edit_effect.py and create_effect.py). Long
prose makes the model drift; the short form keeps it focused on
label and icon.

No static imports beyond the standard library. This module is pure —
it only builds a string.
"""

from typing import List, Optional


def build_effect_rename_prompt(
    effect_id: str,
    current_css: str,
    effect_label: str = "",
    existing_effect_ids: Optional[List[str]] = None,
) -> str:
    """
    System prompt for the effect-rename flow.

    The model returns a JSON object with a new label and a new SVG
    miniature. The `id` and the CSS are NOT to be changed — the client
    reuses them as-is.

    @param effect_id            — current id, e.g. "fx-rotating-globe"
                                  (kept for context only; NOT changed)
    @param current_css          — current CSS of the effect (read-only)
    @param effect_label         — current human label (optional, for context)
    @param existing_effect_ids  — unused in this flow; kept in the
                                  signature for API symmetry with the
                                  other prompt builders
    @returns the full system prompt as a string
    """
    label_line = f'Текущее название: "{effect_label}".' if effect_label else ""

    return f"""Ты — редактор названий CSS-эффектов для CMS NeuroCad.

Задача: придумать для эффекта НОВОЕ короткое русское название
(label) и НОВУЮ SVG-иконку (media) на основе того, что делает его
CSS.

ВАЖНО:
  - id эффекта НЕ меняется. Он остаётся `{effect_id}`.
  - CSS НЕ меняется. Он остаётся как есть — его вернёт клиент.
  - От тебя нужны РОВНО два поля: new_label и new_media.

СХЕМА ОТВЕТА — ТОЛЬКО ЭТОТ JSON, БЕЗ MARKDOWN, БЕЗ ПОЯСНЕНИЙ:

{{
  "new_label": "...",
  "new_media": "<svg viewBox='0 0 24 24'>...</svg>"
}}

КОНТЕКСТ:
  id эффекта (не меняется):  {effect_id}
  {label_line}

ПРАВИЛА ДЛЯ new_label:
1. Короткое название по-русски (до 80 символов).
2. Отражает СУТЬ эффекта — что пользователь видит на экране.
3. Без кавычек, без лишних символов.

ПРАВИЛА ДЛЯ new_media (SVG-иконка):
4. viewBox ОБЯЗАТЕЛЬНО `0 0 24 24`. Атрибуты width и height НЕ указывай.
5. Иконка отражает ВИЗУАЛЬНУЮ СУТЬ CSS:
      радиальный градиент с кольцами → рисуем кольца;
      линейный диагональный градиент → рисуем диагональные полосы;
      тень → рисуем мягкую полосу тени;
      точки → рисуем точки.
6. Стиль — как в остальных эффектах: светло-серый фон `#f1f5f9`
   с закруглением `rx="3"`, узор — `#cbd5e1` или `#94a3b8`.
7. SVG должен быть валидным XML, ОДНОЙ СТРОКОЙ, без переводов
   строк внутри. Кавычки — двойные.

ПРИМЕР ОТВЕТА:

{{
  "new_label": "Тонкая штриховка медленно дрейфует",
  "new_media": "<svg viewBox=\\"0 0 24 24\\"><rect x=\\"2\\" y=\\"2\\" width=\\"20\\" height=\\"20\\" rx=\\"3\\" fill=\\"#f1f5f9\\"/><g stroke=\\"#cbd5e1\\" stroke-width=\\"1\\"><line x1=\\"2\\" y1=\\"8\\" x2=\\"22\\" y2=\\"4\\"/><line x1=\\"2\\" y1=\\"14\\" x2=\\"22\\" y2=\\"10\\"/><line x1=\\"2\\" y1=\\"20\\" x2=\\"22\\" y2=\\"16\\"/></g></svg>"
}}

ТЕКУЩИЙ CSS ЭФФЕКТА (только для анализа, НЕ переписывай):

{current_css}

ОТВЕТ — ТОЛЬКО JSON. Поля "new_label" и "new_media" обязательны.
"""