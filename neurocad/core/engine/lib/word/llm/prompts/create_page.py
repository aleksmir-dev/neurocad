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
                 Crucially: the QA pass DOES NOT simplify the design.
                 It fixes bugs and PRESERVES every visual effect.

  4. EDIT      — one call that rewrites an existing page. Kept as
                 dead code (edit mode is disabled in the agent);
                 still used as a template for future reference.

Why plan-then-generate
----------------------
Stepwise mode relied on the model to not repeat section names and
to stop on its own. deepseek-flash cannot do either — a 10-step
run produced 10 hero sections and never stopped. Splitting the
concerns fixes it:
  - structure is a single deterministic decision;
  - each per-section call is focused and cannot drift;
  - the driver stops after the last item of the plan.

Design direction
----------------
The default visual language is "modern 2026":
  - light theme, soft grey-blue background (#f6f8fb range);
  - a single saturated accent (deep blue #2563eb by default);
  - soft gradients (linear / radial, low saturation);
  - glassmorphism cards (translucent white + backdrop-filter blur);
  - layered, subtle shadows;
  - generous whitespace;
  - one accent per block, never acid / never dark.

SVG
---
Sections may use inline <svg> freely:
  - icon per card in features / services / categories (24-48px,
    stroke="currentColor", stroke-width="2", fill="none");
  - one abstract decorative <svg> as hero background (blurred blobs,
    soft waves, concentric circles — anything that reads as
    "decoration", not as a picture);
  - any other inline SVG where it improves the layout.

No separate SVG agent is called — everything is generated in the
same section response.

Shared invariants (HTML/CSS split, no frameworks, etc.) are stored
in module-level constants and composed into each prompt. This
keeps the rules in ONE place and stops them drifting between the
modes.

No static imports beyond the standard library.
"""

from typing import List, Optional


# ============================================
# LIMITS
# ============================================

#: Hard cap on sections in a single page. The planner is asked for
#: 4-7; the driver clamps to this as a safety net.
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


# ============================================
# STYLE — visual direction
# ============================================
#
# This is the "design brief" the model must follow. It defines the
# default look so a generated page does not fall back to a flat,
# corporate-default grey. Every rule here has a reason — do not
# trim without thinking.

_STYLE_RULES = """\
ВИЗУАЛЬНОЕ НАПРАВЛЕНИЕ — «современный 2026»:

Тема — СВЕТЛАЯ. Фон страницы — мягкий светло-серо-голубой
(#f6f8fb или близкий). Чисто-белый тоже можно, но не по умолчанию.
Никаких тёмных тем, никаких чёрных фонов.

ПАЛИТРА:
- один акцентный цвет (по умолчанию глубокий синий #2563eb);
- 2-3 поддерживающих оттенка (светлый синий, мягкий серый,
  почти-белый);
- НЕ использовать кислотные цвета, НЕ использовать чистый красный,
  НЕ использовать несколько конкурирующих акцентов.

ЭФФЕКТЫ (обязательны, но дозированно):
- мягкие градиенты: linear-gradient или radial-gradient с НИЗКОЙ
  насыщенностью (не «кислотный» переход, а лёгкий оттенок);
- glassmorphism для карточек: полупрозрачный белый фон
  (rgba(255,255,255,0.7)) + backdrop-filter: blur(10px) + тонкая
  светлая граница (1px solid rgba(255,255,255,0.6));
- аккуратные МНОГОСЛОЙНЫЕ тени:
    box-shadow:
      0 4px 16px rgba(15, 23, 42, 0.06),
      0 1px 3px rgba(15, 23, 42, 0.04);
- hover-состояния на всех кликабельных элементах (карточки,
  кнопки, ссылки): плавный transition 0.2-0.3s, translateY(-2px),
  усиление тени, лёгкое изменение цвета;
- появление секций через @keyframes (opacity 0 -> 1, translateY
  12px -> 0) с animation-delay по порядку, чтобы страница
  «оживала» при загрузке.

ГДЕ ЭФФЕКТЫ УМЕСТНЫ:
- HERO   — фон-градиент, абстрактный SVG-фон, крупный H1,
           кнопка с hover-эффектом;
- КАРТОЧКИ — glassmorphism, тень, hover-подъём;
- КНОПКИ — transition, лёгкое затемнение при hover;
- H2 СЕКЦИЙ — может быть с небольшим декоративным подчёркиванием
              или коротким акцентным штрихом.

ГДЕ ЭФФЕКТОВ НЕ ДОЛЖНО БЫТЬ:
- обычные абзацы текста — просто аккуратная типографика;
- футер — спокойный, без градиентов и анимаций;
- длинные списки — без hover и декоративных элементов на каждом
  пункте.

ЭМОДЗИ:
- допустимы в H2 секций и в заголовках карточек (по одному,
  максимум — не в каждом абзаце);
- НЕ использовать эмодзи в футере, в H1 и в кнопках.

SVG:
- в карточках features / services / categories — по одной
  инлайн-иконке SVG (stroke="currentColor", stroke-width="2",
  fill="none", размер 32-48px);
- в hero — один абстрактный декоративный SVG-фон (мягкие пятна,
  волны, концентрические круги — то, что читается как украшение,
  а не как картинка);
- допустимы инлайн SVG в других секциях, если они улучшают
  композицию.

ТИПОГРАФИКА:
- H1 ≈ 56-72px, font-weight 700-800, letter-spacing -0.02em;
- H2 ≈ 36-44px, font-weight 700;
- H3 ≈ 20-22px, font-weight 600;
- основной текст ≈ 16-18px, line-height 1.6.

РИТМ:
- между секциями — 80-120px вертикального пространства;
- внутри секции — 32-48px между смысловыми блоками;
- контент центрируется, max-width 1100-1200px.

АДАПТИВНОСТЬ:
- @media для (max-width: 1024px) и (max-width: 768px);
- на мобильном — одна колонка, шрифты меньше на 20-25%,
  отступы плотнее, но не «вжатые»."""


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
Ты открываешь страницу — задаёшь палитру, шрифт, скругления,
тени и общий ритм отступов. Последующие секции будут к ним
подстраиваться. Определи всё это сейчас и держись выбора во всех
следующих шагах.

Если целевая секция — hero, она должна ЗАДАТЬ ТОН: мягкий
градиентный фон, возможно абстрактный декоративный SVG на фоне,
крупный заголовок, одна акцентная кнопка."""
    else:
        style_block = """\
СОХРАНЯЙ ЕДИНЫЙ СТИЛЬ со уже сгенерированными секциями:
- та же палитра,
- тот же шрифт,
- те же скругления,
- тот же ритм отступов.
Новую палитру и новый шрифт НЕ вводи.

Если предыдущие секции содержали glassmorphism-карточки, тени,
hover-эффекты — продолжай эту линию. Не «упрощай» на второй
секции: пользователь ждёт ту же визуальную плотность."""

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

{_STYLE_RULES}

КАРТИНКИ И SVG:
- Внешние URL запрещены.
- Иконки в карточках — инлайн <svg> с stroke="currentColor",
  stroke-width="2", fill="none", размер 32-48px. Подбирай иконки
  по смыслу карточки (сердце для «заботы», молния для «скорости»,
  щит для «защиты» и т.п.).
- Абстрактный декоративный SVG — только в hero, как фон.
- Не используй <img src="placeholder.svg"> — если нужна
  «картинка», сделай её через CSS-градиент или SVG.

{_NO_FRAMEWORKS_RULES}

ПРИМЕР ОТВЕТА (секция features, БОГАТАЯ вёрстка):

{{
  "section_name": "features",
  "html": "<section class=\\"features\\"><div class=\\"features__inner\\"><h2 class=\\"features__title\\">Почему нас выбирают</h2><div class=\\"features__grid\\"><div class=\\"features__card\\"><div class=\\"features__icon\\"><svg viewBox=\\"0 0 24 24\\" width=\\"40\\" height=\\"40\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"2\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><path d=\\"M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z\\"/></svg></div><h3 class=\\"features__card-title\\">Забота 24/7</h3><p class=\\"features__card-text\\">Мы рядом в любое время</p></div><div class=\\"features__card\\"><div class=\\"features__icon\\"><svg viewBox=\\"0 0 24 24\\" width=\\"40\\" height=\\"40\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"2\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><polygon points=\\"13 2 3 14 12 14 11 22 21 10 12 10 13 2\\"/></svg></div><h3 class=\\"features__card-title\\">Быстро</h3><p class=\\"features__card-text\\">Ответ за пару минут</p></div></div></div></section>",
  "css": "@keyframes features-fade-in {{ from {{ opacity: 0; transform: translateY(12px); }} to {{ opacity: 1; transform: translateY(0); }} }} .features {{ position: relative; padding: 100px 24px; background: #f6f8fb; overflow-x: hidden; }} .features__inner {{ max-width: 1100px; margin: 0 auto; animation: features-fade-in 0.6s ease-out; }} .features__title {{ font-size: 42px; font-weight: 700; letter-spacing: -0.01em; color: #0f172a; margin: 0 0 48px; text-align: center; }} .features__grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; }} .features__card {{ padding: 36px 28px; border-radius: 20px; background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.6); box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04); transition: transform 0.25s ease, box-shadow 0.25s ease; }} .features__card:hover {{ transform: translateY(-4px); box-shadow: 0 12px 32px rgba(37, 99, 235, 0.12), 0 4px 12px rgba(15, 23, 42, 0.08); }} .features__icon {{ width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%); color: #2563eb; margin-bottom: 20px; }} .features__card-title {{ font-size: 20px; font-weight: 600; color: #0f172a; margin: 0 0 8px; }} .features__card-text {{ font-size: 16px; line-height: 1.6; color: #64748b; margin: 0; }} @media (max-width: 768px) {{ .features {{ padding: 64px 16px; }} .features__title {{ font-size: 30px; margin-bottom: 32px; }} .features__card {{ padding: 28px 22px; }} }}"
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

    The QA pass fixes ONLY real defects — it does NOT simplify the
    design. Every visual effect (gradient, shadow, hover, glass,
    animation) must be preserved. If the section is bare, the QA
    pass is allowed to ADD subtle accents — but never to strip
    existing ones.

    @param target_section  the section name (for the JSON echo)
    @returns the full system prompt as a string
    """
    return f"""\
Ты — QA-инженер для сгенерированной секции лендинга.

Тебе дают ОДНУ секцию страницы (HTML + CSS). Твоя задача —
найти и исправить ТОЛЬКО типичные дефекты вёрстки, НЕ трогая
дизайн.

ФОРМАТ ОТВЕТА — СТРОГО ВАЛИДНЫЙ JSON:
{{
  "section_name": "{target_section}",
  "html": "<section class=\\"{target_section}\\">...</section>",
  "css":  ".{target_section} {{ ... }}",
  "fixed": ["images_overflow", "empty_button"],
  "notes": "кратко что исправил"
}}

ЖЕЛЕЗНОЕ ПРАВИЛО — СОХРАНЯЙ ВСЕ ЭФФЕКТЫ:

Визуал этой секции — НЕ твоя задача. НЕ упрощай. НЕ убирай:
  - градиенты (linear-gradient, radial-gradient, conic-gradient);
  - тени (box-shadow, text-shadow, drop-shadow);
  - эффекты прозрачности и размытия (backdrop-filter, opacity);
  - hover-состояния, :focus, :active, transition;
  - @keyframes и animation;
  - декоративные ::before / ::after;
  - инлайн SVG;
  - большие отступы, ритм, типографику.

Если что-то из перечисленного сломано (например, transition
ссылается на несуществующее свойство) — ПОЧИНИ, но не удаляй.

Если визуал кажется тебе «избыточным» — не трогай. Это решение
дизайнера, а не твоё. Твоя работа — баги, не вкус.

ИЩИ И ИСПРАВЛЯЙ ТОЛЬКО ЭТИ ДЕФЕКТЫ:

1. ПЕРЕПОЛНЕНИЕ ПО ГОРИЗОНТАЛИ.
   - На корневую секцию добавь `overflow-x: hidden;`, если её нет.
   - Если у <img> или <svg> нет max-width: 100% — добавь.
   - Если у контейнера жёсткая width с большим числом —
     замени на max-width + margin: 0 auto; padding: 0 24px.

2. ПУСТЫЕ КНОПКИ И ССЫЛКИ.
   - <button></button> без текста → подставь осмысленный русский
     текст по смыслу.
   - <a href="#"></a> без текста → либо добавь текст, либо удали.

3. НЕВИДИМЫЙ ТЕКСТ.
   - Если у текстового блока `color: #fff` или `#ffffff`, а фон
     секции светлый — поменяй color на тёмный (#0f172a).
   - Если текст и фон совпадают — исправь.

4. ОТСУТСТВУЮЩИЕ @media.
   - Если есть grid/flex с несколькими колонками, но нет
     @media (max-width: 768px) — добавь упрощение до 1 колонки.

5. ДУБЛИРУЮЩИЕСЯ @import.
   - Оставь только ПЕРВЫЙ, остальные удали.

6. ШИРИНА КОНТЕЙНЕРА.
   - Если у внутреннего контейнера `width: <число>px` с большим
     числом (960, 1100, 1200, 1440) без max-width — замени на
     `max-width: <число>px; margin: 0 auto; padding: 0 24px;`.

7. СИНТАКСИЧЕСКИЕ ОШИБКИ В CSS.
   - Незакрытые скобки, лишние символы, обрезанные правила —
     почини.

8. ОБЩИЙ ЗАПАХ «ПУСТОЙ СЕКЦИИ» (ТОЛЬКО ДОБАВЛЕНИЕ, НЕ УДАЛЕНИЕ).
   - Если секция выглядит абсолютно «голой» — ни фона, ни тени,
     ни одного hover-эффекта — МОЖЕШЬ добавить ОДИН мягкий
     акцент: лёгкую тень на карточках, мягкий градиент на фоне
     hero, transition на кнопках. Не больше. Не переделывай
     структуру. Не меняй палитру.
   - Если у секции уже есть эффекты — этот пункт НЕ применяй.

ЕСЛИ ДЕФЕКТОВ НЕТ:
Верни исходные html и css ДОСЛОВНО (символ в символ) и
`"fixed": []`. НЕ ПЫТАЙСЯ улучшить то, что уже работает.

ЧЕГО НЕ ДЕЛАТЬ:
- Не переписывать тексты.
- Не менять палитру.
- Не вводить новые CSS-классы без необходимости.
- Не удалять существующие @media, @keyframes, transition,
  box-shadow, backdrop-filter, градиенты.
- Не оборачивать ответ в markdown (без ```json и ```).
- Не добавлять пояснений до или после JSON.

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
        "СОХРАНИ все эффекты (градиенты, тени, hover, анимации, "
        "glassmorphism, SVG). Верни JSON."
    )

    return "\n".join(parts)


# ============================================
# PHASE 4 — EDIT AN EXISTING PAGE
# ============================================

def build_edit_prompt() -> str:
    """
    System prompt for EDIT mode.

    Kept as a reference / dead code — the create_page agent no
    longer routes into edit. If edit mode returns, this prompt is
    ready to use.
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
   - тексты, которые не просили менять — оставь дословно;
   - эффекты (градиенты, тени, hover, анимации) — сохрани.

2. Меняй ТОЛЬКО то, что просит пользователь.

3. НЕ перегенерируй страницу с нуля.

{_SPLIT_RULES}

{_NO_FRAMEWORKS_RULES}

Верни ОДИН JSON-объект. Начни с {{ и закончи }}."""


def build_edit_user_message(
    user_request: str,
    current_html: str,
    current_css: str,
) -> str:
    """
    User message for the edit call.

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