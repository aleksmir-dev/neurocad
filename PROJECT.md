# PROJECT.md — справочник по проекту NeuroCad

> Онбординг для нового чата. Описывает **что есть в проекте**: структуру, сущности, файлы, ключевые решения. Для «что делали в последней сессии» — см. `SUMMARY.md`.

---

## Часть 1. Общая картина

**NeuroCad** — конструктор сайтов на базе искусственного интеллекта. Пользователь описывает словами, что хочет, — и ИИ собирает страницу: без кода, без вёрстки, без технических знаний. Пользователь получает адрес вида `твоё-имя.neurocad.ru` (бесплатно) или подключает свой домен (платно).

**Работает в продакшене.** Есть:
- `neurocad.ru` — публичный сайт продукта.
- `doc.neurocad.ru` — документация (страницы самого конструктора).
- `doc.neurocad-dev.ru` — dev-документация.
- dev-среда — на отдельном сервере, для разработки.

**Стек:**

| Слой | Технология |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy (async), SQLite, Alembic |
| Frontend | Vanilla JS (ES-модули, динамический импорт), HTML, CSS |
| Редактор | GrapesJS 0.21.13 (интегрирован кастомно) |
| LLM | Несколько провайдеров через фабрику (`utils/llm/factory.py`), есть mock-провайдер (`LLM_MOCK=1`) |
| Реалтайм | WebSocket для чата с LLM |
| Медиа | Локальные файлы в `media/<nav_id>/` |
| Аутентификация | JWT (cookie `access_token`) |

**Как запускается:**

- Dev / prod — через uvicorn (`app.main:app`).
- Тесты / миграции — из папки `test/`, скрипт `migrate.sh` для Alembic. Использует `.venvtest` и `base/neurocad.db`.
- `app/` — корень приложения (Python-пакеты).
- `neurocad/` — рабочий репозиторий.

**Принципы разработки (внутренние):**
- Идём **маленькими шажками**, каждый проверяем.
- Не ломаем прод. Dev-среда — отдельно.
- Документация = **как есть в проде**, а не как задумано.
- Код и комментарии — **на английском** (для GitHub).
- Строки для пользователя — **на русском**.
- Аудитория — **VibeCode**, не программисты. Объяснения — «на пальцах», с метафорами.

---

## Часть 2. Структура проекта

