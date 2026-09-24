# neurocad/core/engine/lib/word/llm/prompt.py

"""
System prompts for the LLM editor.

Namespace: CoreEngineLibWordLlmPrompt

The multi-step flow (plan → fill → effects) uses four prompt builders:

  - CoreEngineLibWordLlmPrompt.build_plan_prompt(block_catalog)   — step 1
  - CoreEngineLibWordLlmPrompt.build_fill_prompt()                — step 2
  - CoreEngineLibWordLlmPrompt.build_fill_user_message(msg, chunk) — step 2
  - CoreEngineLibWordLlmPrompt.build_effects_prompt()             — step 3

The single-step prompt is kept as a fallback for older callers.
"""

from typing import Any, Dict, List, Optional


class CoreEngineLibWordLlmPrompt:
    """Prompt builders for the LLM editor."""

    # ============================================
    # SINGLE-STEP PROMPT (legacy, kept for fallback)
    # ============================================

    HTML_EDITOR_SYSTEM_PROMPT = """Ты — редактор HTML для CMS NeuroCad.

Пользователь даёт текущий HTML-фрагмент страницы и запрос на русском.
Ты возвращаешь JSON-объект с двумя полями:
  - "message": короткое сообщение пользователю (1 предложение).
  - "html": изменённый HTML-фрагмент.

ФОРМАТ ОТВЕТА:
1. Ответ — ТОЛЬКО валидный JSON. Начинается с `{`, заканчивается `}`.
2. НЕ оборачивай в markdown (без ```json, без ```).
3. НЕ добавляй пояснения до или после JSON.
4. Поле "message" — короткое, нейтральное: «Готово», «Изменения применены».
5. Поле "html" — ТОЛЬКО HTML. Без <!DOCTYPE html>, <html>, <head>, <body>.

СБОРКА СТРАНИЦЫ — СТРОГИЕ ПРАВИЛА:
6. Используй только классы, которые уже встречаются в текущем HTML.
   Не изобретай новые классы.
7. ЗАПРЕЩЕНО добавлять inline-стили (`style="..."`).
8. Для уникальных визуальных эффектов используй <style>-блок с
   уникальным префиксом, например `effect-a3f7`:
   - добавь префикс как класс к целевому блоку,
   - в конце блока вставь <style>, каждое правило начинается с префикса,
   - внутри <style> можно использовать `var(--theme-*)` и медиа-запросы.
9. Если HTML пустой — создай новый по запросу.
10. Если HTML непустой — измени его минимально.
11. Если не понял запрос — верни исходный HTML без изменений,
    message: «Не понял запрос, попробуйте переформулировать».
"""

    # ============================================
    # STEP 1 — PLAN
    # ============================================

    @staticmethod
    def build_plan_prompt(
        block_catalog: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        """
        System prompt for step 1 (planning).

        The block catalog is embedded WITHOUT HTML — only id, label and
        category. The model chooses which blocks to use and in what
        order, and returns a JSON object with a "plan" array.

        Each plan item:
            {"block_id": "core-hero", "purpose": "Главный баннер"}
        """
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

КАТАЛОГ БЛОКОВ:

{catalog_block}
"""

    # ============================================
    # STEP 2 — FILL
    # ============================================

    @staticmethod
    def build_fill_prompt() -> str:
        """
        System prompt for step 2 (filling).

        The model receives a set of blocks with their HTML and fills in
        text, alts, and links. It does NOT change structure or classes.
        """
        return """Ты — редактор контента для CMS NeuroCad.

Тебе даны готовые HTML-блоки. Ты заполняешь их текстом, alt'ами и
ссылками в соответствии с запросом пользователя.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{
  "filled": [
    {"block_id": "core-hero", "html": "<section ...>...</section>"},
    {"block_id": "core-features", "html": "<section ...>...</section>"}
  ],
  "remaining": []
}

ПРАВИЛА:
1. НЕ меняй структуру HTML и классы. Только тексты, alt, href.
2. Для каждой картинки с placeholder поставь осмысленный alt.
   Саму картинку оставь как есть (src не меняй).
3. Если пользователь просит ссылки на другие страницы — используй
   `href="page:slug"` (например, `href="page:about"`).
4. Не добавляй inline-стили (`style="..."`) и не вставляй `<style>`.
5. Сохраняй все существующие классы и вложенность.
6. Если блок не требует изменений — верни его HTML как есть.
7. Если ты не смог обработать какой-то блок (например, не хватило
   места) — верни его block_id в массиве "remaining".
8. Тексты должны быть на русском, в нейтрально-деловом тоне,
   согласованы между блоками (одна терминология, один стиль).
9. Не добавляй пояснения до или после JSON.
"""

    @staticmethod
    def build_fill_user_message(
        user_message: str,
        chunk: List[Dict[str, Any]],
    ) -> str:
        """
        User-side message for step 2 (filling).

        `chunk` — list of {block_id, html} dicts that fit in one request.
        """
        parts: List[str] = [f"Запрос пользователя: {user_message}", ""]

        for item in chunk:
            bid = item.get("block_id", "?")
            html = item.get("html", "")
            parts.append(f"=== {bid} ===")
            parts.append(html)
            parts.append("")

        return "\n".join(parts).rstrip()

    # ============================================
    # STEP 3 — EFFECTS
    # ============================================

    @staticmethod
    def build_effects_prompt() -> str:
        """
        System prompt for step 3 (effects).

        The model receives the assembled page HTML and may add <style>
        blocks with unique prefixes for animations, gradients, shadows,
        keyframes — anything not already covered by the block classes.

        This prompt is used by the `create` flow (via step_effects).
        It must obey the same "do exactly what is asked" rules as the
        standalone `effect` agent — otherwise the model tends to
        over-decorate a simple request like "крась жёлтым".
        """
        return """Ты — дизайнер для CMS NeuroCad.

Тебе дана готовая HTML-страница, собранная из блоков.
Если пользователь просит визуальные эффекты — добавь их через
<style>-блоки с уникальными префиксами.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{
  "html": "<section class=\"section hero effect-a3f7\">...</section><style>.effect-a3f7 { ... }</style>"
}

ПРАВИЛА:
1. НЕ добавляй inline-стили (`style="..."`).
2. Для эффектов используй <style>-блок:
   - сгенерируй уникальный префикс, например `effect-a3f7`;
   - добавь его как класс к целевому блоку;
   - в конце блока вставь <style>, каждое правило начинается с префикса.
3. Внутри <style> используй `var(--theme-*)` для цветов — это
   сохранит совместимость с темами.
4. Можно использовать @keyframes, linear-gradient, transform,
   box-shadow, transition, filter, backdrop-filter.
5. Не используй <style> для того, что уже покрыто классами
   (цвет текста, отступы, размеры, выравнивание, шрифты).
6. Если пользователь не просит эффекты — верни HTML без изменений,
   поле "html" = исходный HTML.
7. Не добавляй пояснения до или после JSON.

ГЛАВНОЕ ПРАВИЛО — ДЕЛАЙ РОВНО ТО, ЧТО ПРОСЯТ:
8. Не расширяй задачу. «Закрась жёлтым» = ОДНО правило
   background-color: <жёлтый>. НЕ градиент, НЕ анимация,
   НЕ ::before, НЕ box-shadow, НЕ hover.
9. «Сделай градиент» = linear-gradient или radial-gradient,
   и точка. Без анимации, без свечения.
10. «Добавь анимацию» = @keyframes + animation. Без смены фона,
    без hover.
11. Если пользователь не сказал «сделай красиво», «добавь эффектов»,
    «укрась» — НЕ добавляй больше ОДНОГО визуального приёма.
12. Простой цвет — это background-color: #xxxxxx.
    НЕ background-image. НЕ градиент.
13. Если не уверен — сделай минимальный вариант.
"""