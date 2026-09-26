# neurocad/core/engine/lib/word/llm/prompts/effects.py

"""
Step 3 of the three-step page-building flow: EFFECTS.

The model does NOT write CSS. It receives the assembled page HTML and
a catalog of effects that are actually available in the editor's
palette (loaded from registry.json). It adds ONE of the ready-made
`fx-*` classes to a target element.

The catalog is now passed IN, instead of being hard-coded here. This
means:

  - adding a new effect = editing fx/*.css + registry.json — no
    change to this module;
  - the model only ever sees effects that are REALLY available; if
    the palette has 8 effects, the prompt lists exactly those 8.

If the caller passes an empty / missing catalog (should not happen
in normal flow), we fall back to a small hard-coded set so the
prompt still makes sense.

No static imports beyond the standard library. This module is pure —
it only builds a string.
"""

from typing import Any, Dict, List, Optional


# ============================================
# FALLBACK CATALOG
# ============================================
#
# Used ONLY when the caller does not pass a real catalog (e.g. an
# error loading registry.json). In normal flow the caller passes the
# live list from CoreEngineLibWordEffectsService.list_effects().

FALLBACK_EFFECTS: List[Dict[str, Any]] = [
    {"id": "fx-shadow-top-n",  "label": "Тень сверху",       "hint": "Мягкая тень у верхнего края"},
    {"id": "fx-corner-tl-n",   "label": "Угол сверху-слева", "hint": "Акцентный уголок в левом верхнем углу"},
    {"id": "fx-corner-tr-n",   "label": "Угол сверху-справа","hint": "Акцентный уголок в правом верхнем углу"},
    {"id": "fx-circles-n",     "label": "Круги",             "hint": "Концентрические круги в центре"},
]


def _render_catalog(effects: Optional[List[Dict[str, Any]]]) -> str:
    """
    Turn a list of effect dicts into a bullet list for the prompt.

    Each line is:
        - `fx-<id>` — <label>: <hint>

    If `effects` is empty or missing, returns FALLBACK_EFFECTS.
    """
    src = effects if effects else FALLBACK_EFFECTS
    lines: List[str] = []
    for e in src:
        eid = str(e.get("id", "")).strip()
        if not eid:
            continue
        label = str(e.get("label", eid)).strip()
        hint = str(e.get("hint", "")).strip()
        if hint and hint != label:
            lines.append(f"- `{eid}` — {label}: {hint}")
        else:
            lines.append(f"- `{eid}` — {label}")

    if not lines:
        lines.append("(нет доступных эффектов)")

    return "\n".join(lines)


def build_effects_prompt(
    effects: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """
    System prompt for step 3 (effects).

    The model does NOT write CSS. It receives the assembled page HTML
    and a catalog of effects that are actually available in the
    editor's palette. It adds ONE of the ready-made `fx-*` classes to
    a target element.

    @param effects — list of {id, label, hint, ...} dicts from
                     CoreEngineLibWordEffectsService.list_effects().
                     If None or empty, FALLBACK_EFFECTS is used.
    @returns the full system prompt as a string
    """
    catalog_block = _render_catalog(effects)

    return f"""Ты — дизайнер для CMS NeuroCad.

Тебе дана готовая HTML-страница, собранная из блоков, и список
доступных фоновых эффектов. Твоя задача — применить эффекты к
секциям страницы.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{{
  "html": "<section class=\\"section hero\\">...</section>"
}}

ДОСТУПНЫЕ ЭФФЕКТЫ (классы из effects.css):

{catalog_block}

ПРАВИЛА:
1. Используй ТОЛЬКО классы из списка выше. Не изобретай свои.
2. Применяй эффекты К СЕКЦИЯМ (тег <section>), а не к внутренним
   элементам (h2, p, div.container). Эффекты — фоновые, они
   рассчитаны на всю секцию.
3. Эффекты можно применять РАЗНЫЕ к разным секциям. Не бойся
   использовать 2–3 разных эффекта на одной странице, если
   секций несколько.
4. НЕ добавляй <style>-блоки. НЕ добавляй inline-стили
   (`style="..."`). Эффекты уже определены в effects.css.
5. Структура HTML не меняется. Только добавляется класс к тегу
   <section>.
6. Не более ОДНОГО эффекта `fx-*` на одну секцию. Если у секции
   уже есть класс `fx-*` — замени его, а не добавляй второй.
7. Не добавляй эффект, если у секции есть свой фон (класс с
   background или явный `style="background..."`) — иначе фон
   сломается.
8. Если на странице ровно одна секция — примени один эффект.
9. Если пользователь не просит эффекты — верни HTML без изменений.
10. Не добавляй пояснения до или после JSON.

ПРИМЕРЫ:

Запрос: «Сделай фон секции в точку»
Было:  <section class="section hero">...</section>
Стало: <section class="section hero fx-dots-sm-n">...</section>

Запрос: «Добавь шахматный фон карточке»
Было:  <div class="card features__item">...</div>
Стало: <div class="card features__item fx-checker-n">...</div>

Запрос: «Сделай фон с волнами»
Было:  <section class="section cta">...</section>
Стало: <section class="section cta fx-waves-n">...</section>

Запрос: «Добавь рамку блоку с контактами»
Было:  <section class="section contacts">...</section>
Стало: <section class="section contacts fx-border-inset-n">...</section>

ГЛАВНОЕ ПРАВИЛО — ДЕЛАЙ РОВНО ТО, ЧТО ПРОСЯТ:
11. Не расширяй задачу. «Сделай фон в точку» = ОДИН класс
    `fx-dots-sm-n` на секции. Больше ничего.
12. Если непонятно, к какому элементу применить — не добавляй
    эффект вообще. Лучше ничего, чем эффект не на том месте.
13. Если подходящего эффекта нет в списке — не добавляй ничего.
    Не придумывай свой класс.
"""