```
neurocad/
├── app/                              ← корень приложения (FastAPI-пакет)
│   ├── main.py                       ← точка входа uvicorn
│   ├── config.py                     ← settings (SECRET_KEY, APP_DOMAIN, LLM_*)
│   │
│   ├── core/                         ← ядро
│   │   ├── auth/                     ← авторизация
│   │   │   ├── login/                ← вход (route / schema / service)
│   │   │   ├── register/             ← регистрация
│   │   │   ├── restore/              ← восстановление пароля
│   │   │   ├── password/             ← смена пароля
│   │   │   ├── profile/              ← профиль пользователя
│   │   │   ├── impersonate/          ← вход от имени пользователя (супер-админ)
│   │   │   ├── middleware/           ← auth middleware
│   │   │   ├── dependencies.py       ← get_current_user для FastAPI
│   │   │   └── ...
│   │   │
│   │   ├── engine/                   ← конструктор страниц
│   │   │   ├── route.py              ← общий роутер engine
│   │   │   ├── renderer.js           ← рендер компонентов на клиенте
│   │   │   ├── binder.js             ← привязка событий
│   │   │   ├── modules.py            ← конфигурация модулей (JSON)
│   │   │   │
│   │   │   └── lib/                  ← библиотеки компонентов
│   │   │       ├── base/             ← базовый компонент Base (шапка, меню, чат)
│   │   │       │   ├── base.js       ← класс Base
│   │   │       │   ├── auth/         ← авторизация в UI (BaseAuth)
│   │   │       │   ├── cards/        ← базовые карточки (BaseCards)
│   │   │       │   ├── modal/        ← базовые модалки
│   │   │       │   ├── assets/       ← медиатека (BaseAssets)
│   │   │       │   └── ...
│   │   │       │
│   │   │       ├── word/             ← редактор страниц (Word) — главный компонент
│   │   │       │   ├── word.js       ← оркестратор: страница, тулбар, редактор
│   │   │       │   ├── view.js       ← рендер статьи (публичный просмотр)
│   │   │       │   ├── data.js       ← загрузка страницы (by id / by date)
│   │   │       │   ├── actions.js    ← действия (save, autosave, history, rollback)
│   │   │       │   ├── bridge.js     ← мост к GrapesJS-редактору
│   │   │       │   ├── utils.js      ← утилиты (дата, JSON)
│   │   │       │   ├── constants.py  ← MEDIA_URL, SPECIAL_NAMES
│   │   │       │   ├── service.py    ← бэкенд страницы (CoreEngineLibWordService)
│   │   │       │   ├── route.py      ← эндпоинты страницы
│   │   │       │   ├── css_builder.py ← сборка полного CSS страницы
│   │   │       │   ├── hint.js       ← подсказки (пустая статья)
│   │   │       │   │
│   │   │       │   ├── editor/       ← GrapesJS-редактор
│   │   │       │   │   ├── index.js  ← точка входа (loadEditor)
│   │   │       │   │   ├── editor.js ← класс Editor (оркестратор)
│   │   │       │   │   ├── widgets.js ← DOM-структура (3 панели, тулбар)
│   │   │       │   │   ├── styles.js ← секции StyleManager
│   │   │       │   │   ├── blocks/   ← библиотека блоков
│   │   │       │   │   ├── assets.js ← медиапикер
│   │   │       │   │   ├── brand.js  ← подстановка public_host
│   │   │       │   │   ├── autosave.js ← автосохранение
│   │   │       │   │   ├── session.js ← save / cancel / close
│   │   │       │   │   ├── template.js ← рендер базового шаблона
│   │   │       │   │   ├── toolbar.js ← тулбар редактора
│   │   │       │   │   ├── dataloader.js ← загрузка данных в GrapesJS
│   │   │       │   │   ├── modals.js ← HTML+CSS / element CSS
│   │   │       │   │   ├── history.js ← история версий
│   │   │       │   │   ├── resizer.js ← ресайз панелей
│   │   │       │   │   ├── io/       ← import / export
│   │   │       │   │   ├── grapes/   ← кастомная инициализация GrapesJS
│   │   │       │   │   │   ├── index.js  ← GrapesLoader
│   │   │       │   │   │   ├── config.js ← buildConfig
│   │   │       │   │   │   ├── link.js   ← link-тип и команда
│   │   │       │   │   │   ├── page-link.js ← page-link trait
│   │   │       │   │   │   ├── scope.js  ← scope-class на body
│   │   │       │   │   │   ├── empty.js  ← автоудаление пустых <p>
│   │   │       │   │   │   ├── undo.js   ← фильтр UndoManager
│   │   │       │   │   │   ├── traits.js ← body traits
│   │   │       │   │   │   └── ...
│   │   │       │   │   ├── css/      ← CSS редактора
│   │   │       │   │   │   ├── canvas.css    ← стили iframe
│   │   │       │   │   │   ├── content.css   ← системные классы контента
│   │   │       │   │   │   ├── layout.css    ← layout редактора
│   │   │       │   │   │   ├── toolbar.css   ← тулбар редактора
│   │   │       │   │   │   ├── styles.css    ← панель стилей
│   │   │       │   │   │   ├── assets.css    ← медиапикер
│   │   │       │   │   │   ├── theme.css     ← тема GrapesJS
│   │   │       │   │   │   └── ...
│   │   │       │   │   ├── effects/  ← эффекты (fx-*)
│   │   │       │   │   │   ├── registry.json ← реестр эффектов
│   │   │       │   │   │   ├── fx/*.css      ← CSS каждого эффекта
│   │   │       │   │   │   ├── create.js     ← создание эффекта
│   │   │       │   │   │   ├── edit.js       ← правка эффекта
│   │   │       │   │   │   └── live.js       ← live-превью
│   │   │       │   │   ├── blocks/   ← блоки страницы
│   │   │       │   │   │   ├── manifest.json ← реестр блоков
│   │   │       │   │   │   ├── blocks.css    ← UI блоков
│   │   │       │   │   │   ├── elements.js   ← элементы (h1, p, кнопка)
│   │   │       │   │   │   ├── ready.js      ← готовые секции (hero, features)
│   │   │       │   │   │   ├── layout.js     ← разметка (grid, flex)
│   │   │       │   │   │   └── ...
│   │   │       │   │   ├── images/   ← медиатека логотипов
│   │   │       │   │   └── ...
│   │   │       │   │
│   │   │       │   ├── llm/          ← LLM-слой (чат, агенты, роутер)
│   │   │       │   │   ├── ws.py     ← тонкий реэкспорт WS-endpoint
│   │   │       │   │   ├── route.py  ← HTTP-эндпоинты LLM
│   │   │       │   │   ├── service.py ← БД: пресеты, история чата
│   │   │       │   │   ├── runs.py   ← БД: Run (запуски LLM)
│   │   │       │   │   ├── schema.py ← Pydantic-схемы LLM
│   │   │       │   │   ├── step.py   ← фасад multi-step
│   │   │       │   │   ├── parser.py ← парсер ответов LLM
│   │   │       │   │   ├── dumper.py ← дамп промптов и ответов
│   │   │       │   │   ├── mock.py   ← mock-провайдер
│   │   │       │   │   ├── utils.py  ← split/merge html+css
│   │   │       │   │   │
│   │   │       │   │   ├── agent/    ← агенты
│   │   │       │   │   │   ├── base.py           ← базовый класс
│   │   │       │   │   │   ├── router.py         ← роутер («Администратор»)
│   │   │       │   │   │   ├── none.py           ← «Вежливый отказ»
│   │   │       │   │   │   ├── help.py           ← помощь
│   │   │       │   │   │   ├── create.py         ← сборка из блоков
│   │   │       │   │   │   ├── create_page.py    ← генерация с нуля
│   │   │       │   │   │   ├── fill.py           ← заполнение элемента
│   │   │       │   │   │   ├── effect.py         ← эффекты
│   │   │       │   │   │   ├── edit.py           ← правка CSS эффекта
│   │   │       │   │   │   ├── rename.py         ← переименование эффекта
│   │   │       │   │   │   ├── create_effect.py  ← создание эффекта
│   │   │       │   │   │   ├── generate_logo.py  ← логотип
│   │   │       │   │   │   └── generate_legal.py ← политика / правила
│   │   │       │   │   │
│   │   │       │   │   ├── prompts/  ← промпты агентов
│   │   │       │   │   │   ├── plan.py
│   │   │       │   │   │   ├── fill.py
│   │   │       │   │   │   ├── effects.py
│   │   │       │   │   │   ├── create_page.py
│   │   │       │   │   │   ├── create_effect.py
│   │   │       │   │   │   ├── edit_effect.py
│   │   │       │   │   │   ├── rename_effect.py
│   │   │       │   │   │   ├── logo.py
│   │   │       │   │   │   ├── svg.py
│   │   │       │   │   │   ├── generate_legal.py
│   │   │       │   │   │   └── legacy.py
│   │   │       │   │   │
│   │   │       │   │   ├── steps/    ← шаги multi-step
│   │   │       │   │   │   ├── common.py
│   │   │       │   │   │   ├── plan.py
│   │   │       │   │   │   ├── fill.py
│   │   │       │   │   │   ├── effects.py
│   │   │       │   │   │   └── svg.py
│   │   │       │   │   │
│   │   │       │   │   ├── websocket/ ← WS-слой
│   │   │       │   │   │   ├── base.py     ← CoreEngineLibWordLlmWS (mixins)
│   │   │       │   │   │   ├── endpoint.py ← главный WS-цикл
│   │   │       │   │   │   ├── dispatch.py ← _run_agent и три других
│   │   │       │   │   │   ├── provider.py ← выбор провайдера
│   │   │       │   │   │   ├── cancel.py   ← cancel events, safe_send
│   │   │       │   │   │   ├── history.py  ← _load_history, _load_current_page_html
│   │   │       │   │   │   ├── auth.py     ← _authenticate_ws, _log
│   │   │       │   │   │   └── agents.py   ← _AGENTS registry
│   │   │       │   │   │
│   │   │       │   │   └── chat/     ← фронтенд чата
│   │   │       │   │       ├── ws.js       ← WS-транспорт
│   │   │       │   │       ├── ui.js       ← DOM чата
│   │   │       │   │       ├── api.js      ← HTTP: history, active run
│   │   │       │   │       ├── handler.js  ← обработка WS-сообщений
│   │   │       │   │       ├── edit.js     ← EditSession (правка эффекта)
│   │   │       │   │       ├── create.js   ← CreateSession (создание эффекта)
│   │   │       │   │       └── ...
│   │   │       │   │
│   │   │       │   └── ...
│   │   │       │
│   │   │       ├── pages/            ← каталог статей (Pages)
│   │   │       │   ├── pages.js      ← класс Pages (оркестратор)
│   │   │       │   ├── utils.js      ← утилиты: apiUrl, canEdit, confirm, message
│   │   │       │   ├── copy.js       ← копирование: copySelected, duplicateItemSilent
│   │   │       │   ├── move.js       ← перемещение: moveSelected, buildFolderOptions
│   │   │       │   ├── title.js      ← заголовок каталога
│   │   │       │   ├── logo.js       ← генератор логотипов (кнопка)
│   │   │       │   ├── hint.js       ← подсказки
│   │   │       │   ├── public/       ← публичный каталог
│   │   │       │   ├── service.py    ← CoreEngineLibPagesService
│   │   │       │   ├── route.py      ← эндпоинты
│   │   │       │   └── schema.py     ← Pydantic-схемы
│   │   │       │
│   │   │       ├── balance/          ← баланс (тарифы, лимиты)
│   │   │       ├── nav/              ← навигация (шапка каталога)
│   │   │       ├── module/           ← модули
│   │   │       ├── setup/            ← настройка (llm)
│   │   │       ├── table/            ← таблицы
│   │   │       └── ...
│   │   │
│   │   └── models/                   ← модели SQLAlchemy
│   │       ├── base.py               ← реэкспорт всех моделей
│   │       ├── page.py               ← Page (+ PageHist, PageChat)
│   │       ├── nav.py                ← Nav
│   │       ├── user.py               ← User
│   │       ├── auth.py               ← Auth
│   │       ├── balance.py            ← Balance
│   │       ├── run.py                ← Run
│   │       ├── module.py             ← Module
│   │       ├── access.py             ← Access
│   │       ├── domain.py             ← Domain
│   │       ├── page_pres.py          ← PagePres
│   │       ├── page_chat.py          ← PageChat
│   │       ├── page_hist.py          ← PageHist
│   │       └── ...
│   │
│   ├── utils/                        ← утилиты
│   │   ├── sqlite.py                 ← get_db_sqlite
│   │   ├── css.py                    ← css_hash, ensure_css_file
│   │   ├── llm/                      ← фабрика LLM-провайдеров
│   │   │   ├── factory.py            ← get_provider
│   │   │   └── ...
│   │   └── ...
│   │
│   ├── static/                       ← статика
│   │   ├── core/engine/...
│   │   └── ...
│   │
│   ├── media/                        ← медиа пользователей
│   │   └── <nav_id>/                 ← медиа конкретного nav
│   │
│   ├── log/                          ← логи
│   │   └── llm-prompts/              ← дампы промптов LLM
│   │       └── run-<id>/             ← по одному run на папку
│   │
│   ├── test/                         ← тесты и миграции
│   │   ├── base/neurocad.db          ← БД тестовой среды
│   │   ├── .venvtest/                ← venv тестовой среды
│   │   ├── migrate.sh                ← обёртка Alembic
│   │   └── ...
│   │
│   └── alembic.ini                   ← конфиг Alembic
│
└── ...
```

