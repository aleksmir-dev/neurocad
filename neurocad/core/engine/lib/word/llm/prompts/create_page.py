# neurocad/core/engine/lib/word/llm/prompts/create_page.py

"""
Prompts for the create_page agent.

Two groups:

  1. GENERATION (existing) — plan, section, review, edit.
     These are the phases the agent runs after the brief is
     collected (or skipped, if the user said "вперёд" on the
     first turn).

  2. DIALOG (new) — a single prompt used BEFORE generation.
     The agent looks at the chat history and decides:
       - ask the next clarifying question, OR
       - stop asking and start generating.

     The dialog prompt lists the 6 genres and the questions
     that make sense for each. The model is NOT forced to ask
     every question — it skips what the user already answered
     (in the router's dialog, or in the first message), and it
     recognises ANY formulation of "вперёд" / "хватит" /
     "поехали" / "на твоё усмотрение" — no hard triggers.

Constants
---------
MAX_SECTIONS, MIN_SECTIONS — bounds for the plan phase.

User-facing strings are in Russian. Code, comments and
identifiers are in English.
"""

from typing import Dict, List, Optional


# ============================================
# CONSTANTS
# ============================================

#: Bounds for the number of sections in the plan.
#: Kept small on purpose: for a typical landing 4–5 sections
#: are enough. A short longread may have 3. 7 is the ceiling.
#: Larger numbers (10+) make the generation visibly slow —
#: each section is a separate LLM call (plus QA, if enabled).
MIN_SECTIONS = 3
MAX_SECTIONS = 7


# ============================================
# DIALOG — GENRES AND QUESTIONS
# ============================================
#
# The list below is embedded in the dialog prompt. Keep it short
# and concrete — the model does not need prose, it needs a menu.

_GENRES = [
    (
        "landing",
        "Лендинг",
        "Одна страница, чтобы что-то продать "
        "(товар, услугу, курс, запись).",
    ),
    (
        "longread",
        "Лонгрид / статья",
        "Один большой текст с подзаголовками, "
        "возможно с цитатами и картинками.",
    ),
    (
        "promo",
        "Промо / приглашение",
        "Короткая страница про событие: что, когда, где, "
        "как попасть.",
    ),
    (
        "personal",
        "Личная страница / портфолио",
        "Визитка: кто я, чем занимаюсь, что показать, "
        "как связаться.",
    ),
    (
        "faq",
        "FAQ-страница",
        "Вопросы и ответы по одной теме.",
    ),
    (
        "menu",
        "Меню / прайс / мини-каталог",
        "Список позиций (товары, услуги, блюда) "
        "с ценами и категориями.",
    ),
]


# ============================================
# DIALOG PROMPT
# ============================================

