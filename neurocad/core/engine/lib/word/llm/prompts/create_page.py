# neurocad/core/engine/lib/word/llm/prompts/create_page.py

"""
Prompts for the create_page agent.

The agent has FOUR modes, each backed by its own prompt builder:

  1. PLAN      — one short call. Returns the LIST of sections:
                     {"sections": ["hero", "features", "footer"]}
                 No HTML, no CSS. Structure is a single decision.

  2. SECTION   — one call per section from the plan. Each call
                 knows exactly which section it produces and returns:
                     {"section_name": "hero",
                      "html": "<section ...>",
                      "css":  ".hero { ... }"}

  3. REVIEW    — one call per generated section. QA pass that finds
                 and fixes common defects (images overflowing, empty
                 buttons, invisible text, missing @media, ...).
                 Returns the same section, possibly corrected, plus
                 a "fixed" list describing what changed.

  4. EDIT      — one call that rewrites an existing page. Takes the
                 current HTML + CSS as context and returns the whole
                 updated page:
                     {"html": "...", "css": "..."}

Why plan-then-generate
----------------------
Stepwise mode relied on the model to not repeat section names and
to stop on its own. deepseek-flash cannot do either — a 10-step
run produced 10 hero sections and never stopped. Splitting the
concerns fixes it:
  - structure is a single deterministic decision;
  - each per-section call is focused and cannot drift;
  - the driver stops after the last item of the plan.

Shared invariants (HTML/CSS split, no frameworks, etc.) are stored
in module-level constants and composed into each prompt. This
keeps the rules in ONE place and stops them drifting between the
four modes.

No static imports beyond the standard library.
"""

from typing import List, Optional


# ============================================
# LIMITS
# ============================================

#: Hard cap on sections in a single page. The planner is asked for
#: 4–7; the driver clamps to this as a safety net.
MAX_SECTIONS = 7

#: Lower bound — a plan with fewer items is almost certainly a
#: parsing failure, not a real design choice.
MIN_SECTIONS = 3


# ============================================
# SHARED RULES (single source of truth)
# ============================================
#
# These snippets are composed into the prompts below. Keeping them
# here stops the rules from drifting between plan / section /
# review / edit — one place to change, all prompts updated.

_LANGUAGE_RULES = """\
ЯЗЫК:
- Весь видимый текст (заголовки, кнопки, подписи, alt) — только
  на русском.
- Технические имена (class, id, CSS-свойства) — на английском."""

_SPLIT_RULES = """\
РАЗДЕЛЕНИЕ HTML И CSS (критически важно):
- HTML содержит ТОЛЬКО разметку. Ни одного <style>, ни одной
  ссылки <link rel="stylesheet">.
- CSS — отдельная строка. БЕЗ тега <style>, БЕЗ обёрток,
  БЕЗ комментариев-заголовков. Просто правила.
- GrapesJS парсит HTML и CSS по разным каналам. Если смешать —
  редактор молча выбросит дерево компонентов."""

_NO_FRAMEWORKS_RULES = """\
ЗАПРЕЩЕНО:
- <script>, <iframe>, <object>, <embed>.
- Внешние <img src="http://..."> и <img src="https://...">.
- Tailwind, Bootstrap и любые CSS-фреймворки.
- Markdown-обёртка вокруг ответа (без ```json и ```).
- Любой текст до или после JSON."""

_STYLE_RULES = """\
СТИЛЬ:
- Готовый сайт, а не черновик.
- Палитра: 2–3 цвета + нейтральные.
- Типографика: h1 ≈ 48–64px, h2 ≈ 32–40px, текст ≈ 16–18px.
- Скругления, тени, аккуратные отступы — да.
- Никаких «Lorem ipsum», «текст здесь», «заголовок».
- Внешние шрифты через @import url('https://fonts.googleapis.com/...')
  разрешены ТОЛЬКО в первой секции страницы.

АДАПТИВНОСТЬ:
- @media для (max-width: 1024px) и (max-width: 768px).
- На мобильном — одна колонка, крупные отступы."""