---

## Часть 3. Ключевые сущности (модели)

### `Page` (`core/models/page.py`)

Страница или папка. Центральная сущность конструктора.

**Поля:**
- `id` — PK.
- `nav_id` — FK на Nav. Каталог, которому принадлежит страница.
- `card_type` — `"page"` или `"folder"`. Папка — группирующий узел, у неё нет `content`.
- `parent_id` — FK на саму Page. Папка, в которой лежит страница. `NULL` = корень.
- `sort_order` — ручная сортировка внутри папки.
- `datetime` — дата и время публикации. У папок `NULL`. Публичный URL строится из неё.
- `title` — заголовок.
- `description` — краткое описание.
- `logo` — URL логотипа.
- `content` — HTML для отображения.
- `content_json` — GrapesJS JSON для редактора.
- `css` — CSS страницы (источник правды). При рендере выгружается в `static/pages/<id>.css`, в HTML идёт `<link>` с `?v=<hash>`.
- `url` — внешняя ссылка. Если задана, карточка в каталоге ведёт на неё, а не на внутреннюю страницу.
- `is_template` — 0/1. Может ли быть базовым шаблоном.
- `template_id` — FK на Page. Если задан — эта страница наследует layout от шаблона, её `content` вставляется в `[data-slot="content"]`.
- `is_active`, `is_delete` — флаги.
- `created_at`, `updated_at`.
- `rss_yandex_id` — для RSS.

### `PageChat` (`core/models/page_chat.py`)

История чата с LLM по странице. Одна строка = одно сообщение.

**Поля:**
- `id`, `page_id` (FK).
- `role` — `"user"` / `"assistant"` / `"system"`.
- `content` — текст сообщения. **Всегда чистый** — без технических маркеров.
- `is_quest` — 0/1. Флаг: это **уточняющий вопрос администратора**. Нужен, чтобы роутер понял: следующее сообщение пользователя — это ответ на уточнение или новый запрос.
- `model`, `prompt_tokens`, `completion_tokens` — метаданные.
- `created_at`.

### `PageHist` (`core/models/page_hist.py`)

Снапшот страницы (история изменений).

**Поля:**
- `id`, `page_id` (FK).
- `html`, `content_json`, `css` — полный слепок.
- `action` — `"user_edit"` / `"rollback"`.
- `note` — комментарий (например, username).
- `created_at`.

### `Run` (`core/models/run.py`)

Одна запись = один запуск LLM-флоу (роутер → агент).

**Поля:**
- `id`, `page_id`, `user_id`.
- `status` — `pending` / `planning` / `awaiting_answer` / `filling` / `effects` / `done` / `cancelled` / `failed`.
- `step` — номер шага.
- `user_message` — исходный запрос.
- `message` — текущее сообщение (для UI).
- `error` — если упал.
- `block_catalog`, `plan`, `filled`, `effects` — JSON-снапшоты шагов.
- `final_html` — итоговый HTML.
- `created_at`, `updated_at`.

### `Nav` (`core/models/nav.py`)

Экземпляр сайта пользователя. У каждого пользователя может быть несколько nav.

**Поля:** `id`, `user_id` (FK), `name`, `is_delete`, `created_at`, `updated_at`.

### `Balance` (`core/models/balance.py`)

Баланс пользователя.

**Поля:** `id`, `user_id`, `tarif` (0=free, 1=pro, 2=llm), `tokens` (остаток LLM-токенов), `gen` (остаток генераций страниц), `limit_pages`, `is_delete`, `updated_at`.

---

## Часть 4. Ключевые файлы — краткое описание

### Frontend — Word

**`word/word.js`** — оркестратор виджета страницы. Хранит состояние (`pageData`, `pageId`, `navId`), делегирует в `data / view / actions / bridge`. `_loadCSS()` подгружает CSS редактора, эффектов и блоков.