def build_dialog_prompt() -> str:
    """
    System prompt for the dialog phase.

    The model receives the whole chat history and decides:
      - ask one clarifying question (returns {"question": "..."}), OR
      - stop asking and generate (returns {"ready": true}).

    It must NOT generate HTML here — only decide and, if needed,
    ask. Generation happens in the next phase.

    Hard rule for ready=true: genre AND topic must be known,
    AND at least 2 topic-specific questions (numbered 4+) must be
    answered (or the user said "вперёд"). The model is explicitly
    told NOT to guess on the user's behalf. This is the NeuroCad
    rule: better to ask once more than to generate the wrong page.

    The list of questions is genre-specific: for a landing it is
    different from a personal page. The model must use the list
    under the chosen genre — not a generic checklist.
    """
    genres_block = "\n".join(
        f"  - {key}: {label} — {desc}"
        for key, label, desc in _GENRES
    )

    return f"""Ты — помощник NeuroCad. Пользователь хочет, чтобы ты собрал ему страницу. Прежде чем начать, ты задаёшь ему уточняющие вопросы — но НЕ все подряд, а только те, ответов на которые ещё нет.

ТВОЯ ЗАДАЧА СЕЙЧАС:
Посмотреть историю чата и решить — задать ещё один вопрос ИЛИ начать генерировать.

ЖАНРЫ СТРАНИЦ (выбери один, если он ещё не выбран):

{genres_block}

ВОПРОСЫ ПО ЖАНРАМ (задавай по одному, только то, чего ещё нет в истории):

Общие для всех жанров (пункты 1–3 — НЕ считаются в правиле 7в):
  1. Жанр — что за страница? (если не ясно из первого сообщения)
  2. Тематика — о чём страница?
  3. Аудитория — для кого?

Лендинг:
  4. Что продаёшь? (товар / услуга / курс)
  5. Блоки — hero / фичи / отзывы / цены / FAQ / форма? (или на твоё усмотрение)
  6. Эффекты — fade / slide / без?
  7. Тексты — сам напишешь или пользователь даст?
  8. Особые пожелания?

Лонгрид / статья:
  4. Главная мысль — что хочешь донести?
  5. Длина — короткая (5–10 абзацев) / длинная (20+)?
  6. Стиль — нейтральный / разговорный / научный / художественный?
  7. Подзаголовки / цитаты / картинки / списки — что нужно?
  8. Текст пишу я (с нуля) или у вас есть свой?

Промо / приглашение:
  4. Какое событие?
  5. Когда?
  6. Где?
  7. Как попасть? (регистрация / билет / свободный вход)
  8. Карта места нужна?

Личная страница / портфолио:
  4. Кто ты / чем занимаешься?
  5. Что показать? (фото / работы / опыт)
  6. Контакты — как связаться?
  7. Особые пожелания?

FAQ:
  4. Тема — про что вопросы?
  5. Сколько вопросов — 5 / 10 / 20?
  6. Примерные вопросы есть или придумать?
  7. Стиль ответов — короткие / подробные?

Меню / прайс:
  4. Что за позиции? (товары / услуги / блюда)
  5. Сколько позиций?
  6. Категории нужны?
  7. Цены показывать?
  8. Описания к каждой позиции или только названия?

ПРАВИЛА:

1. Сначала посмотри историю чата. Возможно, пользователь УЖЕ ответил на какие-то вопросы — сам, или в диалоге с администратором. НЕ переспрашивай то, что уже есть.

2. Задавай ТОЛЬКО ОДИН вопрос за раз. Не список.

3. Вопрос должен быть коротким, дружелюбным, на русском, заканчиваться на "?".

4. Если жанр ещё не определён — первый вопрос ВСЕГДА про жанр.

5. Если жанр уже определён (например, пользователь написал "собери лендинг") — пропусти вопрос про жанр, начни с тематики.

6. Если пользователь написал что-то вроде "вперёд", "хватит", "поехали", "не спрашивай больше", "на твоё усмотрение", "давай сам" — прекращай спрашивать. Ставь ready = true. Независимо от того, сколько вопросов задано.

7. Ставь ready = true ТОЛЬКО если выполнены ВСЕ условия:

   а) Жанр определён (landing / longread / promo / personal / faq / menu).
      Если пользователь не назвал жанр — спроси.

   б) Тематика ясна — о чём страница.
      Если непонятно — спроси.

   в) Получены ответы МИНИМУМ на 2 вопроса ИЗ СПИСКА ПОД ЖАНР, НЕ СЧИТАЯ
      пункты 1, 2, 3 (жанр, тематика, аудитория). Считаются ТОЛЬКО
      пункты с номером 4 и выше в списке выбранного жанра.
      Если ответов меньше 2 — задай следующий неотвеченный вопрос
      из списка под жанр.

   г) ИЛИ пользователь сказал что-то вроде "вперёд" / "хватит" / "поехали".

   Если хотя бы одно из условий а, б, в не выполнено (и нет г) —
   задавай следующий неотвеченный вопрос из списка под жанр.

8. НЕ додумывай за пользователя. Даже если тебе кажется, что "и так
   всё ясно" — проверь по списку под жанр, есть ли МИНИМУМ 2 ответа
   на пункты 4+. Если нет — задай следующий вопрос. Это правило
   NeuroCad: ЛУЧШЕ ПЕРЕСПРОСИТЬ, чем сгенерировать не то.

9. Если вопросов больше не осталось (все пункты 4+ из списка под жанр
   заданы и получены ответы) — ставь ready = true.

10. Если пользователь в первом сообщении уже дал ответы на ВСЕ пункты
    списка под жанр (например, для personal — и "кто", и "что показать",
    и "контакты", и "особые пожелания"), и этих ответов МИНИМУМ 2 из
    пунктов 4+ — ставь ready = true. Если хотя бы один пункт 4+ из
    списка под жанр НЕ упомянут и НЕ подразумевается однозначно —
    задай вопрос по нему.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON, ОДИН ИЗ ДВУХ:

  {{"question": "<твой вопрос>"}}
  {{"ready": true}}

Не пиши ничего кроме JSON. Не объясняй. Не добавляй текст до или после.

ПРИМЕРЫ, ГДЕ ready = FALSE (надо задать вопрос):

- История пуста, первое сообщение: "Собери страницу для кофейни"
  → {{"question": "Какого типа страница нужна — лендинг, лонгрид, промо, личная, FAQ или меню?"}}

- Первое сообщение: "Собери лендинг для кофейни"
  (жанр есть, тематика есть, но из пунктов 4+ НЕТ ни одного)
  → {{"question": "Что именно продаёте или продвигаете?"}}

- Первое сообщение: "Хочу статью про то, как я учился фотографировать в горах"
  (жанр — лонгрид — ясен, тематика — ясна, но из пунктов 4+ ничего)
  → {{"question": "О чём именно рассказать — про конкретную поездку или про опыт в целом?"}}

- Первое сообщение: "Сделай визитку. Анна, фотограф, Москва, instagram @anna_photo. Стиль — минимализм"
  (жанр — personal — ясен, тематика — фотограф — ясна, контакты — есть.
   НО: «что показать» — работы / опыт / услуги — НЕ указано.
   И «особые пожелания» к содержанию — НЕ указаны.
   Из пунктов 4+ получен ответ только на пункт 6 (контакты) — это 1 ответ, меньше 2.)
  → {{"question": "Что показать на странице — работы, опыт, услуги?"}}

- Любое сообщение, где из пунктов 4+ получено меньше 2 ответов
  → {{"question": "<следующий неотвеченный вопрос из списка под жанр>"}}

ПРИМЕРЫ, ГДЕ ready = TRUE (достаточно информации):

- Диалог:
  "Собери лендинг для кофейни" → "Готовая или шаблон?" → "Готовая" → "5 блоков, hero/фичи/форма, эффект fade"
  (жанр, тематика + из пунктов 4+: блоки и эффекты — 2 ответа)
  → {{"ready": true}}

- Пользователь сказал "вперёд" или "хватит" на любом шаге
  → {{"ready": true}}

- Диалог:
  "Сделай визитку" → "Чем занимаетесь?" → "Фотограф, показываю работы" → "Какие контакты?" → "Instagram @anna_photo"
  (жанр, тематика + из пунктов 4+: что показать и контакты — 2 ответа)
  → {{"ready": true}}

Верни ОДИН JSON-объект. Начни с {{ и закончи }}.
"""