# ============================================
# PHASE 1 — PLAN
# ============================================

def build_plan_prompt() -> str:
    """
    System prompt for the planning call.

    Asks for a JSON object with a single "sections" array of
    snake_case identifiers. No HTML, no CSS, no "done".

    @returns the full system prompt as a string
    """
    return """Ты — планировщик лендингов.

Тебе дают описание страницы. Ты возвращаешь СПИСОК СЕКЦИЙ, из
которых она должна состоять — сверху вниз.

ФОРМАТ ОТВЕТА — СТРОГО ВАЛИДНЫЙ JSON:
{
  "sections": ["hero", "features", "pricing", "testimonials", "faq", "footer"]
}

ПРАВИЛА:
1. От 4 до 7 секций.
2. Имя секции — короткий английский snake_case: hero, features,
   about, pricing, testimonials, faq, gallery, cta, contact,
   footer, stats, team, menu, services, program, reviews, ...
3. Все имена уникальны. Ни одного повтора.
4. Порядок — как у нормального лендинга:
   - первая: hero (или header),
   - последняя: footer (или cta).
5. Секции должны соответствовать теме запроса.
6. Возвращай ТОЛЬКО JSON — без HTML, без CSS, без пояснений.

ПРИМЕРЫ:

Запрос: «собери лендинг для приюта кошек»
Ответ: {"sections": ["hero", "about", "cats", "adopt", "donate", "footer"]}

Запрос: «сделай страницу для кофейни»
Ответ: {"sections": ["hero", "menu", "about", "gallery", "contact", "footer"]}

Запрос: «промо для онлайн-курса по Python»
Ответ: {"sections": ["hero", "program", "author", "reviews", "pricing", "cta", "footer"]}

Запрос: «сайт стоматологии»
Ответ: {"sections": ["hero", "services", "doctors", "reviews", "prices", "contact", "footer"]}

Верни ОДИН JSON-объект. Начни с { и закончи }."""


def build_plan_user_message(user_request: str) -> str:
    """User message for the planning call."""
    text = (user_request or "").strip()
    return (
        f"Запрос на страницу:\n\n{text}\n\n"
        'Верни JSON: {"sections": [...]}.'
    )


# ============================================
# PHASE 2 — ONE SECTION
# ============================================

def _format_names(names: Optional[List[str]], empty: str) -> str:
    """Render a list of section names as a numbered block."""
    if not names:
        return empty
    return "\n".join(f"  {i + 1}. {n}" for i, n in enumerate(names))


