# Саммари проекта NeuroCad

## О проекте

NeuroCad — конструктор сайтов на базе ИИ. Пользователь описывает словами, что хочет, — ИИ собирает страницу. Работает в продакшене. Есть публичный сайт (neurocad.ru), документация (doc.neurocad.ru, doc.neurocad-dev.ru), и dev-среда.

Стек:

- Backend — Python (FastAPI), SQLite через SQLAlchemy, Alembic для миграций.
- Frontend — vanilla JS, модули с динамическим импортом (версия из window.coreEngine.static_version).
- Редактор — GrapesJS 0.21.13, интегрирован кастомно.
- LLM — несколько провайдеров через фабрику (utils/llm/factory.py), есть mock (LLM_MOCK=1).

Основные сущности:

- Nav — экземпляр сайта пользователя. У каждого пользователя может быть несколько.
- Page — страница (или папка, если card_type='folder'). С полями content, content_json, css, template_id, is_template, card_type, parent_id, sort_order, url.
- PageHist — история изменений страницы (снапшоты).
- PageChat — история чата с LLM по странице.
- Run — запись о запуске LLM-флоу (роутер → агент).
- Balance — баланс пользователя (токены, генерации, тариф).

## Что делали в этом чате

Начали с вопроса про отключённые агенты и ошибающийся роутер. В процессе:

1. Документация «Агент "Администратор"» (бывший «Роутер»)
Переименовали технический термин «Роутер» в человеческое «Администратор» — для VibeCode-аудитории (не программисты).

Написали страницу с 8 разделами: Что это / Зачем / Почему всегда спрашивает / Как проходит диалог / Что если не отвечать / Сколько раз можно уточнять / Что важно запомнить / Пример из жизни / Связанные агенты.

Ключевая идея: Администратор всегда задаёт уточняющий вопрос, даже если уверен на 100%. Аргумент: дешевле переспросить, чем запустить не того агента на 5 минут и стереть результат.

2. Код «Администратора»
Что сделали:

models/page_chat.py — добавили поле is_quest (Integer, default 0). Флаг: сообщение — уточняющий вопрос администратора. Нужен, чтобы роутер понял: следующий ответ пользователя — это ответ на уточнение или новый запрос.

Миграция — ./migrate.sh make "add is_quest to page_chat". Выполнена.

service.py (LLM) — save_chat_message принимает is_quest, load_chat_history возвращает.

websocket/history.py — _load_history прокидывает is_quest.

agent/router.py — полностью переписан:

два промпта: SYSTEM_PROMPT_ASK (задать вопрос) и SYSTEM_PROMPT_PICK (выбрать агента);

_extract_dialog(history) — вытаскивает весь диалог уточнений с последнего is_quest=0;

_is_last_assistant_question(history) — проверяет is_quest у последнего сообщения ассистента;

route() возвращает {"agent": ..., "question": ...} — либо агент, либо вопрос;

new_request: true в pick-промпте — если пользователь сменил тему, роутер заново задаёт вопрос;

убрана retry-детекция (_RETRY_RE) — всё решает LLM.

websocket/dispatch.py — _run_agent:

новый метод _handle_route_question — сохраняет вопрос с is_quest=True, ставит run в awaiting_answer, отправляет пользователю;

убран target (его больше нет в ответе роутера);

fallback на help, если роутер вернул None без вопроса.

runs.py — в активные статусы добавлен awaiting_answer.

Тесты — все прошли:

5 юнит-тестов на _extract_dialog и _is_last_assistant_question;

4 теста на route() с fake-провайдером: ask / pick / new_request / unknown_agent;

живой тест в чате: «Собери лендинг для кофейни» → вопрос администратора → «готовая» → create_page собрал 7 секций. Работает.

3. Побочно — выяснили, что почти все агенты отключены в роутере
В router.py в AGENTS только три: create_page, help, none. Остальные (create, fill, effect, edit, rename, create_effect, template_uni, template_art, article) — реализованы, но в роутер не добавлены.

Причина: старая версия роутера не справлялась с выбором между похожими агентами. Решение — включать по одному, с проверкой.

План на будущее:

template_uni («Универсальный шаблон») — сначала код, потом документация.

template_art («Шаблон для статей»).

article («Статья»).

Затем — включение остальных (Create, Fill, Effect, Edit, Rename, Create Effect, Generate Logo, Generate Legal).

