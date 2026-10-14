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
- `deepseek-proxy.neurocad-dev.ru:8443` — внешний прокси для DeepSeek (см. Часть 8).

**Стек:**

| Слой | Технология |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy (async), SQLite, Alembic |
| Frontend | Vanilla JS (ES-модули, динамический импорт), HTML, CSS |
| Редактор | GrapesJS 0.21.13 (интегрирован кастомно) |
| LLM | Несколько провайдеров через фабрику (`utils/llm/factory.py`), есть mock-провайдер (`LLM_MOCK=1`) |
| LLM-прокси | Внешний `deepseek-proxy` (FastAPI + httpx), ротация ключей, параллельные запросы |
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
neurocad/
├── app/ ← корень приложения (FastAPI-пакет)
│ ├── main.py ← точка входа uvicorn
│ ├── config.py ← settings (SECRET_KEY, APP_DOMAIN, LLM_)
│ │
│ ├── core/ ← ядро
│ │ ├── auth/ ← авторизация
│ │ │ ├── login/ ← вход (route / schema / service)
│ │ │ ├── register/ ← регистрация
│ │ │ ├── restore/ ← восстановление пароля
│ │ │ ├── password/ ← смена пароля
│ │ │ ├── profile/ ← профиль пользователя
│ │ │ ├── impersonate/ ← вход от имени пользователя (супер-админ)
│ │ │ ├── middleware/ ← auth middleware
│ │ │ ├── dependencies.py ← get_current_user для FastAPI
│ │ │ └── ...
│ │ │
│ │ ├── engine/ ← конструктор страниц
│ │ │ ├── route.py ← общий роутер engine
│ │ │ ├── renderer.js ← рендер компонентов на клиенте
│ │ │ ├── binder.js ← привязка событий
│ │ │ ├── engine.js ← CoreEngine: loadAPI, loadConfig, loadComponents, loadCSS
│ │ │ ├── modules.py ← конфигурация модулей (JSON)
│ │ │ │
│ │ │ └── lib/ ← библиотеки компонентов
│ │ │ ├── base/ ← базовый компонент Base (шапка, меню, чат)
│ │ │ │ ├── base.js ← класс Base (shell)
│ │ │ │ ├── header.js ← Header (шапка + impersonation bar)
│ │ │ │ ├── menu.js ← Menu (главное меню)
│ │ │ │ ├── pages.js ← BasePages (showProfile / showSetup / showCreatives)
│ │ │ │ ├── areas.js ← BaseAreas (renderInArea / teardownAreas)
│ │ │ │ ├── auth/ ← BaseAuth (login/register/restore/password/profile)
│ │ │ │ ├── profile/ ← профиль
│ │ │ │ │ ├── profile.js ← BaseProfile (landing)
│ │ │ │ │ ├── balance/ ← BaseProfileBalance
│ │ │ │ │ ├── domain/ ← BaseProfileDomain
│ │ │ │ │ │ ├── domain.js
│ │ │ │ │ │ ├── cards.js
│ │ │ │ │ │ ├── actions.js
│ │ │ │ │ │ ├── modals.js
│ │ │ │ │ │ ├── helpers.js
│ │ │ │ │ │ ├── route.py ← domain routes
│ │ │ │ │ │ ├── schema.py
│ │ │ │ │ │ ├── public.py ← /policy, /rules, /contacts
│ │ │ │ │ │ ├── service/ ← пакет миксинов
│ │ │ │ │ │ │ ├── facade.py
│ │ │ │ │ │ │ ├── common.py
│ │ │ │ │ │ │ ├── legal.py ← 3 which: policy / rules / contacts
│ │ │ │ │ │ │ ├── robots.py
│ │ │ │ │ │ │ └── ...
│ │ │ │ │ │ └── modal/legal/ ← LegalModal (3 which) + 3 .md
│ │ │ │ │ └── ...
│ │ │ │ ├── setup/ ← setup landing + LLM
│ │ │ │ │ ├── setup.js ← BaseSetup (landing)
│ │ │ │ │ └── llm/ ← BaseSetupLlm
│ │ │ │ ├── cards/ ← BaseCards (карточки, тулбар, рендер)
│ │ │ │ ├── modal/ ← базовые модалки (message, confirm, input, list)
│ │ │ │ ├── assets/ ← медиатека (BaseAssets)
│ │ │ │ └── ...
│ │ │ │
│ │ │ ├── creatives/ ← креативы (реклама) — новый модуль
│ │ │ │ ├── creatives.js ← админка: список / размещения / отчёт
│ │ │ │ ├── creatives.css
│ │ │ │ ├── route.py ← CRUD + /hit + /public/item + /stats
│ │ │ │ ├── service.py ← get_stats с page_title + page_url
│ │ │ │ ├── schema.py ← StatsItem с page_title + page_url
│ │ │ │ └── public/ ← block.js (трекинг show/click)
│ │ │ │
│ │ │ ├── word/ ← редактор страниц (Word) — главный компонент
│ │ │ │ ├── word.js ← оркестратор: страница, тулбар, редактор
│ │ │ │ ├── view.js ← рендер статьи (публичный просмотр)
│ │ │ │ ├── data.js ← загрузка страницы (by id / by date)
│ │ │ │ ├── actions.js ← действия (save, autosave, history, rollback)
│ │ │ │ ├── bridge.js ← мост к GrapesJS-редактору
│ │ │ │ ├── utils.js ← утилиты (дата, JSON)
│ │ │ │ ├── constants.py ← MEDIA_URL, SPECIAL_NAMES
│ │ │ │ ├── service.py ← тонкий фасад CoreEngineLibWordService
│ │ │ │ ├── page.py ← read: get_by_datetime / get_by_id / page_to_dict
│ │ │ │ ├── history.py ← snapshots: list / get / rollback / delete / clear
│ │ │ │ ├── media.py ← list_assets / upload_assets
│ │ │ │ ├── creative.py ← patch data-creative-id и data-placement-id
│ │ │ │ ├── url.py ← build_public_url / resolve_nav_owner
│ │ │ │ ├── css.py ← write_page_css_file
│ │ │ │ ├── css_builder.py ← build_full_page_css
│ │ │ │ ├── route.py ← эндпоинты страницы
│ │ │ │ ├── hint.js ← подсказки (пустая статья)
│ │ │ │ │
│ │ │ │ ├── editor/ ← GrapesJS-редактор
│ │ │ │ │ ├── index.js ← точка входа (loadEditor)
│ │ │ │ │ ├── editor.js ← класс Editor (оркестратор)
│ │ │ │ │ ├── widgets.js ← DOM-структура (3 панели, тулбар)
│ │ │ │ │ ├── styles.js ← секции StyleManager
│ │ │ │ │ ├── blocks/ ← библиотека блоков (ready.js: core-creative, core-footer и др.)
│ │ │ │ │ ├── assets.js ← медиапикер
│ │ │ │ │ ├── brand.js ← подстановка public_host в footer
│ │ │ │ │ ├── creative.js ← подстановка data-creative-id в core-creative
│ │ │ │ │ ├── autosave.js ← автосохранение
│ │ │ │ │ ├── session.js ← save / cancel / close
│ │ │ │ │ ├── template.js ← рендер базового шаблона
│ │ │ │ │ ├── toolbar.js ← тулбар редактора
│ │ │ │ │ ├── dataloader.js ← загрузка данных в GrapesJS
│ │ │ │ │ ├── modals.js ← HTML+CSS / element CSS
│ │ │ │ │ ├── history.js ← история версий
│ │ │ │ │ ├── resizer.js ← ресайз панелей
│ │ │ │ │ ├── io/ ← import / export
│ │ │ │ │ ├── grapes/ ← кастомная инициализация GrapesJS
│ │ │ │ │ │ ├── index.js ← GrapesLoader
│ │ │ │ │ │ ├── config.js ← buildConfig
│ │ │ │ │ │ ├── link.js ← link-тип и команда
│ │ │ │ │ │ ├── page-link.js ← page-link trait
│ │ │ │ │ │ ├── scope.js ← scope-class на body
│ │ │ │ │ │ ├── empty.js ← автоудаление пустых <p>
│ │ │ │ │ │ ├── undo.js ← фильтр UndoManager
│ │ │ │ │ │ ├── traits.js ← body traits
│ │ │ │ │ │ └── ...
│ │ │ │ │ ├── css/ ← CSS редактора
│ │ │ │ │ ├── effects/ ← эффекты (fx-)
│ │ │ │ │ │ ├── registry.json ← реестр эффектов
│ │ │ │ │ │ ├── fx/*.css ← CSS каждого эффекта
│ │ │ │ │ │ ├── create.js ← создание эффекта
│ │ │ │ │ │ ├── edit.js ← правка эффекта
│ │ │ │ │ │ └── live.js ← live-превью
│ │ │ │ │ ├── blocks/ ← блоки страницы
│ │ │ │ │ │ ├── manifest.json ← реестр блоков
│ │ │ │ │ │ ├── blocks.css ← UI блоков
│ │ │ │ │ │ ├── elements.js ← элементы (h1, p, кнопка)
│ │ │ │ │ │ ├── ready.js ← готовые секции (hero, features, core-creative, core-footer)
│ │ │ │ │ │ ├── layout.js ← разметка (grid, flex)
│ │ │ │ │ │ └── ...
│ │ │ │ │ ├── images/ ← медиатека логотипов
│ │ │ │ │ └── ...
│ │ │ │ │
│ │ │ │ ├── llm/ ← LLM-слой (чат, агенты, роутер)
│ │ │ │ │ ├── ws.py ← тонкий реэкспорт WS-endpoint
│ │ │ │ │ ├── route.py ← HTTP-эндпоинты LLM
│ │ │ │ │ ├── service.py ← БД: пресеты, история чата
│ │ │ │ │ ├── runs.py ← БД: Run (запуски LLM)
│ │ │ │ │ ├── schema.py ← Pydantic-схемы LLM
│ │ │ │ │ ├── step.py ← фасад multi-step
│ │ │ │ │ ├── parser.py ← парсер ответов LLM
│ │ │ │ │ ├── dumper.py ← дамп промптов и ответов
│ │ │ │ │ ├── mock.py ← mock-провайдер
│ │ │ │ │ ├── utils.py ← split/merge html+css
│ │ │ │ │ │
│ │ │ │ │ ├── agent/ ← агенты
│ │ │ │ │ │ ├── base.py ← базовый класс
│ │ │ │ │ │ ├── router.py ← роутер («Администратор»)
│ │ │ │ │ │ ├── none.py ← «Вежливый отказ»
│ │ │ │ │ │ ├── help.py ← помощь
│ │ │ │ │ │ ├── create.py ← сборка из блоков
│ │ │ │ │ │ ├── create_page.py ← генерация с нуля
│ │ │ │ │ │ ├── fill.py ← заполнение элемента
│ │ │ │ │ │ ├── effect.py ← эффекты
│ │ │ │ │ │ ├── edit.py ← правка CSS эффекта
│ │ │ │ │ │ ├── rename.py ← переименование эффекта
│ │ │ │ │ │ ├── create_effect.py ← создание эффекта
│ │ │ │ │ │ ├── generate_logo.py ← логотип
│ │ │ │ │ │ └── generate_legal.py ← политика / правила / контакты
│ │ │ │ │ │
│ │ │ │ │ ├── prompts/ ← промпты агентов
│ │ │ │ │ │ ├── plan.py
│ │ │ │ │ │ ├── fill.py
│ │ │ │ │ │ ├── effects.py
│ │ │ │ │ │ ├── create_page.py
│ │ │ │ │ │ ├── create_effect.py
│ │ │ │ │ │ ├── edit_effect.py
│ │ │ │ │ │ ├── rename_effect.py
│ │ │ │ │ │ ├── logo.py
│ │ │ │ │ │ ├── svg.py
│ │ │ │ │ │ ├── generate_legal.py
│ │ │ │ │ │ └── legacy.py
│ │ │ │ │ │
│ │ │ │ │ ├── steps/ ← шаги multi-step
│ │ │ │ │ │ ├── common.py
│ │ │ │ │ │ ├── plan.py
│ │ │ │ │ │ ├── fill.py
│ │ │ │ │ │ ├── effects.py
│ │ │ │ │ │ └── svg.py
│ │ │ │ │ │
│ │ │ │ │ ├── websocket/ ← WS-слой
│ │ │ │ │ │ ├── base.py ← CoreEngineLibWordLlmWS (mixins)
│ │ │ │ │ │ ├── endpoint.py ← главный WS-цикл
│ │ │ │ │ │ ├── dispatch.py ← _run_agent и три других
│ │ │ │ │ │ ├── provider.py ← выбор провайдера
│ │ │ │ │ │ ├── cancel.py ← cancel events, safe_send
│ │ │ │ │ │ ├── history.py ← _load_history, _load_current_page_html
│ │ │ │ │ │ ├── auth.py ← _authenticate_ws, _log
│ │ │ │ │ │ └── agents.py ← _AGENTS registry
│ │ │ │ │ │
│ │ │ │ │ └── chat/ ← фронтенд чата
│ │ │ │ │ ├── ws.js ← WS-транспорт
│ │ │ │ │ ├── ui.js ← DOM чата
│ │ │ │ │ ├── api.js ← HTTP: history, active run
│ │ │ │ │ ├── handler.js ← обработка WS-сообщений
│ │ │ │ │ ├── edit.js ← EditSession (правка эффекта)
│ │ │ │ │ ├── create.js ← CreateSession (создание эффекта)
│ │ │ │ │ └── ...
│ │ │ │ │
│ │ │ │ └── ...
│ │ │ │
│ │ │ ├── pages/ ← каталог статей (Pages)
│ │ │ │ ├── pages.js ← класс Pages (оркестратор)
│ │ │ │ ├── utils.js ← утилиты: apiUrl, canEdit, confirm, message
│ │ │ │ ├── copy.js ← копирование: copySelected, duplicateItemSilent
│ │ │ │ ├── move.js ← перемещение: moveSelected, buildFolderOptions
│ │ │ │ ├── card.js ← рендер карточки статьи / «..» / папки
│ │ │ │ ├── title.js ← заголовок каталога
│ │ │ │ ├── logo.js ← генератор логотипов (кнопка)
│ │ │ │ ├── hint.js ← подсказки
│ │ │ │ ├── public/ ← публичный каталог /page/<date>/<time>
│ │ │ │ │ ├── route.py ← тонкие эндпоинты (URL)
│ │ │ │ │ ├── render.py ← рендер (page / catalog / placeholder / resolve_content)
│ │ │ │ │ ├── cookies.py← cookie текущей папки
│ │ │ │ │ ├── html.py ← strip_body_wrapper, apply_template
│ │ │ │ │ ├── hosts.py ← host ownership + nav resolution
│ │ │ │ │ ├── paths.py ← build_folder_path
│ │ │ │ │ ├── service.py← CoreEngineLibPagesPublicService
│ │ │ │ │ └── schema.py ← Pydantic-схемы
│ │ │ │ ├── service.py ← CoreEngineLibPagesService (admin)
│ │ │ │ ├── route.py ← эндпоинты admin
│ │ │ │ └── schema.py ← Pydantic-схемы
│ │ │ │
│ │ │ ├── balance/ ← баланс (тарифы, лимиты)
│ │ │ ├── nav/ ← навигация (шапка каталога)
│ │ │ ├── module/ ← модули
│ │ │ ├── setup/ ← настройка (llm)
│ │ │ ├── table/ ← таблицы
│ │ │ └── ...
│ │ │
│ │ └── models/ ← модели SQLAlchemy
│ │ ├── base.py ← реэкспорт всех моделей
│ │ ├── page.py ← Page (+ PageHist, PageChat)
│ │ ├── nav.py ← Nav
│ │ ├── user.py ← User (включая policy / rules / contacts)
│ │ ├── creative.py ← Creative (text / button_text / brand / inn)
│ │ ├── placement.py ← Placement (creative на странице)
│ │ ├── placement_stat.py ← PlacementStat (показы / клики / target_actions)
│ │ ├── auth.py ← Auth
│ │ ├── balance.py ← Balance
│ │ ├── run.py ← Run
│ │ ├── module.py ← Module
│ │ ├── access.py ← Access
│ │ ├── domain.py ← Domain (scheduled deletion)
│ │ ├── page_pres.py ← PagePres
│ │ ├── page_chat.py ← PageChat (is_quest)
│ │ ├── page_hist.py ← PageHist
│ │ └── ...
│ │
│ ├── utils/ ← утилиты
│ │ ├── sqlite.py ← get_db_sqlite
│ │ ├── css.py ← css_hash, ensure_css_file
│ │ ├── llm/ ← фабрика LLM-провайдеров
│ │ │ ├── factory.py ← get_provider
│ │ │ ├── deepseek.py ← DeepSeekProvider (thinking, dump)
│ │ │ └── ...
│ │ └── ...
│ │
│ ├── static/ ← статика
│ │ ├── core/engine/...
│ │ └── ...
│ │
│ ├── media/ ← медиа пользователей
│ │ └── <nav_id>/ ← медиа конкретного nav
│ │
│ ├── log/ ← логи
│ │ └── llm-prompts/ ← дампы промптов LLM
│ │ └── run-<id>/ ← по одному run на папку
│ │
│ ├── test/ ← тесты и миграции
│ │ ├── base/neurocad.db ← БД тестовой среды
│ │ ├── .venvtest/ ← venv тестовой среды
│ │ ├── migrate.sh ← обёртка Alembic
│ │ └── ...
│ │
│ └── alembic.ini ← конфиг Alembic
│
└── ...

Вне репозитория
/opt/deepseek-proxy/ ← внешний LLM-прокси (на VDS)
├── main.py ← FastAPI + httpx, MAX_CONCURRENT, ротация ключей
└── venv/

/etc/systemd/system/deepseek-proxy.service ← systemd unit

text

---

## Часть 3. Ключевые сущности (модели)

### `Page` (`core/models/page.py`)

Страница или папка. Центральная сущность конструктора.

**Поля:**
- `id` — PK.
- `nav_id` — FK на Nav.
- `card_type` — `"page"` или `"folder"`.
- `parent_id` — FK на саму Page. Папка, в которой лежит страница. `NULL` = корень.
- `sort_order` — ручная сортировка.
- `datetime` — дата публикации. У папок `NULL`.
- `title`, `description`, `logo`.
- `content` — HTML.
- `content_json` — GrapesJS JSON.
- `css` — CSS страницы.
- `url` — внешняя ссылка.
- `is_template` — 0/1.
- `template_id` — FK на Page (базовый шаблон).
- `is_active`, `is_delete`.
- `created_at`, `updated_at`.
- `rss_yandex_id`.

### `PageChat` (`core/models/page_chat.py`)

История чата с LLM. Одна строка = одно сообщение.

- `id`, `page_id`.
- `role` — `user` / `assistant` / `system`.
- `content` — текст.
- `is_quest` — 0/1. Флаг «уточняющий вопрос администратора».
- `model`, `prompt_tokens`, `completion_tokens`.
- `created_at`.

### `PageHist` (`core/models/page_hist.py`)

Снапшот страницы.

- `id`, `page_id`.
- `html`, `content_json`, `css`.
- `action` — `user_edit` / `rollback`.
- `note`.
- `created_at`.

### `Run` (`core/models/run.py`)

Одна запись = один запуск LLM-флоу.

- `id`, `page_id`, `user_id`.
- `status` — `pending` / `planning` / `awaiting_answer` / `filling` / `effects` / `done` / `cancelled` / `failed`.
- `step`, `user_message`, `message`, `error`.
- `block_catalog`, `plan`, `filled`, `effects` — JSON.
- `final_html`.
- `created_at`, `updated_at`.

### `Nav` (`core/models/nav.py`)

Экземпляр сайта. У пользователя может быть несколько.

### `User` (`core/models/user.py`)

- `id`, `login`, `password`, `name`, `email`.
- `is_superadmin`, `is_active`, `is_delete`.
- `domain` — второй уровень (custom).
- `home_page_id` — главная страница.
- `robots_2`, `robots_3` — robots.txt.
- **`policy`, `rules`, `contacts`** — markdown-тексты. `contacts` — новая колонка (TEXT, nullable, миграция `0943e8bd752c`).

### `Creative` (`core/models/creative.py`)

- `id`, `nav_id`, `name`, `erid`.
- `description`, `target_url`, `media_file`.
- **`text`, `button_text`, `brand`, `inn`** — поля для блока `core-creative`.
- `is_active`, `is_delete`.

### `Placement` (`core/models/placement.py`)

Привязка креатива к странице.

- `id`, `creative_id`, `page_id`.
- `date_start`, `date_end` (`date_end IS NULL` = активное).
- `is_active`, `is_delete`.

### `PlacementStat` (`core/models/placement_stat.py`)

Статистика размещения по дням.

- `id`, `placement_id`, `date`.
- `shows`, `clicks`, `target_actions`.

### `Balance` (`core/models/balance.py`)

- `tarif` (0=free, 1=pro, 2=llm).
- `tokens`, `gen`, `limit_pages`.

---

## Часть 4. Ключевые файлы

### Frontend — Word

**`word/word.js`** — оркестратор виджета страницы.

**`word/view.js`** — рендер статьи.
- `buildArticle(word)` — порядок: template CSS → page CSS → HTML.
- `rebaseFooterLinks(root, publicHost)` — переписывает относительные ссылки `core-footer` на публичный хост владельца (для админского просмотра).

**`word/data.js`**, **`word/actions.js`**, **`word/bridge.js`** — как было.

**`word/page.py`** — read-side: `get_by_datetime`, `get_by_id`, `page_to_dict` (с `creative_id`, `public_url`, `public_host`, patch data-creative-id).

**`word/history.py`** — snapshots: list / get / rollback / delete / clear + `is_duplicate_snapshot`.

**`word/media.py`** — `list_assets`, `upload_assets`.

**`word/creative.py`** — `patch_creative_blocks` (data-creative-id), `patch_placement_blocks` (data-placement-id), `load_active_creative_id`, `load_active_placement_id`.

**`word/url.py`** — `build_public_url`, `resolve_nav_owner`, `public_host_from_url`.

**`word/css.py`** — `write_page_css_file`.

**`word/service.py`** — тонкий фасад `CoreEngineLibWordService`, содержит только `save_content`.

**`word/css_builder.py`** — `build_full_page_css` — как было.

### Frontend — Editor (GrapesJS)

**`editor/editor.js`**, **`editor/dataloader.js`**, **`editor/grapes/index.js`**, **`editor/grapes/config.js`** — как было.

**`editor/creative.js`** — подстановка `data-creative-id` в блок `core-creative` при drop и при загрузке страницы.

**`editor/blocks/ready.js`** — блок `core-creative` (с `data-creative-id=""`), `core-footer` (три ссылки: `/policy`, `/rules`, `/contacts`).

### Backend — LLM

**`llm/agent/router.py`** — «Администратор».

**`llm/agent/base.py`** — интерфейс агента.

**`llm/agent/none.py`**, **`help.py`**, **`create.py`**, **`create_page.py`**, **`fill.py`**, **`effect.py`**, **`edit.py`**, **`rename.py`**, **`create_effect.py`**, **`generate_logo.py`**, **`generate_legal.py`** — как было.

### Backend — LLM WebSocket

**`llm/websocket/*`** — как было.

### Backend — LLM сервис

**`llm/service.py`**, **`llm/runs.py`**, **`llm/dumper.py`** — как было.

### Frontend — Pages (каталог)

**`pages/pages.js`** — оркестратор. Делегаты `_copySelected` / `_moveSelected` / `_apiUrl`.

**`pages/utils.js`** — общие утилиты.

**`pages/copy.js`**, **`pages/move.js`** — как было.

**`pages/card.js`** — `renderArticleCard`, `renderUpCard`.

**`pages/service.py`** (admin) — CRUD + `duplicate_item` + `_is_descendant` + защита от циклов.

**`pages/route.py`** (admin) — `POST /item/{id}/duplicate`, `is_folder` в `/list`, обработка `ValueError("cycle")`.

### Backend — Pages (public)

Разбит на модули:
- **`route.py`** — только `@router.get` функции.
- **`render.py`** — `render_public_page`, `render_pages_catalog`, `render_unavailable`, `resolve_content`.
- **`cookies.py`** — `FOLDER_COOKIE`, `parse_folder_cookie`, `serialize_folder_cookie`, `set_folder_cookie`.
- **`html.py`** — `strip_body_wrapper`, `apply_template`.
- **`hosts.py`** — `enforce_host_owner`, `resolve_nav_owner`, `resolve_nav_name`, `resolve_first_nav_id(_for_user)`.
- **`paths.py`** — `build_folder_path`, `load_folder_row`.
- **`service.py`** — `CoreEngineLibPagesPublicService`.
- **`schema.py`** — Pydantic-схемы.

### Frontend — Creatives (новый модуль)

**`creatives/creatives.js`** — админка: 3 вкладки (Креативы / Размещения / Отчёт).
- `_loadCSS()` — `async`, `await` в `_init()`.
- `_pageCell(r)` — рендер столбца «Страница»: `page_url` → ссылка, иначе `#<id>`.

**`creatives/creatives.css`** — стили, `.creatives-num` = `text-align: center; font-variant-numeric: tabular-nums`.

**`creatives/route.py`** — CRUD + `/hit` + `/public/item/{id}` + `/stats`.

**`creatives/service.py`** — `get_stats` с `Page.title` и `Page.datetime`, `_public_base_for_nav`, `_stats_row_to_dict`.

**`creatives/schema.py`** — `StatsItem` с `page_title`, `page_url`.

**`creatives/public/block.js`** — публичный патчер + трекинг (show / click через `navigator.sendBeacon`).

### Frontend — Base / Profile / Domain

**`base/profile/domain/service/legal.py`** — `set_legal` / `get_legal_for_user` / `get_legal_for_host` / `get_defaults` — три документа.

**`base/profile/domain/public.py`** — `/policy`, `/rules`, `/contacts`.

**`base/profile/domain/modal/legal/legal.js`** — `LEGAL_WHICH` (три), `LEGAL_META`, `_refreshPresetButtons` (генерация отключена для contacts).

**`base/profile/domain/modal/legal/contacts.md`** — дефолтный текст.

### Frontend — Base / Shell

**`base/base.js`** — `_reveal()` (показ body после готовности), три ветки `_initAuth` через `await`.

**`base/menu.js`** — `_resolveItemHref(item)`: пустой href или `/` → `moduleBaseUrl`.

**`base/header.js`**, **`base/pages.js`**, **`base/areas.js`** — как было, но:
- `BasePages.showProfile / showSetup / showCreatives` — `async` (return await).
- `Base.showProfile / showSetup / showCreatives` — `async`.
- `Base._openPage` — `async`.

**`engine/engine.js`** — `loadCSS(path)` возвращает `Promise` (резолвится по `link.onload`).

**`base/setup/setup.js`**, **`base/profile/profile.js`**, **`creatives/creatives.js`** — `_loadCSS()` в `_init()`, `await`.

---

## Часть 5. Схема взаимодействия

### Поток обработки запроса в чате

Без изменений.

### Поток сохранения страницы

Без изменений.

### Поток открытия редактора

Без изменений.

### Поток публичного просмотра

Без изменений.

### Поток копирования / перемещения

Без изменений.

### Поток трекинга креатива (НОВОЕ)
Публичная страница /page/<date>/<time>
│
▼
pages/public/route.py → render_public_page
│ 1. resolve_content
│ 2. patch_creative_blocks (data-creative-id)
│ 3. patch_placement_blocks (data-placement-id)
│
▼
HTML с <section data-block="core-creative" data-creative-id="N" data-placement-id="P">
│
▼
creatives/public/block.js (динамический import)
│ 1. fetch /creatives/public/item/N
│ 2. fill / hide блок
│ 3. navigator.sendBeacon('/creatives/hit', {placement_id: P, hit_type: 'show'})
│ 4. на клик по .creative-block__link → sendBeacon(..., 'click')
│
▼
creatives/route.py → POST /creatives/hit → register_hit
│
▼
placement_stats: INSERT ... ON CONFLICT DO UPDATE (shows+1 / clicks+1)

text

### Поток отчёта по креативам
?page=creatives → вкладка «Отчёт»
│
▼
creatives.js → GET /creatives/stats?nav_id=8&date_from=...&date_to=...
│
▼
creatives/service.py → get_stats
│ 1. _public_base_for_nav(nav_id) → https://<owner-host>
│ 2. SELECT Placement + Creative + Page (LEFT JOIN)
│ 3. GROUP BY placement
│ 4. page_url = f"{public_base}/page/YYYYMMDD/HHMMSS"
│
▼
StatsItem: { placement_id, page_id, page_title, page_url, shows, clicks, target_actions }
│
▼
creatives.js → _pageCell(r) → если page_url → <a href=...>title</a>

text

---

## Часть 6. Ключевые архитектурные решения

Базовые (без изменений):
- `.core-engine-lib-word-blocks` — scope-класс.
- HTML и CSS разделены.
- `is_quest` в `PageChat`.
- `awaiting_answer` в `Run`.
- Роутер уточняет всегда.
- `None` в коде, «Вежливый отказ» в документации.
- `Page.css` — источник правды.
- Медиа per-nav.
- Copy на выделении (1+), Move на одном.
- Move перед Delete.
- Защита от циклов на обоих концах.
- `BaseModalList` — универсальная модалка выбора.
- Плоский список папок с путями.
- Никаких `window.confirm/alert`.
- Делегаты в `pages.js`.

Новые:
- **`data-creative-id` — денормализация.** Единственный источник правды — активное размещение (`placements.date_end IS NULL`). Атрибут перезаписывается на **всех слоях**: `word/creative.py` (save + read), `pages/public/route.py` (render), `word/editor/creative.js` (drop + load).
- **`data-placement-id` — для трекинга.** Второй атрибут на `<section data-block="core-creative">`. Идёт из той же строки `placements`, что и `data-creative-id`. Используется `creatives/public/block.js` для `POST /creatives/hit`.
- **Трекинг через `navigator.sendBeacon`.** Переживает навигацию (клик по ссылке креатива). `Blob({type: 'application/json'})` — чтобы FastAPI распарсил `HitRequest`.
- **`get_stats` резолвит публичный base один раз.** Не на каждую строку. `_public_base_for_nav` (в `creatives/service.py`) — импорт фасада домена через `..base...` (две точки, не четыре).
- **`loadCSS()` возвращает `Promise`.** Компоненты (`setup.js`, `profile.js`, `creatives.js`) делают `await this._loadCSS()` в `_init()`. `Base._reveal()` показывает body только после `await _openPage(...)`.
- **`_resolveItemHref` в `menu.js`.** Пустой href или `/` → `moduleBaseUrl` (`/core/engine/admin`).
- **`users.contacts` — третий юридический документ.** Не «юридический» по смыслу (телефон / email / адрес), но в том же пайплайне: same column type, same modal, same save endpoint. LLM-генерация **отключена** для contacts: фронт гасит кнопку, бэк возвращает 400 на `POST /domain/legal/generate` с `which="contacts"`.
- **`deepseek-proxy` — внешний сервис с параллельной обработкой.** `MAX_CONCURRENT` читается из ENV (дефолт 32). Ротация ключей — не тронута. Очередь убрана — прокси обрабатывает запросы параллельно.
- **`Proxy` — отдельный сервер.** `/opt/deepseek-proxy/main.py`, systemd unit `/etc/systemd/system/deepseek-proxy.service`. `DEEPSEEK_KEYS`, `MAX_CONCURRENT`, `QUEUE_TIMEOUT`, `UPSTREAM_TIMEOUT`, `ALLOWED_CLIENT_IP`.

---

## Часть 7. Что где искать

| Нужно | Смотри |
|---|---|
| Добавить нового агента | `llm/agent/`, `llm/websocket/agents.py`, `llm/agent/router.py` (AGENTS + промпты) |
| Изменить промпт агента | `llm/prompts/` |
| Логика роутера | `llm/agent/router.py` |
| WS-цикл | `llm/websocket/endpoint.py` |
| Запуск агента из WS | `llm/websocket/dispatch.py` → `_run_agent` |
| Провайдер LLM | `utils/llm/factory.py`, `llm/websocket/provider.py` |
| DeepSeek провайдер | `utils/llm/deepseek.py` |
| Модель Run и статусы | `models/run.py`, `llm/runs.py` |
| История чата | `models/page_chat.py`, `llm/service.py` |
| Дамп промптов | `log/llm-prompts/run-<id>/` |
| Границы агентов | `llm/agent/router.py` → `SYSTEM_PROMPT_ASK` / `SYSTEM_PROMPT_PICK` |
| Страница: сохранение | `word/service.py` → `save_content` |
| Страница: чтение | `word/page.py` → `page_to_dict` |
| Страница: рендер | `word/view.js` → `buildArticle` |
| Страница: CSS | `word/css_builder.py` |
| Creative: patch id | `word/creative.py` → `patch_creative_blocks` / `patch_placement_blocks` |
| Creative: трекинг (front) | `creatives/public/block.js` → `trackHit` |
| Creative: трекинг (back) | `creatives/service.py` → `register_hit`; `creatives/route.py` → `POST /hit` |
| Creative: отчёт | `creatives/service.py` → `get_stats`; `creatives/schema.py` → `StatsItem` |
| Creative: кликабельный page | `creatives/creatives.js` → `_pageCell`; `creatives/creatives.css` → `.creatives-num` |
| LegalModal (3 which) | `base/profile/domain/modal/legal/legal.js` |
| Public /contacts | `base/profile/domain/public.py` |
| Публичный /page/<date>/<time> | `pages/public/route.py` + `render.py` |
| Публичный /pages (каталог) | `pages/public/route.py` + `render.py` |
| Cookie папки каталога | `pages/public/cookies.py` |
| Host ownership | `pages/public/hosts.py` |
| Folder path | `pages/public/paths.py` |
| Меню: «Главная» | `base/menu.js` → `_resolveItemHref` |
| FOUC prevention | `engine/engine.js` → `loadCSS`; `base/base.js` → `_reveal` |
| Footer rebase | `word/view.js` → `rebaseFooterLinks` |
| DeepSeek proxy | `/opt/deepseek-proxy/main.py` (вне репо) |
| Каталог (front) | `pages/pages.js` |
| Каталог (back) | `pages/service.py`, `pages/route.py`, `pages/schema.py` |
| Копирование (front/back) | `pages/copy.js` / `pages/service.py` → `duplicate_item` |
| Перемещение (front/back) | `pages/move.js` / `pages/service.py` → `update_item` |
| Защита от циклов | `pages/service.py` → `_is_descendant` |
| BaseModalList | `base/modal/list.js` + `list.css` |
| Миграции | `test/migrate.sh` |
| Медиа | `media/<nav_id>/` |

---

*Конец документа. Дополняется по мере необходимости.*