def build_section_prompt(
    target_section: str,
    sections_done: Optional[List[str]] = None,
    sections_remaining: Optional[List[str]] = None,
) -> str:
    """
    System prompt for ONE per-section call.

    @param target_section      the exact section to produce now
    @param sections_done       sections already generated (for
                               style continuity)
    @param sections_remaining  sections still to come (so the
                               model doesn't cram everything into
                               the current section)

    @returns the full system prompt as a string
    """
    done_block = _format_names(
        sections_done,
        "(пока ничего — это первая секция)",
    )
    remaining_block = _format_names(
        sections_remaining,
        "(последняя секция страницы)",
    )

    if not sections_done:
        # First section: it sets the visual language for the whole
        # page. Be explicit about what that means.
        style_block = """\
Ты открываешь страницу — задаёшь палитру, шрифт, скругления и
общий ритм отступов. Последующие секции будут к ним подстраиваться.
Определи всё это сейчас и держись выбора во всех следующих шагах."""
    else:
        style_block = """\
СОХРАНЯЙ ЕДИНЫЙ СТИЛЬ со уже сгенерированными секциями:
- та же палитра,
- тот же шрифт,
- те же скругления,
- тот же ритм отступов.
Новую палитру и новый шрифт НЕ вводи."""

    return f"""\
Ты — веб-дизайнер и фронтенд-разработчик.

Ты собираешь лендинг пошагово. На этом шаге — РОВНО ОДНА секция:
«{target_section}».

НЕ генерируй другие секции. НЕ генерируй всю страницу. Один
корневой элемент: <section> (или <header>/<footer>/<nav>, если
так логичнее по смыслу).

{_LANGUAGE_RULES}

УЖЕ СГЕНЕРИРОВАНО:
{done_block}

ПОСЛЕ ЭТОЙ СЕКЦИИ БУДУТ:
{remaining_block}

{style_block}

ФОРМАТ ОТВЕТА — СТРОГО ВАЛИДНЫЙ JSON:
{{
  "section_name": "{target_section}",
  "html": "<section class=\\"{target_section}\\">...</section>",
  "css":  ".{target_section} {{ ... }}"
}}

{_SPLIT_RULES}

КЛАССЫ:
- Префикс = имя секции. Всё внутри .{target_section} начинается
  с .{target_section}__* — например .{target_section}__title,
  .{target_section}__lead, .{target_section}__grid.
- Не используй классы из нашего редактора (.section, .container,
  .card, .btn, .grid) — у тебя своя система.

КАРТИНКИ:
- Inline <svg>...</svg>, либо
- <div class="{target_section}__placeholder"></div> с фоновым
  градиентом в CSS.
- Никаких внешних URL.

{_STYLE_RULES}

{_NO_FRAMEWORKS_RULES}

ПРИМЕР ОТВЕТА (секция features):
{{
  "section_name": "features",
  "html": "<section class=\\"features\\"><div class=\\"features__inner\\"><h2 class=\\"features__title\\">Почему нас выбирают</h2><div class=\\"features__grid\\"><div class=\\"features__card\\"><h3>Забота 24/7</h3><p>Мы рядом в любое время</p></div><div class=\\"features__card\\"><h3>Опытные врачи</h3><p>Стаж от 10 лет</p></div></div></div></section>",
  "css": ".features {{ padding: 80px 24px; }} .features__inner {{ max-width: 1100px; margin: 0 auto; }} .features__title {{ font-size: 40px; margin: 0 0 40px; text-align: center; }} .features__grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; }} .features__card {{ padding: 32px 24px; border-radius: 16px; background: #f7f7f9; }} @media (max-width: 768px) {{ .features {{ padding: 60px 16px; }} .features__title {{ font-size: 28px; }} }}"
}}

Верни ОДИН JSON-объект. Начни с {{ и закончи }}."""


def build_section_user_message(user_request: str) -> str:
    """User message for a per-section call."""
    text = (user_request or "").strip()
    return f"Запрос на страницу:\n\n{text}"


# ============================================
# PHASE 3 — REVIEW ONE SECTION (QA)
# ============================================