4. Документация «Агент "Вежливый отказ"» (бывший None)
Переименовали None → «Вежливый отказ» (в документации; в коде остаётся None).

Написали HTML страницы — 8 разделов, с метафорой «вежливого секретаря». Уточнили: перед отказом администратор всегда переспрашивает.

CSS страницы пока не вставлен — обсудили, но до конца не доделали.

5. Баг с CSS шаблона (в TODO)
Проблема: CSS базового шаблона (id=63, 43 KB) содержит и nav/sidebar/layout, и стили статьи (.doc-article, .doc-title, .doc-section*, .doc-list, .doc-quote, --doc-*). Но стили статьи не применяются к контенту дочерних страниц:

публичный просмотр — нет;

просмотр в админке — нет;

редактор (iframe) — нет.

Обходимся дублированием CSS на каждой странице. Разбираться — отдельно.

Правильная архитектура (когда починим):

CSS шаблона = только nav/sidebar/layout (43 KB, но без .doc-*);

CSS страницы = стили статьи (.doc-article, .doc-title, .doc-section*, .doc-list, .doc-quote, --doc-*);

.doc-* не должны быть в шаблоне — они по определению стили статьи.

6. Дублирование страниц — СДЕЛАНО в этой сессии
Задача: добавить функцию «Копировать страницу» — дублирование внутри того же nav. Копировать всё (content, content_json, css, description, logo, url, card_type, parent_id, sort_order, is_template, template_id, is_active). Не копировать PageHist (история) и PageChat (чат).

Что сделано (полный стек):

Бэкенд:
- service.py — метод duplicate_item(item_id, nav_id). Копирует все поля, сбрасывает id/datetime/rss_yandex_id/is_delete. Для страниц datetime = now(), для папок = NULL. Заголовок: «<оригинал> (копия)». Защита от коллизии datetime в одну секунду — сдвиг на +1 сек. НЕ копирует PageHist и PageChat.
- route.py — POST /core/engine/lib/pages/item/{item_id}/duplicate. Возвращает {success, data}. 404 если item не найден.

Фронт:
- base/cards/toolbar/toolbar.js — новая кнопка «Копировать» (класс .cards-toolbar-btn-copy). Enabled при selectedCount >= 1, disabled в trash-режиме. Порядок в LEFT-группе: folder → add → copy → edit → move → delete → restore → extras → counter.
- base/cards/initool.js — флаг showCopyButton, колбэк onCopy → cards._handleCopySelected(ids).
- base/cards/cards.js — onCopySelected callback + _handleCopySelected(ids) делегат.
- lib/pages/copy.js — copySelected(pages, ids) + duplicateItemSilent(pages, id). Confirm через BaseModalConfirm, ошибки — через BaseModalMessage. Не показываем модалку на каждый упавший item в batch — только один раз в конце.
- lib/pages/utils.js — вынесены общие утилиты (apiUrl, canEdit, isSuperadmin, formatDate, formatTime, nextArticleNumber, patchPayloadNormalization, confirm, message).
- lib/pages/pages.js — оркестратор сокращён, добавлены делегаты _copySelected(ids) → copy.js.

Кнопка в тулбаре — доделана.

7. Перемещение страниц — СДЕЛАНО в этой сессии (новая функция)
Задача: добавить функцию «Переместить» — смена parent_id у одного элемента (страницы или папки). Отличие от копирования: работает ТОЛЬКО на одной выделенной карточке (как edit). Причина: перемещение — решение по каждому элементу отдельно, batch-перемещение превращается в «почему 8 карточек оказались здесь?».

Что сделано (полный стек):

Иконка:
- static/core/engine/lib/base/images/move.svg — папка с вертикальной стрелкой вниз внутри. Стиль как у copy.svg / edit.svg / delete.svg: 24×24, stroke="currentColor", stroke-width="2", без заливки.

Бэкенд:
- service.py → get_list() — новый параметр is_folder: Optional[int]. Фильтр: 1 — только папки, 0 — только страницы, None — все. Используется move.js для запроса дерева: GET /list?is_folder=1 (без parent_id) → плоский список всех папок nav.
- service.py → update_item() — защита от циклов. Перед присвоением parent_id проверяет через _is_descendant(session, page_item.id, new_parent_id): не является ли новый родитель потомком перемещаемой папки. При цикле — raise ValueError("cycle").
- service.py → _is_descendant(session, ancestor_id, candidate_id) — новый метод. Обход вверх по parent_id с лимитом глубины 100. True если candidate — потомок ancestor (или сам ancestor).
- route.py → get_pages_list() — новый query-параметр is_folder, прокинут в сервис.
- route.py → update_page_item() — оборачивает вызов сервиса в try/except ValueError. При ValueError("cycle") → 400 с detail «Нельзя переместить папку внутрь себя или своей вложенной папки». При других ValueError → 400 с исходным текстом.