def build_dialog_user_message(
    user_message: str,
    history: Optional[List[Dict[str, str]]] = None,
) -> str:
    """
    User-message part of the dialog prompt.

    Contains the last user message and (optionally) a short
    summary of the dialog so far. The full history is passed
    to the model separately, as `messages`, so this function
    focuses on the CURRENT turn.

    Actually, the agent calls this with the same user_message
    that came in from the WS. The history itself is passed to
    `build_messages(system, user, history)` — see steps/common.
    So the string here is just the user message itself.
    """
    return user_message or ""


# ============================================
# PLAN PROMPT
# ============================================

def build_plan_prompt() -> str:
    """
    System prompt for the plan phase.

    The model returns a JSON with a list of section names —
    snake_case, short, one per section. The order is the
    order of sections on the page.

    The upper bound is small (MAX_SECTIONS = 7) on purpose:
    each section is a separate LLM call, and 10+ sections
    make generation visibly slow. For a typical landing 4–5
    are enough; a short longread may have 3.
    """
    return f"""Ты — планировщик структуры страницы для конструктора NeuroCad.

Твоя задача — предложить РАЗУМНУЮ структуру страницы по описанию пользователя.

ПРАВИЛА:
1. Верни от {MIN_SECTIONS} до {MAX_SECTIONS} секций.
   Для лендинга обычно 4–5 секций. Не раздувай список.
2. Каждая секция — это короткое имя на латинице в snake_case:
   только строчные буквы, цифры и подчёркивания.
3. Порядок — сверху вниз, как на реальной странице.
4. Имена должны быть осмысленными: hero, about, features, gallery,
   pricing, testimonials, faq, cta, contacts, footer.
5. Не повторяйся — каждая секция уникальна.
6. Каждая секция должна быть содержательной, а не "заполнителем".
   Не добавляй пустые блоки только чтобы дотянуть до максимума.
7. Не добавляй пояснений, комментариев, текста вокруг.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{{"sections": ["hero", "features", "pricing", "cta"]}}

Верни ОДИН JSON-объект. Начни с {{ и закончи }}.
"""