def build_review_prompt(target_section: str) -> str:
    """
    System prompt for the QA pass over ONE generated section.

    The model gets a section (HTML + CSS) and must find and fix a
    fixed list of common defects. It must NOT redesign, NOT add
    blocks, NOT change the style. Only fix bugs.

    If nothing is wrong, it returns the section unchanged with
    "fixed": [].

    @param target_section  the section name (for the JSON echo)
    @returns the full system prompt as a string
    """
    return f"""\
Ты — QA-инженер для сгенерированной секции лендинга.

Тебе дают ОДНУ секцию страницы (HTML + CSS) и просьбу найти и
исправить типичные дефекты вёрстки.

ЭТО НЕ РЕДИЗАЙН. ЭТО ТОЧЕЧНАЯ ПРАВКА БАГОВ.

НЕ меняй дизайн, НЕ добавляй новые блоки, НЕ переписывай тексты,
НЕ вводи новые классы, НЕ меняй палитру.

ИЩИ И ИСПРАВЛЯЙ ТОЛЬКО ЭТИ ДЕФЕКТЫ:

1. КАРТИНКИ ЗА ГРАНИЦАМИ.
   - Если в HTML есть <img> или <svg>, а в CSS нет
     `max-width: 100%;` для них — добавь правило.
     Например: `.{target_section} img {{ max-width: 100%; height: auto; }}`
   - Если у картинки прописан фиксированный width больше
     контейнера — замени на `max-width: 100%;`.

2. ПУСТЫЕ КНОПКИ И ССЫЛКИ.
   - <button></button> без текста → подставь осмысленный русский
     текст по смыслу кнопки.
   - <a href="#"></a> без текста → либо добавь текст, либо удали.

3. НЕВИДИМЫЙ ТЕКСТ.
   - Если у текстового блока `color: #fff` (белый) или `#ffffff`,
     а фон секции белый/светлый — поменяй color на тёмный
     (например, #1a1a1a).
   - Если текст и фон совпадают — исправь.

4. ОТСУТСТВУЮЩИЕ @media.
   - Если секция содержит grid/flex с несколькими колонками, но
     нет `@media (max-width: 768px)` — добавь упрощение до 1
     колонки для мобильных.

5. ДУБЛИРУЮЩИЕСЯ @import.
   - Оставь только ПЕРВЫЙ, остальные удали.

6. ШИРИНА КОНТЕЙНЕРА.
   - Если у внутреннего контейнера `width: <число>px` с большим
     числом (960, 1100, 1200, 1440) — замени на
     `max-width: <число>px; margin: 0 auto; padding: 0 24px;`

7. OVERFLOW.
   - Добавь `overflow-x: hidden;` на корневую секцию, чтобы
     ничего не вылезало за экран.

ФОРМАТ ОТВЕТА — СТРОГО ВАЛИДНЫЙ JSON:
{{
  "section_name": "{target_section}",
  "html": "<section class=\\"{target_section}\\">...</section>",
  "css":  ".{target_section} {{ ... }}",
  "fixed": ["images_overflow", "empty_button"],
  "notes": "кратко что исправил"
}}

ЕСЛИ ДЕФЕКТОВ НЕТ:
Верни исходные html и css ДОСЛОВНО (символ в символ) и
`"fixed": []`. НЕ ПЫТАЙСЯ улучшить то, что уже работает.

ЧЕГО НЕ ДЕЛАТЬ:
- Не добавляй новых секций или блоков внутри секции.
- Не вводи новых CSS-классов без необходимости.
- Не добавляй новых @import.
- Не удаляй существующие @media.
- Не оборачивай ответ в markdown (без ```json и ```).
- Не добавляй пояснений до или после JSON.

Верни ОДИН JSON-объект. Начни с {{ и закончи }}.
"""


def build_review_user_message(
    target_section: str,
    section_html: str,
    section_css: str,
    user_request: str,
) -> str:
    """
    User message for the QA pass.

    @param target_section  section name (echoed for the model)
    @param section_html    the generated HTML to review
    @param section_css     the generated CSS to review
    @param user_request    the original prompt (for context)
    @returns the user message as a string
    """
    parts = []

    parts.append(f"Секция: {target_section}")
    parts.append("")
    parts.append("Исходный запрос пользователя:")
    parts.append((user_request or "").strip() or "(без текста)")
    parts.append("")

    parts.append("--- BEGIN SECTION HTML ---")
    parts.append((section_html or "").strip() or "(пусто)")
    parts.append("--- END SECTION HTML ---")
    parts.append("")

    parts.append("--- BEGIN SECTION CSS ---")
    parts.append((section_css or "").strip() or "(пусто)")
    parts.append("--- END SECTION CSS ---")
    parts.append("")

    parts.append(
        "Проверь секцию по списку дефектов из системного промпта. "
        "Верни JSON."
    )

    return "\n".join(parts)


# ============================================
# PHASE 4 — EDIT AN EXISTING PAGE
# ============================================