**`word/view.js`** — рендер статьи.
- `render(word)` — общая вёрстка (тулбар + контент).
- `buildArticle(word)` — статья. **Важно:** порядок CSS — сначала `templateCss` (шаблон), потом `pageCss` (страница), потом HTML. Порядок важен: страница переопределяет шаблон.
- `applyTemplate(templateHtml, contentHtml)` — вставляет контент в `[data-slot="content"]`.

**`word/data.js`** — загрузка страницы.
- `loadByParams(word)` — по URL-параметрам (`nav_id`, `date`, `time`).
- `loadById(word)` — по `pageId`.
- `loadTemplateById(word, id)` — базовый шаблон.

**`word/actions.js`** — действия.
- `setHeaderTitle`, `goBack`, `openPublicPage`.
- `saveContent` / `autoSaveContent` — `_persistContent` пишет `content`, `content_json`, `css`.
- `listHistory` / `getHistoryItem` / `rollback`.

**`word/bridge.js`** — мост к GrapesJS.
- `openEditor(word)` — загружает базовый шаблон, инжектит `templateCss` в `<head>` родительского документа, создаёт `Editor`.
- `closeEditor(word)` — уничтожает редактор, восстанавливает статью.
- Race-protection через `word._editorToken`.

**`word/service.py`** (`CoreEngineLibWordService`) — бэкенд.
- `get_by_datetime`, `get_by_id` — чтение.
- `save_content` — **главный метод**. При сохранении: extract медиа (data-URI → файлы), snapshot в `PageHist`, пересборка полного CSS через `css_builder.build_full_page_css`, запись в `Page` и в `static/pages/<id>.css`.
- `list_history` / `get_history_item` / `rollback` / `delete_history_item` / `clear_history`.
- `list_assets` / `upload_assets` — медиа.

**`word/route.py`** — FastAPI-эндпоинты страницы.

**`word/css_builder.py`** — сборка полного CSS страницы: `content.css` + используемые `blocks/*.css` + используемые `fx/*.css` + кастом. **Без парсинга CSS** — по наличию классов в HTML.

### Frontend — Editor (GrapesJS)

**`editor/editor.js`** (`Editor`) — оркестратор. Подгружает все модули параллельно. Создаёт `GrapesLoader`, инициализирует GrapesJS, регистрирует блоки, чат, пресеты, автосейв, тулбар.

**`editor/dataloader.js`** (`DataLoader`) — загрузка данных в GrapesJS.
- `loadInitial()` — предпочтительно `loadProjectData(proj)` (JSON). Fallback — `setComponents(html)` + `setStyle(css)`.
- `_reapplyPostLoad()` — переустановка scope-класса на body и body traits.
- `applyRollback(data)` — после rollback.

**`editor/grapes/index.js`** (`GrapesLoader`) — загрузка GrapesJS, инициализация.
- `canvasCss` — массив CSS для iframe (canvas.css, content.css, эффекты, блоки).
- `_loadEffects(version)` — берёт список эффектов из `GET /editor/effects`.
- `_bindAutoId(instance)` — каждому `<section>` даёт уникальный `id="i-XXXXXX"`, чтобы StyleManager редактировал одну секцию, а не все.
- `_bindAssetPicker(instance)` — заменяет встроенный Asset Manager на `BaseAssets`.

**`editor/grapes/config.js`** — `buildConfig`. `assetManager.custom = true`, `selectorManager.componentFirst = true`, `canvas.styles = canvasStyles`.

### Frontend — LLM Chat

**`llm/chat.js`** (`LLMChat`) — оркестратор чата. Загружает подмодули (`ws`, `ui`, `api`, `handler`, `edit`, `create`). Подписывается на события редактора, обрабатывает `_onSend`, `_onCancel`, `_applyHtml`, `_applyPageCss`.

**`llm/chat/handler.js`** — обработчик WS-сообщений. Разбирает `html_update`, `page_css_update`, `page_step`, `element_update`, `css_update`, `effect_draft`, `assistant_message`, `done`.

**`llm/chat/ws.js`** — WS-транспорт с реконнектом. `_pendingStart` буферизует стартовый запрос, пока WS не открыт.

### Backend — LLM

**`llm/agent/router.py`** (`CoreEngineLibWordLlmRouter`) — **роутер** («Администратор»).
- `AGENTS` — словарь разрешённых агентов (пока только `create_page`, `help`, `none`).
- `SYSTEM_PROMPT_ASK` — задать уточняющий вопрос.
- `SYSTEM_PROMPT_PICK` — выбрать агента (после ответа пользователя).
- `route(provider, user_message, selection, current_html, history, run_id, emit)` — **главный метод**. Возвращает `{"agent": ..., "question": ...}`. Либо агент, либо вопрос (не оба).
- `_extract_dialog(history)` — вытаскивает диалог уточнений с последнего `is_quest=0`.
- `_is_last_assistant_question(history)` — `True`, если последнее сообщение ассистента — уточнение.
- `new_request: true` в pick-промпте — пользователь сменил тему, роутер заново спрашивает.

**`llm/agent/base.py`** — базовый класс агента. Интерфейс `run(...) -> {message, html, selector, element_html}`.

**`llm/agent/none.py`** — «Вежливый отказ». Мгновенный ответ, без вызова LLM. Единственный агент, который не тратит токены (но роутер перед ним — тратит).

**`llm/agent/create_page.py`** — генерация страницы с нуля.
- Фазы: plan → section → review (QA) → aggregate.
- `_run_edit` — **мёртвый код** (edit-режим отключён, create_page всегда создаёт с нуля).
- `REVIEW_ENABLED = True` — QA-проход после каждой секции.

**`llm/agent/create.py`** — сборка из готовых блоков. Multi-step: `step_plan` → `step_fill` → `step_effects` → `step_svg_illustrations`. В `AGENTS` роутера **не включён**.

**`llm/agent/fill.py`** — заполнение выделенного элемента. В `AGENTS` **не включён**.

**`llm/agent/effect.py`** — эффекты + image mode (SVG-иллюстрации). В `AGENTS` **не включён**.

**`llm/agent/edit.py`** — правка CSS существующего эффекта. Только через `effect_edit` WS-тип. В `AGENTS` **не включён**.

**`llm/agent/rename.py`** — переименование эффекта. Только через `effect_rename`. В `AGENTS` **не включён**.

**`llm/agent/create_effect.py`** — черновик нового эффекта. Только через `create_effect`. В `AGENTS` **не включён**.

**`llm/agent/generate_logo.py`** / **`generate_legal.py`** — вызываются напрямую через HTTP (не через WS). В `AGENTS` **не включены**.

### Backend — LLM WebSocket

**`llm/websocket/base.py`** — `CoreEngineLibWordLlmWS`, собран из миксинов.