Фронт:
- base/modal/list.js — новая универсальная модалка BaseModalList. Один выбор из списка. Каждый item: {value, label, path, icon, disabled}. API как у BaseModalInput: open/close/setOnOk/setOnCancel/setOnResult/destroy. Click/Enter → onOk(value). Escape/✕/overlay/«Отмена» → onCancel(null).
- base/modal/list.css — стили в том же стиле, что message.js / input.js (CSS-переменные --font-size-*, .window, .title-bar, .content, .actions-bar).
- base/modal/index.js — case 'list' в фабрике createModal.
- base/cards/toolbar/toolbar.js — новая кнопка «Переместить» (класс .cards-toolbar-btn-move). Enabled только при selectedCount === 1 (как edit). Disabled в trash-режиме. Стоит МЕЖДУ edit и delete.
- base/cards/initool.js — флаг showMoveButton, колбэк onMove → cards._handleMoveSelected().
- base/cards/cards.js — onMoveSelected callback + _handleMoveSelected() делегат. Внутри проверяет, что selectedIds.size === 1.
- lib/pages/move.js — moveSelected(pages, id) + buildFolderOptions(pages, item) + fetchFlatList(pages) + collectDescendantIds(source, folderId) + slug(s) + openListModal + sendMove.
  - buildFolderOptions: «Корень» первым + плоский список папок с путями (/folder1/folder2). Источник — items текущего уровня; если на уровне есть хоть одна папка — дополнительно запрашивает GET /list?is_folder=1 (полное дерево nav).
  - collectDescendantIds: BFS по parent_id, защита от циклов в исходных данных (лимит 1000 итераций).
  - sendMove: PUT /item/{id} с {parent_id}. Возвращает {ok, error}. Вытаскивает detail из ответа бэка (строка или объект {code, message, action}), показывает человечное сообщение вместо абстрактного «Не удалось переместить».
- lib/pages/pages.js — делегат _moveSelected(id) → move.js. В props BaseCards добавлено showMoveButton: canEdit + onMoveSelected: (id) => this._moveSelected(id).

Итоговый порядок кнопок в LEFT-группе тулбара:
folder (opt) → add → copy (opt) → edit → move (opt) → delete → restore → extras → counter

Логика перемещения (согласовано):
- перемещаем и страницы, и папки;
- источник списка папок — из загруженных, если не хватает — GET /list?is_folder=1;
- список — плоский, с полными путями (/folder1/folder2), «Корень» первым;
- защита от циклов: на фронте — исключаем саму папку и её потомков из списка; на бэке — _is_descendant в update_item;
- sort_order не трогаем, карточка в новой папке остаётся со своим значением;
- никаких window.confirm и window.alert — только BaseModalConfirm и BaseModalMessage через lib/pages/utils.js.

8. Документация «Вежливый отказ» — CSS не доделан
HTML страницы написан в прошлой части сессии, CSS пока не вставлен. См. пункт 4 выше.

## Что в TODO

