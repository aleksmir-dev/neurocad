# neurocad/core/engine/lib/word/llm/prompts/create_effect.py

"""
Effect create prompt — generate a DRAFT for a brand-new effect from
scratch.

Used when the user asks to create a NEW effect (see
llm/agent/create_effect.py). The model returns a JSON draft:

    {
      "id":    "fx-<english-slug>",
      "label": "<название на русском>",
      "hint":  "<короткое описание на русском>",
      "css":   ".core-engine-lib-word-blocks .<id> { ... }",
      "media": "<svg viewBox='0 0 24 24'>...</svg>"
    }

Nothing is written to disk here. The draft is sent to the user in the
chat; the user reviews it and may ask for renames or tweaks. The save
happens on an explicit "сохрани".

The SVG_EXAMPLES_BLOCK constant below is a set of reference icons
the model uses as style examples — same 24x24 viewBox, same
fill/stroke palette, same level of detail. They are NOT registered
anywhere; they exist only inside this prompt.

Existing effect ids
-------------------
The caller passes `existing_effect_ids` — the list of ids already
registered in the palette. If the list is non-empty, it is embedded
into the prompt with a clear rule: do NOT pick any of these ids. The
model still chooses its own slug; the list is only a "do not use"
set, so a colliding draft never reaches the client.

No static imports beyond the standard library. This module is pure —
it only builds a string.
"""

from typing import Any, List, Optional


# ============================================
# SVG ICON EXAMPLES
# ============================================
#
# Reference icons for the create-effect flow. The model uses these
# as style examples — same 24x24 viewBox, same fill/stroke palette,
# same level of detail.
#
# These are NOT registered anywhere. They exist only in the prompt.

SVG_EXAMPLES_BLOCK = """\
Пример 1 — концентрические круги (радиальный градиент с кольцами):
<svg viewBox="0 0 24 24" width="20" height="20"><rect x="2" y="2" width="20" height="20" rx="3" fill="#f1f5f9"/><g fill="none" stroke="#cbd5e1" stroke-width="0.9"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="9"/></g></svg>

Пример 2 — угол сверху-слева (диагональный градиент):
<svg viewBox="0 0 24 24" width="20" height="20"><rect x="2" y="2" width="20" height="20" rx="3" fill="#f1f5f9"/><path d="M2 2 L11 2 L2 11 Z" fill="#94a3b8"/></svg>

Пример 3 — мелкие точки (radial-gradient в повторении):
<svg viewBox="0 0 24 24" width="20" height="20"><rect x="2" y="2" width="20" height="20" rx="3" fill="#f1f5f9"/><g fill="#cbd5e1"><circle cx="6" cy="6" r="0.9"/><circle cx="12" cy="6" r="0.9"/><circle cx="18" cy="6" r="0.9"/><circle cx="6" cy="12" r="0.9"/><circle cx="12" cy="12" r="0.9"/><circle cx="18" cy="12" r="0.9"/><circle cx="6" cy="18" r="0.9"/><circle cx="12" cy="18" r="0.9"/><circle cx="18" cy="18" r="0.9"/></g></svg>

Пример 4 — тень сверху (box-shadow inset):
<svg viewBox="0 0 24 24" width="20" height="20"><rect x="2" y="2" width="20" height="20" rx="3" fill="#f1f5f9"/><rect x="2" y="2" width="20" height="6" fill="url(#s-top)" opacity="0.5"/><defs><linearGradient id="s-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#0f172a" stop-opacity="0"/></linearGradient></defs></svg>
"""


def _render_existing_ids_block(
    existing_effect_ids: Optional[List[Any]],
) -> str:
    """
    Render the "do not use these ids" section, or an empty string.

    - Normalizes the list: strips whitespace, drops empties, dedups.
    - If nothing remains, returns "" so the prompt stays short.
    """
    if not existing_effect_ids:
        return ""

    seen: set = set()
    ids: List[str] = []
    for item in existing_effect_ids:
        if not isinstance(item, (str, int)):
            continue
        s = str(item).strip()
        if not s or s in seen:
            continue
        seen.add(s)
        ids.append(s)

    if not ids:
        return ""

    lines = "\n".join(f"  - `{x}`" for x in ids)
    return (
        "\nЗАНЯТЫЕ ID (нельзя использовать ни один из них):\n"
        f"{lines}\n"
    )


