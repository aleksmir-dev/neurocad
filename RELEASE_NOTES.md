# neurocad 0.1.25

Release date: 2026-09-27

---

## English

### Added

- **`nav_id` scoping for pages and media.** `pages` are now bound to a nav instance (`Page.nav_id` → `nav.id`), not to a module. The same `<date>/<time>` pair can exist under different navs without collision.
- **`?nav_id=<id>` on every write endpoint** of `pages`, `word`, `editor` (effects/images) and `llm` (presets, chat). Read endpoints accept it optionally.
- **`_resolve_nav_id()` in `pages/route.py`, `word/route.py`, `base/assets/route.py`** — if `nav_id` is not passed explicitly, the backend resolves the current user's first nav (`ORDER BY id ASC`).
- **`ensure_default_nav()` in `utils/sqlite.py`** — idempotently creates a "Каталог статей" nav for the admin on first start (after `ensure_modules`).
- **`USER_AUTO_CREATE_NAV` env flag** — when true, every newly registered user gets their own nav row pointing at the `default` module.
- **Auto-create nav on registration** in `core/auth/register/service.py` (guarded by `USER_AUTO_CREATE_NAV`).
- **Nav propagation to the frontend** — `engine_module` falls back to the session's first nav and passes it through `<body data-nav-id>`; `CoreEngine._injectRuntimeProps()` walks the whole component tree so `word` and `pages` receive `props.nav_id`.

### Changed

- **`Page.mod_id` → `Page.nav_id`** (Alembic migration `dcccfce2b645`). Existing pages are migrated to the admin's nav.
- **Media layout** — `media/<nav_id>/` instead of `media/<module_name>/` (applies to `word`, `base/assets`, and the GrapesJS asset manager).
- **Public page URL** — `/page/<date>/<time>`, same shape as before, no `nav_id` in the path. Admin preview keeps the engine URL `/core/engine/<module>/page/<date>/<time>`.
- **Permissions relaxed from "superadmin only" to "any authenticated user"** in `pages/route.py`, `word/route.py`, `word/editor/effects/route.py`, `word/editor/images/route.py`, `word/llm/route.py`, `base/assets/route.py`. Settings endpoints (`base/setup/llm/*`) remain superadmin-only.
- **Frontend permission check** — `Pages._canEdit()` and `Word._canEdit()` replace `_isAdmin()`; any authenticated user sees the toolbar.

### Fixed

- **Public-page link from the editor** — "Публичный вид" now opens `/page/<date>/<time>` (the same URL the old project used).
- **LLM chat WebSocket** — `/core/engine/lib/word/llm/ws/{page_id}` now accepts any authenticated user; the previous `is_superadmin` check caused browsers to see close code 1006 (the socket was refused before `accept()`).
- **`nav_id` propagation to child components** — `engine.js` now walks the whole component tree, so `word` and `pages` get `nav_id` instead of only the root `base` component.

---

## Русский

### Добавлено

- **Привязка страниц и медиа к `nav_id`.** Страницы теперь принадлежат экземпляру `nav` (`Page.nav_id` → `nav.id`), а не модулю. Одна и та же пара `<date>/<time>` может существовать в разных nav без коллизий.
- **`?nav_id=<id>` во всех write-эндпоинтах** `pages`, `word`, `editor` (effects/images) и `llm` (presets, chat). Read-эндпоинты принимают его опционально.
- **`_resolve_nav_id()` в `pages/route.py`, `word/route.py`, `base/assets/route.py`** — если `nav_id` не передан явно, бэк резолвит первый nav текущего пользователя (`ORDER BY id ASC`).
- **`ensure_default_nav()` в `utils/sqlite.py`** — идемпотентно создаёт «Каталог статей» для admin при первом старте (после `ensure_modules`).
- **Флаг `USER_AUTO_CREATE_NAV`** — если true, каждому новому пользователю создаётся свой nav, указывающий на модуль `default`.
- **Автосоздание nav при регистрации** в `core/auth/register/service.py` (под флагом `USER_AUTO_CREATE_NAV`).
- **Проброс nav на фронт** — `engine_module` резолвит первый nav из сессии и передаёт его через `<body data-nav-id>`; `CoreEngine._injectRuntimeProps()` обходит всё дерево компонентов, поэтому `word` и `pages` получают `props.nav_id`.

### Изменено

- **`Page.mod_id` → `Page.nav_id`** (миграция `dcccfce2b645`). Существующие страницы переносятся на nav admin.
- **Структура медиа** — `media/<nav_id>/` вместо `media/<module_name>/` (для `word`, `base/assets` и Asset Manager в GrapesJS).
- **URL публичной страницы** — `/page/<date>/<time>`, как раньше, без `nav_id` в пути. Админ-просмотр сохраняет URL движка `/core/engine/<module>/page/<date>/<time>`.
- **Права ослаблены с «только суперадмин» до «любой авторизованный»** в `pages/route.py`, `word/route.py`, `word/editor/effects/route.py`, `word/editor/images/route.py`, `word/llm/route.py`, `base/assets/route.py`. Настройки (`base/setup/llm/*`) остаются только для суперадмина.
- **Проверка прав на фронте** — `Pages._canEdit()` и `Word._canEdit()` вместо `_isAdmin()`; тулбар видят все авторизованные.

### Исправлено

- **Ссылка «Публичный вид» из редактора** — теперь открывается `/page/<date>/<time>` (тот же URL, что был в старом проекте).
- **WebSocket чата LLM** — `/core/engine/lib/word/llm/ws/{page_id}` теперь пускает любого авторизованного; прежняя проверка `is_superadmin` приводила к тому, что браузер видел код 1006 (сокет обрывался до `accept()`).
- **Проброс `nav_id` в дочерние компоненты** — `engine.js` теперь обходит всё дерево, поэтому `word` и `pages` получают `nav_id`, а не только корневой `base`.