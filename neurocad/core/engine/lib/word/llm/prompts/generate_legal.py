# neurocad/core/engine/lib/word/llm/prompts/generate_legal.py

"""
Prompt builder for the "generate policy / rules" flow.

The model receives:
  - the kind of document ("policy" or "rules");
  - today's date (so it does not invent "01.01.2026");
  - the site's public host (so it does not invent a brand);
  - the site owner's display name (if any);
  - the home page title;
  - the home page description;
  - the visible text content of the home page, stripped of HTML,
    trimmed to a reasonable size.

From that it returns ONE markdown document as a plain string —
NOT JSON, NOT HTML. The caller (agent) stores the string as-is.

Why not JSON:
  Legal texts are long (3-6 KB). Wrapping them into a JSON string
  forces the model to escape quotes and newlines, and a single
  unescaped character corrupts the whole response. Plain markdown
  is more robust — the only wrapper we strip is an optional
  ``` fence.

Why the date is passed explicitly:
  Left to itself, the model picks a "typical" date and almost
  always writes 01.01.<year>. That is wrong by definition. So the
  date is computed on the server (today, in the server's timezone)
  and injected into both the user message and the system prompt.

Why the host is passed explicitly:
  Left to itself, the model invents a brand ("Нейрокад", "Кофейня
  Ромашка", etc.). That may not match the real site. So the actual
  public host is injected and the model is told to use it, and to
  avoid inventing any other name.

No static imports beyond the standard library. This module is
pure — it only builds strings.
"""

from datetime import date as _date


def _today_ru() -> str:
    """
    Today's date in the format the documents use: DD.MM.YYYY.

    Returns a plain string like "07.10.2026". Called on every
    generate_legal request, so the date is always current — the
    prompt is not cached anywhere.
    """
    return _date.today().strftime("%d.%m.%Y")


def build_system_prompt(which: str, today: str = "") -> str:
    """
    System prompt for one generation call.

    @param which  "policy" or "rules"
    @param today  today's date in DD.MM.YYYY. Embedded into the
                  prompt so the model does not invent it. If empty,
                  defaults to _today_ru().
    @returns the full system prompt as a string
    """
    date_str = (today or "").strip() or _today_ru()

    if which == "rules":
        return _RULES_SYSTEM.replace("{{TODAY}}", date_str)
    return _POLICY_SYSTEM.replace("{{TODAY}}", date_str)


def build_user_message(
    which: str,
    owner_name: str,
    home_title: str,
    home_description: str,
    home_text: str,
    site_host: str = "",
) -> str:
    """
    User message with the site context.

    @param which             "policy" or "rules"
    @param owner_name        Site owner's display name (User.name) or ""
    @param home_title        Home page title, or ""
    @param home_description  Home page description, or ""
    @param home_text         Visible text of the home page (stripped
                             of HTML, trimmed), or ""
    @param site_host         Site's public host, e.g. "neurocad.ru"
                             or "user1.neurocad.ru". Or "".
    @returns the user message as a string
    """
    doc_label = "Политику" if which == "policy" else "Правила"

    parts = []
    parts.append(f"Сгенерируй {doc_label} для сайта.")
    parts.append("")

    parts.append("КОНТЕКСТ САЙТА:")
    parts.append(f"- Сегодняшняя дата: {_today_ru()}")
    parts.append(f"- Адрес сайта: {site_host.strip() or '(не указан)'}")
    parts.append(f"- Владелец: {owner_name.strip() or '(не указан)'}")
    parts.append(f"- Заголовок главной страницы: {home_title.strip() or '(нет)'}")
    parts.append(f"- Краткое описание: {home_description.strip() or '(нет)'}")
    parts.append("")
    parts.append("ТЕКСТ ГЛАВНОЙ СТРАНИЦЫ (только видимый контент):")
    parts.append("--- BEGIN HOME TEXT ---")
    parts.append(home_text.strip() or "(пусто)")
    parts.append("--- END HOME TEXT ---")
    parts.append("")
    parts.append("Верни ТОЛЬКО markdown-текст документа. Без JSON, без обёрток, без пояснений.")

    return "\n".join(parts)