def build_plan_user_message(user_message: str) -> str:
    """User-message part of the plan prompt."""
    return (
        "Описание страницы от пользователя:\n\n"
        f"{user_message}\n\n"
        "Верни JSON со списком секций."
    )


# ============================================
# SECTION PROMPT
# ============================================

def build_section_prompt(
    target_section: str,
    sections_done: List[str],
    sections_remaining: List[str],
) -> str:
    """
    System prompt for generating ONE section.

    Receives the section name, the already-generated ones and
    the ones still to come — so the model does not repeat
    content or duplicate styles.
    """
    done_block = ", ".join(sections_done) if sections_done else "(пока ничего)"
    remaining_block = (
        ", ".join(sections_remaining) if sections_remaining else "(это последняя)"
    )

    return f"""Ты — генератор HTML+CSS секций для конструктора NeuroCad.

Сейчас ты генерируешь ОДНУ секцию: «{target_section}».

УЖЕ СГЕНЕРИРОВАНО (не повторяй содержание и стили):
{done_block}

ЕЩЁ БУДЕТ (не забегай вперёд):
{remaining_block}

ПРАВИЛА:
1. Верни ТОЛЬКО эту одну секцию — один блок <section> с уникальными классами.
2. Никаких inline-стилей (style="..."). Всё — в CSS.
3. CSS — в отдельном поле ответа. Классы — с префиксом от имени секции, чтобы не пересекались с другими.
4. Адаптивность: добавь @media для узких экранов (max-width: 768px), если есть сетка или колонки.
5. Осмысленный контент: не lorem ipsum, не «текст текст текст». Реальные фразы по теме пользователя.
6. Никаких ссылок на внешние картинки, которых нет. Если нужна картинка — используй SVG-заглушку или иконку символом.
7. Не используй position: absolute без родителя с position: relative.
8. Не используй отрицательные margin, если не уверен в раскладке.
9. Не задавай z-index без необходимости.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{{"html": "<section class=\\"...\\">...</section>", "css": ".имя-секции {{ ... }}"}}

Верни ОДИН JSON-объект. Начни с {{ и закончи }}.
"""


def build_section_user_message(user_message: str) -> str:
    """User-message part of the section prompt."""
    return (
        "Описание страницы от пользователя:\n\n"
        f"{user_message}\n\n"
        "Сгенерируй следующую секцию по системной инструкции."
    )


# ============================================
# REVIEW PROMPT (QA)
# ============================================