```markdown
## LLM / Router / Runs

- [ ] runs: не помечать disconnect-нутые run'ы как cancelled,
      если они уже done. Место: endpoint.py → _cancel_run_in_db.
- [ ] runs: добавить parent_run_id для связи «вопрос → ответ».
- [ ] runs: не создавать новый run на ответ, а продолжать
      существующий.

## create_page

- [ ] QA-промпт не поймал сломанный дизайн в 1 из 7 блоков.
      Место: agent/create_page.py, prompts/create_page.py.

## Шаблон документации

- [ ] CSS .doc-* из шаблона не применяется к контенту дочерних
      страниц (ни на публичном просмотре, ни в админке, ни в
      редакторе). Пока обходимся дублированием CSS.

## Дублирование и перемещение страниц — СДЕЛАНО

- [x] Кнопка «Копировать» в тулбаре.
- [x] Кнопка «Переместить» в тулбаре (enabled при selected === 1).
- [x] Модалка BaseModalList (base/modal/list.js + list.css).
- [x] case 'list' в base/modal/index.js.
- [x] service.py → duplicate_item + is_folder в get_list + _is_descendant + защита в update_item.
- [x] route.py → POST /item/{id}/duplicate, is_folder в /list, обработка ValueError("cycle") → 400.
- [x] lib/pages/utils.js — вынос утилит, confirm, message.
- [x] lib/pages/copy.js — copySelected, duplicateItemSilent.
- [x] lib/pages/move.js — moveSelected, buildFolderOptions, collectDescendantIds, sendMove с разбором detail.
- [x] lib/pages/pages.js — делегаты _copySelected / _moveSelected.
- [x] move.svg — иконка в base/images/.

9. Флажок «Публиковать» + вынос рендера карточек + скрытие шаблонов из публичного каталога — СДЕЛАНО
Проблема: нужно было дать пользователю управлять публичностью страницы прямо из формы редактирования. Существующее поле is_active уже подходило — новое поле в модели не требовалось. Также pages.js разросся, и нужно было вынести часть кода. Отдельно всплыла проблема: шаблоны (is_template=1) показывались в публичном каталоге /pages как обычные карточки — это неправильно.

Что сделано (полный стек):

Проверка данных:
- SQL по test/base/neurocad.db: `SELECT is_active, COUNT(*) FROM pages GROUP BY is_active` → результат `1|68`. То есть у всех существующих страниц is_active = 1, миграции данных не нужны, старый прод не сломается.

Модель и схема — НЕ менялись:
- page.py → is_active уже есть, default=1.
- schema.py → is_active: int = Field(1, ...) уже есть во всех нужных схемах (Base / Update / ListItem).
- service.py (admin) → get_list / list_for_user уже фильтруют по is_active.
- patchPayloadNormalization в utils.js уже превращает true/false → 1/0.

Фронт — pages.js:
- В массив fields добавлен чекбокс «Публиковать» (key: 'is_active', label: 'Публиковать', type: 'checkbox', default: 1). Стоит ПОСЛЕДНИМ — после parent_id. Логика: «Публиковать» — финальное решение перед сохранением.
- В initialData добавлено is_active: 1 — чтобы у новой страницы галка стояла по умолчанию.

Фронт — новый файл lib/pages/card.js:
- Из pages.js вынесены методы _renderArticleCard и _renderUpCard (чистый рендер, без состояния). Теперь это export function renderArticleCard(item) и export function renderUpCard().
- pages.js в _init() подгружает ./card.js через Promise.all, сохраняет в this._card, а в props BaseCards передаёт renderCard: (item) => this._card.renderArticleCard(item) и renderUpCard: () => this._card.renderUpCard().
- pages.js стал меньше на ~70 строк, логика рендера отделена от оркестратора.

Публичный каталог — public/service.py:
- get_list() — добавлен фильтр Page.is_template == 0 (в двух местах: основной запрос + подсчёт children_count). Шаблоны больше НЕ показываются в публичном каталоге /pages.
- Прямая публичная страница шаблона (/page/<date>/<time>) при этом работает как раньше — можно посмотреть «голый» шаблон.
- Фильтр Page.is_active == 1 в get_by_id / get_template_css намеренно НЕ убирался: если владелец снял галку с шаблона, дочерние страницы рендерятся БЕЗ него. Это осознанная фича («выключить оболочку — дети без оболочки»), а не баг.

Порядок кнопок и фильтров в тулбаре — не менялся. Копирование и перемещение из предыдущих шагов работают как были.

===

Давай начинаем делать create_page. Саммаризируй всю информацию по нему
Хорошо. Давай соберу всё, что мы знаем про create_page — из SUMMARY.md, PROJECT.md, из наших обсуждений.

Что такое create_page
Агент генерации страницы с нуля. Свободный HTML+CSS. Не из блоков, а «с чистого листа».

Единственный агент, который сейчас реально генерирует страницы. create (сборка из блоков) — отключён.

В AGENTS роутера — есть. Роутер его выбирает, когда пользователь хочет создать или изменить страницу.

Что он делает сейчас
Фазы (из PROJECT.md):

plan — план страницы.

section — генерация каждой секции.

review (QA) — проверка каждой секции. REVIEW_ENABLED = True.

aggregate — склейка всего.

Файл: agent/create_page.py.
Промпт: prompts/create_page.py.
Мёртвый код: _run_edit — edit-режим отключён, create_page всегда создаёт с нуля.

Что мы решили поменять — два блока
Блок А — диалог-бриф
Проблема: сейчас спрашивает мало. Роутер задаёт один вопрос — и create_page генерирует. Пользователь не может уточнить.

Хочется: серия вопросов до генерации. Пользователь отвечает — или говорит «вперёд» на любом шаге.

Как:

Жанр — первый вопрос. 6 жанров:

лендинг;

лонгрид / статья;

промо / приглашение;

личная страница / портфолио;

FAQ-страница;

меню / прайс / мини-каталог.

Дальше — вопросы под жанр.

Для лендинга: тематика → что продаёшь → кому → блоки → эффекты → тексты → пожелания.

Для лонгрида: тема → главная мысль → длина → стиль → подзаголовки → тексты.

И так далее.

«Вперёд» — на любом шаге. LLM сама распознаёт. Без жёстких триггеров. Формулировки: «вперёд», «хватит», «поехали», «не спрашивай больше», «на твоё усмотрение» — все работают.

Дефолты для пропущенных. Если пользователь сказал «вперёд» — оставшиеся вопросы заполняются разумными дефолтами.

Механизм:

Run.brief (JSON) — ответы пользователя. Обновляется при каждом ответе.

base.py — расширить интерфейс агента: агент может вернуть {"question": "..."} — тогда dispatch сохранит с is_quest = 1, поставит awaiting_answer, отправит пользователю.

dispatch.py → _run_agent — обрабатывать question от любого агента (сейчас — только от роутера).

UI — опционально кнопка «Вперёд, не спрашивай» (вторая итерация).

Что НЕ делаем в этой итерации:

Кнопку «Вперёд» в UI. Сначала — только текст.

Многостраничники. Только одна страница.

БД. Всё статичное.

Блок Б — QA
Проблема: QA не поймал, что блоки перекрывали друг друга. В тесте «для кофейни» 7 секций — одна сломана.

Почему: QA смотрит HTML отдельной секции. Не видит общей картины CSS. Если секция 3 использует position: absolute без родителя с position: relative — QA этого не замечает.

Как лечить — три варианта:

Усилить QA-промпт. Быстро. Добавить в промпт: «проверь, что нет position: absolute без родителя с position: relative, нет z-index без контекста, нет отрицательных margin, нет overflow: hidden, обрезающего контент».

Структурная проверка CSS. Детерминированно, надёжно. Перед склейкой — анализировать CSS всех секций на опасные паттерны. Если найдено — либо флагать, либо автофиксить.

Визуальный рендер через headless-браузер. Дорого, но реально ловит визуальные баги. Потом, если понадобится.

Мой совет — 1 + 2. Промпт усилить (быстро) + структурная проверка (надёжно). Визуальный рендер — потом.

Что мне нужно от тебя
Чтобы начать — 4 файла:

agent/create_page.py — целиком.

prompts/create_page.py — целиком.

agent/base.py — интерфейс агента.

websocket/dispatch.py — целиком (или кусок с _run_agent и _handle_route_question).

По коду я увижу:

как устроен run();

какие фазы, где QA;

где встроить «диалог-бриф»;

почему QA не ловит перекрытия;

как расширить base.py для question;

как dispatch.py сейчас обрабатывает question от роутера.

Что дальше — план
Шаг 1. Диагностика по коду. Я смотрю 4 файла, возвращаю таблицу: что есть / чего нет / где правки.

Шаг 2. Решаем — с чего начать:

Блок Б (QA) — точечная, исправление бага. Мой совет — сначала Б.

Блок А (диалог) — большая работа, новая архитектура.

Шаг 3. Идём по файлам. Каждый — полный код. Как договаривались.

Вопросы
С чего начинаем — Б (QA) или А (диалог)?

Мой совет — Б. Это баг.

Жанры — какие? Я предлагаю 6: лендинг, лонгрид, промо, личная страница, FAQ, меню / прайс. Согласен? Или добавить / убрать.

QA — какой подход?

1 (промпт) — быстро.

2 (структурная проверка) — надёжно.

1 + 2 — мой совет.

Присылаешь 4 файла? Или скажешь «начинаем с QA» — и я запрошу только create_page.py + prompts/create_page.py.

Скажи — что выбираешь.