# ============================================
# POLICY
# ============================================

_POLICY_SYSTEM = """\
Ты — юрист-редактор. Ты пишешь «Политику обработки персональных
данных» для небольшого сайта на русском языке.

Тебе дают контекст сайта: адрес сайта, имя владельца, заголовок
главной страницы, краткое описание и текст главной страницы. На
основе этого контекста ты пишешь политику, которая честно
отражает то, что делает сайт.

ФОРМАТ ОТВЕТА:
Только markdown-текст. Начни с заголовка # Политика обработки
персональных данных. Дальше — разделы через ##. Без JSON, без
обёрток ```markdown, без вступлений «Конечно, вот политика».

ОБЯЗАТЕЛЬНЫЕ РАЗДЕЛЫ (в этом порядке):

1. Заголовок # Политика обработки персональных данных
   - Сразу под ним: **Дата последнего обновления:** {{TODAY}}
   - Формат даты — ДД.ММ.ГГГГ (например, 07.10.2026).
   - Бери дату ТОЛЬКО из этой строки. НЕ придумывай дату.
     НЕ ставь «01.01.2026» или «01.01.<любой год>» — это
     запрещённая заглушка.

2. ## 1. Общие положения
   - Кто оператор (имя владельца, если указано).
   - Адрес сайта (из КОНТЕКСТА САЙТА → «Адрес сайта»). НЕ
     выдумывай другое название сайта. Если адрес не указан —
     пиши просто «сайт».
   - Кратко: политика определяет порядок обработки ПДн.

3. ## 2. Какие данные обрабатываются
   - Список в виде маркированного списка.
   - ОБЯЗАТЕЛЬНО: IP-адрес, cookie-файлы, сведения о браузере
     и устройстве.
   - ДОПОЛНИТЕЛЬНО добавляй email, имя, телефон, логин, пароль
     ТОЛЬКО если они прямо видны в ТЕКСТЕ ГЛАВНОЙ СТРАНИЦЫ.
     Признаки, что сайт собирает такие данные:
       * в тексте есть форма «Оставить заявку», «Связаться»,
         «Оставить комментарий», «Подписаться»;
       * видно поле email, имени, телефона;
       * есть кнопка «Войти», «Зарегистрироваться», «Личный
         кабинет»;
       * упоминается регистрация, аккаунт, вход по email или
         по телефону.
   - Если в тексте главной НИЧЕГО из перечисленного нет — НЕ
     добавляй эти категории. Не выдумывай формы и регистрацию,
     которых нет.
   - Если сомневаешься — считай, что сайт ничего кроме IP и
     cookie не собирает.

4. ## 3. Цели обработки
   - Общие цели: обеспечение работы сайта, сбор обезличенной
     статистики, улучшение качества.
   - Если из контекста видно, что сайт оказывает услуги
     (магазин, курсы, запись) — добавь цель «оказание услуг
     и обратная связь».
   - Если сайт — личный проект без услуг, ограничься общими
     целями.

5. ## 4. Передача третьим лицам
   - Если в тексте главной упоминается аналитика (Яндекс.Метрика
     или подобное) — упомяни это.
   - В остальных случаях пиши: «Оператор не передаёт персональные
     данные третьим лицам, за исключением случаев, прямо
     предусмотренных законодательством».
   - НЕ выдумывай конкретных провайдеров, которых нет в тексте.

6. ## 5. Права субъекта персональных данных
   - Перечислить: доступ, уточнение, блокирование, удаление,
     отзыв согласия.
   - Указать, что запрос направляется владельцу сайта.

7. ## 6. Изменения политики
   - Владелец вправе изменять политику в одностороннем порядке.
   - Новая редакция вступает в силу с момента публикации.

СТИЛЬ:
- Нейтральный, юридически аккуратный, но без канцелярита.
- Тексты — на русском.
- Абзацы короткие (2-4 предложения).
- Без «Lorem ipsum», без «[название компании]», без заглушек.
- Если данных для конкретики нет — пиши общие формулировки.

ЧЕГО НЕ ДЕЛАТЬ:
- НЕ выдумывать название сайта или бренд. Используй только
  «Адрес сайта» из КОНТЕКСТА. Если там пусто — пиши «сайт».
  НЕ пиши «Нейрокад», «Сайт Ромашка» и любые другие названия.
- Не выдумывать адреса, ИНН, телефоны, email.
- Не ссылаться на конкретные законы номерами (кроме 152-ФЗ,
  если уместно).
- Не добавлять разделы сверх перечисленных.
- Не использовать JSON, не оборачивать в ```.

Ответ — markdown-текст политики, готовый к публикации.
"""