**`llm/websocket/endpoint.py`** (`EndpointMixin`) — WS-цикл. Типы сообщений: `start`, `effect_edit`, `effect_rename`, `create_effect`, `cancel`, `ping`.

**`llm/websocket/dispatch.py`** (`DispatchMixin`) — четыре метода запуска:
- `_run_agent` — **главный**. Роутер → агент.
- `_run_effect_edit` / `_run_effect_rename` / `_run_create_effect` — прямые, без роутера.
- `_handle_route_question` — новый метод: сохранить вопрос с `is_quest=1`, поставить run в `awaiting_answer`, отправить пользователю, выйти.

**`llm/websocket/history.py`** (`HistoryMixin`) — `_load_history` (возвращает `is_quest`), `_load_current_page_html`.

**`llm/websocket/agents.py`** — `_AGENTS` — имя → класс.

### Backend — LLM сервис

**`llm/service.py`** (`CoreEngineLibWordLlmService`) — БД: пресеты (`PagePres`), история чата (`PageChat`). `save_chat_message` принимает `is_quest`, `load_chat_history` возвращает.

**`llm/runs.py`** (`CoreEngineLibWordLlmRuns`) — БД: `Run`. `get_active_run_for_page` — активные статусы: `pending`, `planning`, `awaiting_answer`, `filling`, `effects`.

**`llm/dumper.py`** — дамп промптов и ответов в `log/llm-prompts/run-<id>/`.

### Frontend — Pages (каталог)

**`pages/pages.js`** (`Pages`) — каталог. Обёртка над `BaseCards`. Folder-режим включён. **Оркестратор**: тяжёлая логика вынесена в `utils.js`, `copy.js`, `move.js`.
- `_renderArticleCard(item)` — рендер карточки (папка / страница).
- `_renderUpCard()` — «..» на уровень выше.
- `_openArticle(id)` — открыть страницу (внешняя ссылка или редактор).
- `_loadFromServer()` — список из `/pages/list`, с `parent_id`.
- `_loadTemplates()` — список шаблонов (`is_template=1`).
- `_copySelected(ids)` — делегат в `copy.js` → `copySelected(this, ids)`.
- `_moveSelected(id)` — делегат в `move.js` → `moveSelected(this, id)`.
- `_apiUrl(endpoint, extraQuery)` — делегат в `utils.js` → `apiUrl(this, endpoint, extraQuery)`.
- `_reload()` — перезагрузить текущий уровень.
- В `props` BaseCards передаёт: `showCopyButton: canEdit`, `onCopySelected: (ids) => this._copySelected(ids)`, `showMoveButton: canEdit`, `onMoveSelected: (id) => this._moveSelected(id)`.

**`pages/utils.js`** — общие утилиты Pages. Экспортирует:
- `apiUrl(pages, endpoint, extraQuery)` — сборка URL с `nav_id`.
- `canEdit()` / `isSuperadmin()` — права.
- `formatDate(iso)` / `formatTime(iso)` — форматирование даты/времени для URL.
- `nextArticleNumber(items)` — следующий номер статьи.
- `patchPayloadNormalization(pages)` — обёртка над `cards._addItem` / `_updateItem`.
- `confirm(text, title, okText, cancelText)` — обёртка над BaseModalConfirm, резолвит boolean.
- `message(text, title)` — обёртка над BaseModalMessage. Никаких `window.alert`.

**`pages/copy.js`** — копирование. Экспортирует:
- `copySelected(pages, ids)` — публичная функция. Один confirm на всю пачку, для каждого id — `POST /item/{id}/duplicate`. Если ни один не скопировался — одна модалка с ошибкой.
- `duplicateItemSilent(pages, id)` — тихое копирование одного item (без confirm и alert).

**`pages/move.js`** — перемещение. Экспортирует:
- `moveSelected(pages, id)` — публичная функция. Находит item, строит список папок, открывает BaseModalList, шлёт PUT, перезагружает.
- Внутренние:
  - `buildFolderOptions(pages, item)` — плоский список папок с путями. «Корень» первым. Исключает саму папку и её потомков. Источник — items текущего уровня; если там есть хоть одна папка — дополнительно запрашивает `GET /list?is_folder=1`.
  - `fetchFlatList(pages)` — GET `/list?is_folder=1` (все папки nav, плоский список).
  - `collectDescendantIds(source, folderId)` — BFS по parent_id, лимит 1000 итераций.
  - `slug(s)` — превращение title в сегмент пути (`/folder1/folder2`).
  - `openListModal(pages, item, options)` — через `createModal('list')`.
  - `sendMove(pages, id, parentId)` — PUT `/item/{id}` с `{parent_id}`. Возвращает `{ok, error}`. Вытаскивает `detail` из ответа бэка (строка или объект `{code, message, action}`).

**`pages/service.py`** (`CoreEngineLibPagesService`) — бэкенд каталога.
- `get_list` — с фильтром по `parent_id`, подсчётом `children_count`, **фильтром `is_folder`** (1 — только папки, 0 — только страницы). Сортировка: папки первыми, потом по `sort_order` / `datetime DESC`.
- `create_item` — с проверкой лимита страниц через `BalanceChecked.page_allowed`. Папки не считаются.
- `duplicate_item` — копирование. Копирует все поля, сбрасывает id/datetime/rss_yandex_id/is_delete. Заголовок: «<оригинал> (копия)». Защита от коллизии datetime. Не копирует PageHist и PageChat.
- `update_item` — с `noneable_fields = {template_id, url, parent_id}`. **Защита от циклов**: если меняется `parent_id` у папки — через `_is_descendant` проверяет, не является ли новый родитель её потомком. При цикле — `raise ValueError("cycle")`.
- `_is_descendant(session, ancestor_id, candidate_id)` — обход вверх по parent_id с лимитом глубины 100. True, если `candidate` — потомок `ancestor` (или сам `ancestor`).
- `delete_item` — soft-delete. Для папки — «отвязывает» детей (переносит их на уровень выше).
- `restore_item`.
- `list_for_user` — для выбора ссылки в редакторе.

**`pages/route.py`** — эндпоинты.
- `GET /list` — есть `is_folder` в query, прокинут в сервис.
- `POST /item/{id}/duplicate` — есть.
- `PUT /item/{item_id}` — обёрнут `try/except ValueError`. При `ValueError("cycle")` → **400** с detail «Нельзя переместить папку внутрь себя или своей вложенной папки». При других ValueError → 400 с исходным текстом.

**`pages/schema.py`** — Pydantic-схемы. `CARD_TYPE_PAGE`, `CARD_TYPE_FOLDER`. `parent_id` в `CoreEngineLibPagesItemUpdate` уже есть как `Optional[int]`.

### Frontend — Base

**`base/base.js`** (`Base`) — базовый компонент страницы. Шапка, меню, чат, caption.

