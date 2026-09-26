# neurocad/core/engine/lib/word/llm/prompts/plan.py

"""
Step 1 of the three-step page-building flow: PLAN.

Given a catalog of available blocks (id + label + category, no HTML),
the model picks which blocks to use and in what order, and returns a
JSON object with a "plan" array:

    {
      "plan": [
        {"block_id": "core-hero",     "purpose": "Главный баннер"},
        {"block_id": "core-features", "purpose": "Ключевые преимущества"},
        ...
      ]
    }

Each item carries a short "purpose" hint that the next step (fill)
uses to decide what kind of content goes into the block.

Layout blocks (grids, containers, flex-shell) are EXCLUDED from the
catalog before the prompt is built — the model must not use them.
Composition is done with ready-made sections that already contain
their own grids (core-features, core-steps, core-gallery, ...).

No static imports beyond the standard library. This module is pure —
it only builds a string.
"""

from typing import Any, Dict, List, Optional


# ============================================
# LLM-VISIBLE FILTER
# ============================================

#: Categories that must NOT be shown to the model at the planning step.
#: "Разметка" — grids, containers, flex-shell: they are for manual
#: assembly in the editor only; the LLM composes pages from ready-made
#: sections.
_EXCLUDED_CATEGORIES = {"Разметка"}

#: Explicit block ids to exclude even if their category changes.
#: Belt-and-suspenders: if someone renames the category or moves a
#: block, the id-based filter still catches it.
_EXCLUDED_BLOCK_IDS = {
    "core-container",
    "core-grid-2",
    "core-grid-3",
    "core-grid-4",
    "core-grid-auto",
    "core-flex-shell",
}


def _filter_for_llm(
    block_catalog: Optional[List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    """
    Remove layout blocks from the catalog before the prompt is built.

    Excludes by category (primary) and by explicit block id (fallback).
    Returns a new list — the input is not mutated.
    """
    if not block_catalog:
        return []

    out: List[Dict[str, Any]] = []
    for b in block_catalog:
        cat = b.get("category") or ""
        bid = b.get("id") or ""
        if cat in _EXCLUDED_CATEGORIES:
            continue
        if bid in _EXCLUDED_BLOCK_IDS:
            continue
        out.append(b)
    return out


def build_plan_prompt(
    block_catalog: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """
    System prompt for step 1 (planning).

    The block catalog is embedded WITHOUT HTML — only id, label and
    category. The model chooses which blocks to use and in what
    order, and returns a JSON object with a "plan" array.

    Layout blocks (category "Разметка" + the known layout ids) are
    filtered out here, so the model never sees them.

    Each plan item:
        {"block_id": "core-hero", "purpose": "Главный баннер"}

    @param block_catalog — list of dicts with keys:
        id       (str)
        label    (str)
        category (str) — optional, defaults to "other"
    @returns the full system prompt as a string
    """
    # ---- Filter out layout blocks (never shown to the model) ----
    block_catalog = _filter_for_llm(block_catalog)

    if not block_catalog:
        catalog_block = "(каталог блоков пуст)"
    else:
        # Group by category, keep the order of first appearance
        by_cat: Dict[str, List[Dict[str, Any]]] = {}
        for b in block_catalog:
            cat = b.get("category") or "other"
            by_cat.setdefault(cat, []).append(b)

        lines: List[str] = []
        for cat, blocks in by_cat.items():
            lines.append(f"### {cat}")
            for b in blocks:
                bid = b.get("id", "?")
                label = b.get("label", bid)
                lines.append(f"- `{bid}` — {label}")
            lines.append("")
        catalog_block = "\n".join(lines).rstrip()

    return f"""Ты — архитектор страницы для CMS NeuroCad.

Пользователь описывает, какую страницу он хочет.
Ты выбираешь подходящие блоки из каталога и расставляешь их в нужном
порядке. HTML блоков ты не видишь — только их названия и назначение.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{{
  "plan": [
    {{"block_id": "core-hero", "purpose": "Главный баннер"}},
    {{"block_id": "core-features", "purpose": "Ключевые преимущества"}},
    ...
  ]
}}

ПРАВИЛА:
1. Используй ТОЛЬКО те block_id, которые есть в каталоге ниже.
2. Порядок в plan = порядок блоков на странице (сверху вниз).
3. Поле "purpose" — одна короткая фраза (до 60 символов), зачем этот
   блок на этой странице. Это подсказка для следующего шага.
4. Не добавляй пояснения до или после JSON.
5. Не оборачивай в markdown.
6. Если запрос не про создание/изменение страницы — верни пустой plan.
7. Блоки категории «Разметка» (сетки, контейнеры, flex-shell)
   использовать НЕЛЬЗЯ. Собирай страницу только из готовых секций
   и элементов. Если для композиции нужна сетка — используй секции,
   которые уже включают её внутри (например, core-features,
   core-steps, core-gallery).

КАТАЛОГ БЛОКОВ:

{catalog_block}
"""