def build_edit_prompt() -> str:
    """
    System prompt for EDIT mode.

    The model gets the current page HTML + CSS and a request that
    describes what to change. It returns the whole updated page in
    the same {"html": ..., "css": ...} shape as single-shot mode.

    The prompt is emphatic about minimal intervention — deepseek-
    flash likes to "improve" the whole page when asked to tweak a
    single button.

    @returns the full system prompt as a string
    """
    return f"""\
Ты — редактор лендинга.

Тебе дают ТЕКУЩУЮ страницу (HTML + CSS) и запрос на правку.
Ты возвращаешь ОБНОВЛЁННУЮ страницу ЦЕЛИКОМ.

ЭТО НЕ ГЕНЕРАЦИЯ С НУЛЯ. ЭТО ТОЧЕЧНАЯ ПРАВКА.

ФОРМАТ ОТВЕТА — СТРОГО ВАЛИДНЫЙ JSON:
{{
  "html": "<весь HTML страницы>",
  "css":  "<весь CSS страницы>"
}}

ГЛАВНОЕ ПРАВИЛО — МИНИМАЛЬНОЕ ВМЕШАТЕЛЬСТВО:

1. Сохрани ВСЁ, что не просили менять:
   - секции, не упомянутые в запросе — оставь как есть;
   - палитру, шрифты, отступы, скругления — не трогай;
   - тексты, которые не просили менять — оставь дословно.

2. Меняй ТОЛЬКО то, что просит пользователь. Примеры:
   - «поменяй цвет кнопки» → поменяй цвет кнопки, больше ничего;
   - «убери секцию с отзывами» → удали её и связанный CSS;
   - «добавь блок с ценами после features» → добавь новую секцию
     после features, остальное не трогай;
   - «сделай заголовок крупнее» → измени только размер заголовка.

3. НЕ перегенерируй страницу с нуля. Если текущий стиль кажется
   тебе некрасивым — не трогай его, пока не попросят. Твоя задача
   — правка, а не улучшение.

4. Не добавляй новых секций, не удаляй существующих, не меняй
   тексты, если это явно не указано в запросе.

ФОРМАТ:
- Один корневой контейнер <div class="core-engine-lib-word-blocks">
  уже присутствует в HTML. Сохрани его.
- Если в исходном CSS был @import шрифта — оставь его первой
  строкой.

{_SPLIT_RULES}

{_NO_FRAMEWORKS_RULES}

ПРИМЕРЫ:

Запрос: «поменяй цвет кнопки в hero на зелёный»
→ в CSS находишь .hero__btn и меняешь background. Остальное —
  дословно как было.

Запрос: «убери секцию Отзывы»
→ в HTML удаляешь <section class="testimonials">…</section>,
  в CSS — все правила .testimonials*. Остальное — как было.

Запрос: «добавь после features блок с ценами»
→ в HTML после секции features вставляешь
  <section class="pricing">…</section>, в CSS добавляешь
  правила .pricing*. Остальное — как было.

Запрос: «сделай заголовок hero крупнее»
→ в CSS увеличиваешь font-size у .hero__title. Остальное —
  как было.

Верни ОДИН JSON-объект. Начни с {{ и закончи }}."""


def build_edit_user_message(
    user_request: str,
    current_html: str,
    current_css: str,
) -> str:
    """
    User message for the edit call.

    Embeds the current page (HTML + CSS) as reference blocks, then
    the request. The CSS block is skipped entirely if the CSS is
    empty, so the message is not littered with empty headers.

    @param user_request   raw text from the chat
    @param current_html   the page HTML currently on the canvas
    @param current_css    the page CSS currently on the canvas
    @returns the user message as a string
    """
    parts: List[str] = []

    parts.append("ЗАПРОС НА ПРАВКУ:")
    parts.append((user_request or "").strip() or "(без текста)")
    parts.append("")

    parts.append("--- BEGIN CURRENT PAGE HTML ---")
    parts.append((current_html or "").strip() or "(пусто)")
    parts.append("--- END CURRENT PAGE HTML ---")
    parts.append("")

    if current_css and current_css.strip():
        parts.append("--- BEGIN CURRENT PAGE CSS ---")
        parts.append(current_css.strip())
        parts.append("--- END CURRENT PAGE CSS ---")
        parts.append("")

    parts.append(
        "Верни обновлённую страницу ЦЕЛИКОМ: "
        '{"html": "...", "css": "..."}. '
        "Меняй только то, что просит пользователь. "
        "Всё остальное сохрани ДОСЛОВНО."
    )

    return "\n".join(parts)