**`base/cards/cards.js`** (`BaseCards`) — карточки.
- Folder-режим (`folders: true`).
- `extraToolbarButtons` — доп. кнопки тулбара (`<a href>`). Не поддерживают action-кнопки (только ссылки).
- `_handleActivate(id, e)` — левый клик.
- `_handleSelect(id, e)` — правый клик / долгое нажатие → выделение.
- `openCreateForm` / `openEditForm`.
- `_handleCopySelected(ids)` — делегат в `onCopySelected`.
- `_handleMoveSelected()` — делегат в `onMoveSelected(id)`. Проверяет, что `selectedIds.size === 1`.

**`base/cards/render.js`** — рендер карточек. `buildItemsWithFolders` — «..» + папки + остальное.

**`base/cards/api.js`** — CRUD-запросы.

**`base/cards/initool.js`** — инициализация тулбара.
- Флаги: `showAddButton`, `showEditButton`, `showDeleteButton`, `showRestoreButton`, `showTrashButton`, `showSearch`, `showStatusFilter`, `showCopyButton`, `showMoveButton`, `showFolderButton`. Все — fail-closed (`=== true`).
- Колбэки: `onAdd`, `onAddFolder`, `onEdit`, `onDelete`, `onRestore`, `onCopy`, `onMove`, `onToggleTrash`, `onSearch`, `onStatusFilter`, `onSelectAll`.

**`base/cards/toolbar/toolbar.js`** — рендер кнопок тулбара.
- **Порядок кнопок в LEFT-группе**: `folder (opt) → add → copy (opt) → edit → move (opt) → delete → restore → extras → counter`.
- Кнопка **Copy** (`.cards-toolbar-btn-copy`) — enabled при `selectedCount >= 1`, disabled в trash-режиме.
- Кнопка **Move** (`.cards-toolbar-btn-move`) — enabled только при `selectedCount === 1` (как edit), disabled в trash-режиме. Стоит МЕЖДУ edit и delete.
- Кнопка **Restore** (`.cards-toolbar-btn-restore`) — видна только в trash-режиме.

### Frontend — Base / Modal

**`base/modal/index.js`** — фабрика `createModal(type, props)` через динамический `import()`. Типы: `message`, `confirm`, `input`, `textarea`, `textareatwo`, `date`, `interval`, `image`, **`list`**.

**`base/modal/list.js`** — `BaseModalList`. Универсальная модалка одиночного выбора из списка.
- API как у `BaseModalInput`: `open(text, title, items, opts)`, `close()`, `setOnOk(cb)`, `setOnCancel(cb)`, `setOnResult(cb)`, `destroy()`.
- `items` — массив `{value, label, path, icon, disabled}`. Только `value` обязателен.
- Click на item → `onOk(value)` + close. Enter → то же. Escape / overlay / ✕ / «Отмена» → `onCancel(null)` + close.
- Namespace CSS: `.core-engine-lib-base-modal-list`.

**`base/modal/list.css`** — стили. В том же стиле, что `message.js` / `input.js`: CSS-переменные `--font-size-*`, `.window`, `.title-bar`, `.content`, `.actions-bar`.

### Backend — Pages (public)

**`pages/public/route.py`** — публичный роут `/page/<date>/<time>`. Host-based.

**`pages/public/service.py`** — `PAGES_CSS_DIR`, `PAGES_CSS_URL`.

---

## Часть 5. Схема взаимодействия

### Поток обработки запроса в чате

```
Пользователь пишет в чат
   │
   ▼
WebSocket: {type: "start", message, block_catalog, selection}
   │
   ▼
endpoint.py: создаёт Run, запускает _run_agent в asyncio task
   │
   ▼
_run_agent: 
   │  1. balance guard
   │  2. получить provider
   │  3. загрузить current_html
   │  4. РОУТЕР:
   │       route(provider, user_message, ...) → {agent, question}
   │
   ├── если question → _handle_route_question:
   │       - сохранить вопрос с is_quest=1
   │       - run.status = awaiting_answer
   │       - отправить пользователю assistant_message
   │       - done
   │
   └── если agent → запустить агента:
           - agent.run(...) → {message, html, selector, element_html}
           - charge tokens
           - set_run_final
           - отправить html_update / page_css_update / element_update / assistant_message
           - done
```

**Если пользователь ответил на вопрос:**
```
Пользователь: "готовая"
   │
   ▼
WS: {type: "start", message: "готовая"}
   │
   ▼
_run_agent → роутер
   │
   ├── _is_last_assistant_question(history) == True
   │       (потому что последнее сообщение ассистента — is_quest=1)
   │
   └── pick-промпт → {"agent": "create_page", "new_request": false}
           → запуск агента
```

### Поток сохранения страницы

```
Редактор: onSave → actions.saveContent → _persistContent
   │
   ▼
PUT /core/engine/lib/word/{page_id}?nav_id=<id>
   body: {content, content_json, css}
   │
   ▼
service.save_content:
   │  1. extract_from_html / extract_from_json (медиа из data-URI)
   │  2. snapshot текущего состояния в PageHist
   │  3. build_full_page_css(content, custom_css)
   │       → content.css + используемые blocks + используемые fx + custom
   │  4. записать content / content_json / css в Page
   │  5. записать CSS в static/pages/<id>.css
```

### Поток открытия редактора

```
Пользователь жмёт "Редактировать"
   │
   ▼
word._openEditor → bridge.openEditor(word)
   │
   ├── token++ (race protection)
   ├── loadTemplateById(word, template_id) → templateHtml, templateCss
   ├── _injectEditorTemplateCss(templateCss) — в родительский <head>
   ├── dynamic import Editor
   ├── new Editor(container, {html, project, pageData, templateHtml, templateCss, onSave, onAutoSave, onCancel})
   │       │
   │       ▼
   │   Editor._init():
   │       - динамически загружает все модули
   │       - WidgetsBuilder.build() — три панели
   │       - TemplateManager.render() — шаблон в .editor-template
   │       - GrapesLoader.load() + init() — GrapesJS
   │       - BlocksRegistry, AssetsManager, LLMChat, LLMPresets, Importer, Exporter
   │       - DataLoader.loadInitial() — данные в GrapesJS
   │       - Autosave, Session, ToolbarManager
   │
   └── await editor.waitForInit()
```

### Поток публичного просмотра

```
Открыть /page/<date>/<time>
   │
   ▼
word.js → data.loadByParams → GET /core/engine/lib/word/bydatetime/...
   │
   ▼
view.buildArticle(word):
   │  1. raw = pageData.content
   │  2. если template_id — loadTemplateById → applyTemplate(template.content, raw)
   │  3. вставить templateCss в <style data-js="word-template-css">
   │  4. вставить pageCss как <link> (или <style> в legacy)
   │  5. обернуть в .core-engine-lib-word-blocks
   │  6. article.appendChild(contentEl)
```