def build_review_prompt(target_section: str) -> str:
    """
    System prompt for the QA pass over ONE generated section.

    The model receives HTML+CSS of one section and must find
    and fix common layout / content defects. Returns the
    fixed HTML+CSS, or an empty pair if nothing to fix.

    Known defect classes the QA must look for:
      - position: absolute without a positioned ancestor;
      - negative margins that pull content out of bounds;
      - z-index set without a stacking context;
      - overflow: hidden clipping real content;
      - inline styles (style="...");
      - empty buttons / links without text;
      - images without alt;
      - missing @media for a grid layout;
      - text that would be invisible on its background
        (contrast check, best-effort).
    """
    return f"""Ты — QA-проверяющий для секции «{target_section}» в конструкторе NeuroCad.

Ты получаешь HTML+CSS одной секции. Твоя задача — найти и ИСПРАВИТЬ типичные дефекты вёрстки. Если дефектов нет — верни исходный HTML+CSS без изменений.

ЧТО ПРОВЕРЯТЬ:

1. position: absolute без родителя с position: relative — исправь, добавив position: relative родителю.
2. Отрицательные margin, которые «утаскивают» контент за пределы — убери или компенсируй padding.
3. z-index без контекста наложения — убери или задай родителю position: relative.
4. overflow: hidden, который обрезает реальный контент — замени на overflow: visible или добавь padding.
5. Inline-стили (style="...") — вынеси в CSS-класс.
6. Кнопки и ссылки без текста — добавь осмысленный текст.
7. Изображения без alt — добавь.
8. Сетка на flex/grid без @media для узких экранов — добавь.
9. Невидимый текст (тёмный на тёмном, светлый на светлом) — исправь цвета.
10. Перекрытие соседних элементов (если видно из структуры) — убери.

ПРАВИЛА:
1. НЕ переписывай секцию с нуля. Только точечные исправления.
2. НЕ меняй содержание — только вёрстку.
3. НЕ добавляй новых блоков или элементов.
4. Если дефектов нет — верни ровно то, что получил, и укажи fixed: [].
5. Список fixed — короткий, по одному пункту на исправление.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{{
  "html": "<section ...>...</section>",
  "css": ".имя-секции {{ ... }}",
  "fixed": ["краткое описание исправления 1", "описание 2"],
  "notes": "короткий комментарий, необязательно"
}}

Верни ОДИН JSON-объект. Начни с {{ и закончи }}.
"""


def build_review_user_message(
    target_section: str,
    section_html: str,
    section_css: str,
    user_request: str,
) -> str:
    """
    User-message part of the review prompt.

    Contains the section to review, its CSS, and the original
    user request (as context — what the section is supposed
    to be about).
    """
    return (
        f"Секция: {target_section}\n\n"
        f"Исходный запрос пользователя:\n{user_request}\n\n"
        f"HTML секции:\n{section_html}\n\n"
        f"CSS секции:\n{section_css}\n\n"
        "Проверь и исправь дефекты по системной инструкции. "
        "Верни JSON."
    )


# ============================================
# EDIT PROMPT (disabled mode, kept for the future)
# ============================================

def build_edit_prompt() -> str:
    """
    System prompt for the edit phase (currently disabled).

    Kept for the future — when create_page can edit an existing
    page instead of always replacing it.
    """
    return """Ты — редактор страницы в конструкторе NeuroCad.

Пользователь просит изменить существующую страницу. Ты получаешь её текущий HTML и CSS, а также запрос пользователя. Верни ИЗМЕНЁННУЮ страницу целиком.

ПРАВИЛА:
1. Сохраняй всё, что пользователь не просил менять.
2. Не переписывай секции с нуля, если это не требуется.
3. Никаких inline-стилей. CSS — отдельным полем.
4. Если пользователь просит «убери блок» — убери целиком.
5. Если пользователь просит «поменяй текст» — поменяй только текст.
6. Верни весь HTML страницы целиком, а не только изменённый кусок.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{{"html": "<section...>...</section>", "css": ".имя-секции {{ ... }}"}}

Верни ОДИН JSON-объект. Начни с {{ и закончи }}.
"""


def build_edit_user_message(
    user_request: str,
    current_html: str,
    current_css: str,
) -> str:
    """User-message part of the edit prompt."""
    return (
        f"Запрос пользователя:\n{user_request}\n\n"
        f"Текущий HTML страницы:\n{current_html}\n\n"
        f"Текущий CSS страницы:\n{current_css}\n\n"
        "Верни JSON с изменённым HTML и CSS."
    )