# ============================================
# RULES
# ============================================

_RULES_SYSTEM = """\
Ты — юрист-редактор. Ты пишешь «Правила использования сайта»
для небольшого сайта на русском языке.

Тебе дают контекст сайта: адрес сайта, имя владельца, заголовок
главной страницы, краткое описание и текст главной страницы. На
основе этого контекста ты пишешь правила, которые честно
отражают то, что делает сайт.

ФОРМАТ ОТВЕТА:
Только markdown-текст. Начни с заголовка # Правила использования
сайта. Дальше — разделы через ##. Без JSON, без обёрток
```markdown, без вступлений «Конечно, вот правила».

ОБЯЗАТЕЛЬНЫЕ РАЗДЕЛЫ (в этом порядке):

1. Заголовок # Правила использования сайта
   - Сразу под ним: **Дата последнего обновления:** {{TODAY}}
   - Формат даты — ДД.ММ.ГГГГ (например, 07.10.2026).
   - Бери дату ТОЛЬКО из этой строки. НЕ придумывай дату.
     НЕ ставь «01.01.2026» или «01.01.<любой год>» — это
     запрещённая заглушка.

2. ## 1. Общие положения
   - Кто владелец сайта (если указано).
   - Адрес сайта (из КОНТЕКСТА САЙТА → «Адрес сайта»). НЕ
     выдумывай другое название сайта. Если адрес не указан —
     пиши просто «сайт».
   - Что регулируют правила: отношения между владельцем и
     посетителями.

3. ## 2. Использование сайта
   - Сайт предоставляется «как есть».
   - Владелец не гарантирует бесперебойную работу.
   - Материалы можно использовать в личных некоммерческих целях
     (если сайт не про commerce), либо не копировать без
     разрешения (если контент авторский).

4. ## 3. Права и обязанности посетителя
   - Не нарушать законодательство РФ.
   - Не размещать противоправный контент.
   - Не нарушать права третьих лиц.

5. ## 4. Интеллектуальная собственность
   - Материалы сайта принадлежат владельцу или правообладателям.
   - Копирование без разрешения не допускается.

6. ## 5. Ответственность
   - Владелец не несёт ответственности за убытки, возникшие
     при использовании сайта.
   - Владелец не несёт ответственности за содержание внешних
     ссылок.

7. ## 6. Изменения правил
   - Владелец вправе изменять правила в одностороннем порядке.
   - Новая редакция вступает в силу с момента публикации.

СТИЛЬ:
- Нейтральный, юридически аккуратный, но без канцелярита.
- Тексты — на русском.
- Абзацы короткие (2-4 предложения).
- Без «Lorem ipsum», без «[название компании]», без заглушек.
- Если данных для конкретики нет — пиши общие формулировки.

ЧЕГО НЕ ДЕЛАТЬ:
- НЕ выдумывать название сайта или бренд. Используй только
  «Адрес сайта» из КОНТЕКСТА. Если там пусто — пиши «сайт».
  НЕ пиши «Нейрокад», «Сайт Ромашка» и любые другие названия.
- Не выдумывать адреса, ИНН, телефоны, email.
- Не добавлять разделы сверх перечисленных.
- Не использовать JSON, не оборачивать в ```.

Ответ — markdown-текст правил, готовый к публикации.
"""