### Поток копирования страницы

```
Пользователь выделил 1+ карточек (правый клик / долгое нажатие)
   │
   ▼
Кнопка «Копировать» в тулбаре → onCopy
   │
   ▼
BaseCards._handleCopySelected(ids) → onCopySelected(ids)
   │
   ▼
Pages._copySelected(ids) → copy.js → copySelected(pages, ids)
   │
   ├── 1. Определить первую карточку (для текста confirm):
   │      1 item  → «Скопировать <папку|статью> «<title>»?»
   │      N items → «Скопировать N элементов?»
   │
   ├── 2. utils.confirm(...) → BaseModalConfirm
   │      Отмена → выходим, выделение сохраняется
   │
   ├── 3. Для каждого id → duplicateItemSilent(pages, id)
   │      POST /core/engine/lib/pages/item/<id>/duplicate
   │      (без per-item confirm — пользователь уже подтвердил всю пачку)
   │
   ├── 4. ok > 0 → очистить выделение, syncToolbar, pages._reload()
   │
   └── 5. ok === 0 → utils.message('Не удалось скопировать', 'Ошибка')
```

### Поток перемещения страницы

```
Пользователь выделил РОВНО 1 карточку
   │
   ▼
Кнопка «Переместить» в тулбаре → onMove
   │
   ▼
BaseCards._handleMoveSelected() → onMoveSelected(id)
   │  (проверка: selectedIds.size === 1)
   │
   ▼
Pages._moveSelected(id) → move.js → moveSelected(pages, id)
   │
   ├── 1. Найти item в текущем списке
   │
   ├── 2. buildFolderOptions(pages, item):
   │      - «Корень» первым
   │      - если на текущем уровне есть хоть одна папка:
   │          GET /list?is_folder=1 (все папки nav, плоский список)
   │      - иначе — только items текущего уровня
   │      - исключить саму папку + её потомков (collectDescendantIds)
   │      - построить пути /folder1/folder2 (slug из title)
   │      - сортировка по path (Корень остаётся первым)
   │
   ├── 3. openListModal(pages, item, options):
   │      createModal('list') → BaseModalList.open(text, 'Перемещение', options)
   │      - Click/Enter → resolve(value)
   │      - Escape/✕/overlay/«Отмена» → resolve(undefined)
   │
   ├── 4. sendMove(pages, item.id, picked):
   │      PUT /core/engine/lib/pages/item/<id>
   │      body: { parent_id: <id> | null }
   │      Возвращает { ok, error }.
   │      При ошибке — вытаскивает detail из ответа:
   │        - строка → как есть
   │        - объект { code, message, action } → message
   │        - нет detail → «Не удалось переместить»
   │
   ├── 5. ok = false → utils.message(error, 'Ошибка')
   │
   └── 6. ok = true → очистить выделение, syncToolbar, pages._reload()
```

### Защита от циклов при перемещении

```
Клиент (move.js → buildFolderOptions):
   - если перемещаем папку A → из списка исключаем A и всех её потомков.
   - потомки считаются по parent_id через collectDescendantIds.

Сервер (service.py → update_item):
   - если меняется parent_id у папки на не-null:
       _is_descendant(session, page_item.id, new_parent_id)
       → если True → raise ValueError("cycle")
   - route.py ловит ValueError и возвращает 400:
       { "detail": "Нельзя переместить папку внутрь себя или своей вложенной папки" }
```

---

## Часть 6. Ключевые архитектурные решения

- **`.core-engine-lib-word-blocks`** — scope-класс. Все CSS-правила блоков идут с этим префиксом. Одинаково работает в редакторе (iframe body) и на публичной странице.
- **HTML и CSS разделены.** `content` — HTML без `<style>`, `css` — отдельное поле. GrapesJS парсит их по разным каналам — иначе теряет дерево.
- **`is_quest` в `PageChat`** — флаг уточняющего вопроса роутера. Позволяет роутеру отличить ответ пользователя от нового запроса.
- **`awaiting_answer` в `Run`** — статус: роутер задал вопрос, ждёт ответа. Run не завершён, а «висит».
- **Роутер уточняет всегда** — даже если уверен. Экономит время, токены и нервы: дешевле переспросить, чем запустить не того агента на 5 минут.
- **`None` в коде, но «Вежливый отказ» в документации.** Технический термин неудобен пользователю — переименовали в UI.
- **`new_request: true`** — роутер понимает, что пользователь сменил тему, и начинает диалог заново.
- **CSS базового шаблона** — содержит nav/sidebar/layout **и** (по ошибке) стили `.doc-*` документации. Стили `.doc-*` **не применяются** к контенту дочерних страниц — обходимся дублированием CSS на каждой странице (см. TODO).
- **`Page.css` — источник правды.** При сохранении пересобирается с нуля: `content.css` + используемые `blocks/*.css` + `fx/*.css` + custom. Публичная страница берёт **только этот файл**.
- **Медиа per-nav.** `media/<nav_id>/` — изоляция данных между пользователями.
- **Copy работает на выделении (1+).** Логика: если пользователь выбрал N — он хочет N копий. Один confirm на всю пачку, без per-item.
- **Move работает ровно на 1 элементе.** Логика: перемещение — решение по каждой карточке отдельно. Batch-перемещение превращается в «почему 8 карточек оказались здесь?». Кнопка disabled при `selectedCount !== 1`.
- **Move стоит перед Delete в тулбаре.** Логика: «Переместить» — не разрушающее действие, оно до «Удалить». Порядок: `add → copy → edit → move → delete`.
- **Защита от циклов — на обоих концах.** Фронт: не показываем саму папку и её потомков в списке. Бэк: `_is_descendant` в `update_item` кидает `ValueError("cycle")` → 400. Фронт может быть обойдён (DevTools, прямой API-запрос) — бэк закрывает эту дыру.
- **Модалка выбора папки — универсальная.** `BaseModalList` живёт в `base/modal/`, не в `lib/pages/`. Это не «модалка перемещения» — это «модалка одиночного выбора из списка», которая пригодится и в других местах (выбор пресета, выбор шаблона). В `move.js` вызывается через `createModal('list')`.
- **Плоский список папок с полными путями.** Вместо дерева с раскрывающимися узлами — плоский список вида `/folder1/folder2`. Проще, покрывает все уровни, решает проблему циклов (визуально: потомки просто не показаны).
- **Никаких `window.confirm` / `window.alert`.** Всё — через `BaseModalConfirm` / `BaseModalMessage`. В `lib/pages/utils.js` — обёртки `confirm()` / `message()`, которые возвращают Promise.
- **Делегаты в `pages.js`.** Тяжёлая логика в модулях (`copy.js`, `move.js`, `utils.js`), но точка входа — метод в `Pages`. Это удобнее для отладки: стек показывает `pages._copySelected` / `pages._moveSelected`.
- **Ошибки — человечным текстом.** `sendMove` и `duplicateItemSilent` вытаскивают `detail` из ответа бэка (строка или объект) и показывают его пользователю. Не абстрактное «Не удалось», а конкретное «Нельзя переместить папку внутрь себя».