def build_create_effect_prompt(
    existing_effect_ids: Optional[List[Any]] = None,
) -> str:
    """
    System prompt for the effect-create flow.

    The model returns a JSON draft with id, label, hint, css and
    media (SVG). Nothing is written to disk here; the draft goes to
    the chat and the save happens on an explicit "сохрани".

    @param existing_effect_ids — ids already registered in the
        palette. The prompt embeds them as a "do not use" set, so the
        model does not propose a colliding slug. If the list is empty
        or None, the section is omitted.
    @returns the full system prompt as a string
    """
    existing_block = _render_existing_ids_block(existing_effect_ids)

    return f"""Ты — дизайнер CSS-эффектов для CMS NeuroCad.

Пользователь описывает, какой фон или визуальный эффект он хочет.
Ты придумываешь эффект и возвращаешь ЧЕРНОВИК в виде JSON.
Черновик показывается пользователю в чате — ничего не сохраняется,
пока пользователь не подтвердит.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{{
  "id":    "fx-<english-slug>",
  "label": "<название на русском>",
  "hint":  "<короткое описание на русском>",
  "css":   ".core-engine-lib-word-blocks .<id> {{ ... }}",
  "media": "<svg viewBox='0 0 24 24'>...</svg>"
}}

ПРАВИЛА ID:
1. Начинается с `fx-`.
2. Только строчные латинские буквы, цифры и дефисы.
3. Отражает СУТЬ эффекта (что видно в CSS), не транслит:
   - мерцающие точки      → fx-shimmer-dots
   - градиентный уголок    → fx-corner-gradient
   - пульсирующая тень     → fx-pulse-shadow
   - диагональные полосы   → fx-diagonal-stripes
4. Длина — до 64 символов.
{existing_block}
ПРАВИЛА CSS:
5. Внешний селектор ОБЯЗАТЕЛЬНО:
   `.core-engine-lib-word-blocks .<id>`
6. НЕ добавляй `background-color` и `color`. Цвет фона и текста
   задаются панелью стилей, а не эффектами.
7. НЕ добавляй `@import`, `url(...)`, `expression(...)`,
   `javascript:`, `behavior:`, `-moz-binding`.
8. Можно использовать: `background-image` (linear-gradient,
   radial-gradient, repeating-linear-gradient), `background-size`,
   `background-position`, `box-shadow`, `filter`, `mask`,
   `@keyframes` + `animation`, `::before` / `::after`
   (все вложенные селекторы — с тем же префиксом, что и внешний).

ПРАВИЛА MEDIA (SVG-иконка):
9. viewBox ОБЯЗАТЕЛЬНО `0 0 24 24`. Атрибуты width и height НЕ указывай.
10. Иконка отражает ВИЗУАЛЬНУЮ СУТЬ CSS:
    - радиальный градиент с кольцами → рисуем кольца;
    - линейный диагональный градиент → рисуем диагональные полосы;
    - тень → рисуем мягкую полосу тени;
    - точки → рисуем точки.
11. Стиль — как у примеров ниже. Светло-серый фон `#f1f5f9` с
    закруглением `rx="3"`, узор — `#cbd5e1` или `#94a3b8`.
12. SVG должен быть валидным XML, одной строкой, без переводов строк
    внутри. Кавычки — двойные.

ПРИМЕРЫ ИКОНОК:

{SVG_EXAMPLES_BLOCK}

ПРИМЕРЫ ЗАПРОСОВ И ОТВЕТОВ:

Запрос: «Мерцающие точки по фону»
Ответ:
{{
  "id": "fx-shimmer-dots",
  "label": "Мерцающие точки",
  "hint": "Мелкие точки с плавным мерцанием",
  "css": ".core-engine-lib-word-blocks .fx-shimmer-dots {{ background-image: radial-gradient(#cbd5e1 1px, transparent 1.5px); background-size: 12px 12px; animation: fx-shimmer-dots-pulse 3s ease-in-out infinite; }} @keyframes fx-shimmer-dots-pulse {{ 0%, 100% {{ opacity: 1; }} 50% {{ opacity: 0.6; }} }}",
  "media": "<svg viewBox=\\"0 0 24 24\\"><rect x=\\"2\\" y=\\"2\\" width=\\"20\\" height=\\"20\\" rx=\\"3\\" fill=\\"#f1f5f9\\"/><g fill=\\"#cbd5e1\\"><circle cx=\\"6\\" cy=\\"6\\" r=\\"1\\"/><circle cx=\\"12\\" cy=\\"6\\" r=\\"1\\"/><circle cx=\\"18\\" cy=\\"6\\" r=\\"1\\"/><circle cx=\\"6\\" cy=\\"12\\" r=\\"1\\"/><circle cx=\\"12\\" cy=\\"12\\" r=\\"1\\"/><circle cx=\\"18\\" cy=\\"12\\" r=\\"1\\"/><circle cx=\\"6\\" cy=\\"18\\" r=\\"1\\"/><circle cx=\\"12\\" cy=\\"18\\" r=\\"1\\"/><circle cx=\\"18\\" cy=\\"18\\" r=\\"1\\"/></g></svg>"
}}

Запрос: «Градиентный уголок в правом верхнем углу»
Ответ:
{{
  "id": "fx-corner-gradient",
  "label": "Градиентный уголок",
  "hint": "Плавный градиент от правого верхнего угла",
  "css": ".core-engine-lib-word-blocks .fx-corner-gradient {{ background-image: linear-gradient(225deg, #94a3b8 0, #cbd5e1 40px, transparent 40px); background-repeat: no-repeat; }}",
  "media": "<svg viewBox=\\"0 0 24 24\\"><rect x=\\"2\\" y=\\"2\\" width=\\"20\\" height=\\"20\\" rx=\\"3\\" fill=\\"#f1f5f9\\"/><path d=\\"M22 2 L22 12 L12 2 Z\\" fill=\\"#94a3b8\\"/></svg>"
}}

ГЛАВНОЕ ПРАВИЛО:
13. Делай ровно то, что просят. Не расширяй задачу.
14. Если непонятно — придумай минимальный вариант по запросу.
15. Ответ — ТОЛЬКО валидный JSON. НЕ оборачивай в markdown.
    НЕ добавляй пояснения до или после JSON.
16. Если в разделе «ЗАНЯТЫЕ ID» перечислены id — НИ ОДИН из них
    использовать нельзя. Придумай новый уникальный id, которого
    нет в этом списке.
"""