---

## Часть 7. Что где искать (быстрый указатель)

| Нужно | Смотри |
|---|---|
| Добавить нового агента | `llm/agent/`, `llm/websocket/agents.py`, `llm/agent/router.py` (AGENTS + промпты) |
| Изменить промпт агента | `llm/prompts/` |
| Логика роутера | `llm/agent/router.py` |
| WS-цикл и обработка типов | `llm/websocket/endpoint.py` |
| Запуск агента из WS | `llm/websocket/dispatch.py` → `_run_agent` |
| Провайдер LLM | `utils/llm/factory.py`, `llm/websocket/provider.py` |
| Модель Run и статусы | `models/run.py`, `llm/runs.py` |
| История чата | `models/page_chat.py`, `llm/service.py` |
| Дамп промптов (отладка) | `log/llm-prompts/run-<id>/` |
| Границы агентов (примеры) | `llm/agent/router.py` → `SYSTEM_PROMPT_ASK` / `SYSTEM_PROMPT_PICK` |
| Страница: сохранение | `word/service.py` → `save_content` |
| Страница: рендер | `word/view.js` → `buildArticle` |
| Страница: CSS | `word/css_builder.py` |
| Редактор: загрузка данных | `editor/dataloader.js` |
| Редактор: инициализация GrapesJS | `editor/grapes/index.js` |
| Редактор: конфиг GrapesJS | `editor/grapes/config.js` |
| Редактор: канвас CSS | `editor/grapes/index.js` → `canvasCss` |
| Редактор: блоки | `editor/blocks/` |
| Редактор: эффекты | `editor/effects/`, `editor/effects/registry.json` |
| Редактор: ассеты | `editor/assets.js` + `base/assets/` |
| Каталог страниц (front) | `pages/pages.js` |
| Каталог страниц (back) | `pages/service.py`, `pages/route.py`, `pages/schema.py` |
| Утилиты Pages (confirm/message/apiUrl) | `pages/utils.js` |
| Копирование страницы (front) | `pages/copy.js` → `copySelected`, `duplicateItemSilent` |
| Копирование страницы (back) | `pages/service.py` → `duplicate_item`; `pages/route.py` → `POST /item/{id}/duplicate` |
| Перемещение страницы (front) | `pages/move.js` → `moveSelected`, `buildFolderOptions`, `sendMove` |
| Перемещение страницы (back) | `pages/service.py` → `update_item` (parent_id); `pages/route.py` → `PUT /item/{item_id}` |
| Защита от циклов | `pages/service.py` → `_is_descendant`; `pages/move.js` → `collectDescendantIds` |
| Иконка Move | `base/images/move.svg` |
| Кнопка Copy в тулбаре | `base/cards/toolbar/toolbar.js` → `.cards-toolbar-btn-copy` |
| Кнопка Move в тулбаре | `base/cards/toolbar/toolbar.js` → `.cards-toolbar-btn-move` |
| Модалка одиночного выбора (список) | `base/modal/list.js` + `list.css`; `createModal('list')` |
| Флаги тулбара | `base/cards/initool.js` → `showCopyButton`, `showMoveButton` |
| Карточки (Base) | `base/cards/` |
| Публичный роут `/page/...` | `pages/public/route.py` |
| Аутентификация | `auth/`, `auth/dependencies.py` |
| Миграции | `test/migrate.sh` |
| Тестовая БД | `test/base/neurocad.db` |
| Медиа | `media/<nav_id>/` |

---

*Конец документа. Дополняется по мере необходимости.*

## НОВОЕ:

- **«Публиковать» = `is_active`.** Отдельного поля `is_publish` нет — используем существующее `is_active`. В форме показывается как чекбокс «Публиковать» (последним полем). Фильтры по `is_active` уже стояли в admin/service.py и public/service.py — менять их не пришлось. Проверка данных показала, что у всех 68 существующих страниц `is_active = 1` — старый прод не сломался.
- **Рендер карточек вынесен из `pages.js` в `card.js`.** Причина — `pages.js` разросся до ~600 строк. Рендер — самая независимая часть, не требующая состояния `Pages`. Плюс: файл стал чище, рендер можно править без риска задеть оркестратор.
- **Шаблоны скрыты из публичного каталога, но видны по своему URL.** `get_list()` в public/service.py фильтрует `is_template == 0` — шаблон не появится в `/pages` как карточка. Но прямая ссылка `/page/<date>/<time>` на шаблон работает: владелец может посмотреть «голый» шаблон в изоляции от детей.
- **Снятие «Публиковать» с шаблона = «выключить оболочку».** `get_by_id()` и `get_template_css()` фильтруют `is_active == 1` намеренно: сняли галку с шаблона → дети рендерятся без него, «как будто шаблона нет». Это осознанная фича, а не баг. Полезно, когда владелец хочет временно отключить общий layout, не удаляя шаблон.
- **Удаление шаблона = дети без оболочки навсегда.** Если владелец удаляет (`is_delete = 1`), а у детей `template_id` указывает на него — они рендерятся без шаблона. Это правильно: удаление означает «шаблона больше нет».
- **`is_active` для шаблона управляет двумя вещами.** (1) Виден ли сам шаблон по своей прямой ссылке `/page/<date>/<time>`. (2) Применяется ли шаблон к дочерним страницам при рендере. На публичный каталог `/pages` это **не влияет** — там шаблон скрыт безусловно (`is_template == 0`).

| Рендер карточек (страница / папка / «..») | `pages/card.js` → `renderArticleCard`, `renderUpCard` |
| Чекбокс «Публиковать» в форме | `pages/pages.js` → массив `fields`, key: `is_active` |
| Публичность: фильтр в публичном каталоге | `pages/public/service.py` → `get_list()` |
| Шаблон скрыт в каталоге, но виден по URL | `pages/public/service.py` → `get_list()` (фильтр `is_template == 0`) |
| Шаблон снят → дети без оболочки | `pages/public/service.py` → `get_by_id()` + `get_template_css()` |
| Публичность: фильтр в админке | `pages/service.py` → `get_list()` (принимает `is_active` опционально) |