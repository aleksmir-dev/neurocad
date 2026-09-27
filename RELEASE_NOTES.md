# neurocad 0.1.23

Release date: 2026-09-27

---

## English

### Added

- **Logo generation from the editor** — the "Логотип" media field in the page form now has a **"Генерировать"** button. It sends the page title and description to the LLM, receives an SVG logo, saves it to the images registry, and fills the field with the resulting URL. The prompt is tailored for compact square symbols (not illustrations), see `llm/prompts/logo.py`; the agent lives in `llm/agent/generate_logo.py`.
- **`/editor/images/generate` endpoint** — a thin HTTP wrapper around the `generate_logo` agent and `CoreEngineLibWordImagesService`. Returns `{id, file, url, bytes}` for the freshly generated image.
- **Demo data on first start** — a demo project (modules, pages, navigation, access) ships with the package under `neurocad/base/demo/`, is copied to `base/demo/` next to the database on first run, and imported once. Users can keep the DB and delete `base/demo/`, or delete both `base/demo/` and `base/neurocad.db` to get a clean DB without demo.
- **`.env.example` in the package** — the `.env` template now lives in `neurocad/.env.example` (injected via `force-include`). On the first run it is copied to `./.env`. The template in the package is the single source of truth: `paths.py` no longer hard-codes the `.env` body.
- **`BaseCardsEdit` extension point** — media fields now accept `extraButtons: [{label, className, onClick}]`. The `onClick` receives a context object with `getValue`, `getAllValues`, `setValue`, `showError`, `clearError`, `button`. No logo-specific logic inside `BaseCardsEdit`.

### Changed

- **`/editor/images` API** — added `POST /editor/images/generate`. The existing endpoints (`GET`, `POST`, `DELETE`) are unchanged.
- **`paths.py`** — `ensure_workdirs()` copies `base/demo/` from the package into the working directory on the first run and creates `.env` from `neurocad/.env.example` instead of an inline string.

### Fixed

- **Demo import on first start (`neurocad/utils/dbsqlite/demo_import.py`)** — `_execute_sql_file()` passed a `sqlalchemy.engine.Connection` to the raw-DBAPI code path and called `.cursor()` on it. SQLAlchemy's `Connection` has no `.cursor()` method, so the very first demo SQL dump (`modules.sql`) failed with `'Connection' object has no attribute 'cursor'` and the manifest was never marked `applied: true`, which caused the import to be retried (and to fail again) on every start. The importer now reaches the underlying DBAPI connection via `sync_conn.connection.driver_connection` before calling `.cursor()`. This keeps the original intent — raw `PRAGMA` statements must take effect — while working correctly on SQLAlchemy 2.x.
- **SVG save path in `step.py`** — the import is `from ...editor.images.store import save_generated_svg` (three dots, into `word/editor/images/`), not `...images.store`. Previously every generated illustration was silently dropped.
- **`DataLoader` empty `<p>` cleanup** — `child.removed` is now called as a method (`child.removed()`), not used as a boolean property, so the placeholder `<p></p>` is actually removed on first load and after rollback.

---

## Русский

### Добавлено

- **Генерация логотипа из редактора** — в форме страницы у поля «Логотип» появилась кнопка **«Генерировать»**. Она отправляет заголовок и описание страницы в LLM, получает SVG-логотип, сохраняет его в реестр изображений и подставляет полученный URL в поле. Промпт заточен под компактные квадратные символы (не иллюстрации), см. `llm/prompts/logo.py`; агент — в `llm/agent/generate_logo.py`.
- **Эндпоинт `/editor/images/generate`** — тонкая HTTP-обёртка над агентом `generate_logo` и `CoreEngineLibWordImagesService`. Возвращает `{id, file, url, bytes}` для сгенерированного изображения.
- **Демо-данные при первом старте** — демо-проект (модули, страницы, навигация, доступы) едет вместе с пакетом под `neurocad/base/demo/`, при первом запуске копируется в `base/demo/` рядом с базой и импортируется один раз. Если демо не нужно — можно оставить базу и удалить `base/demo/`, либо удалить и `base/demo/`, и `base/neurocad.db`, и запустить заново.
- **`.env.example` в пакете** — шаблон `.env` теперь лежит в `neurocad/.env.example` (кладётся через `force-include`). При первом запуске копируется в `./.env`. Шаблон в пакете — единственный источник правды: `paths.py` больше не содержит хардкод тела `.env`.
- **Точка расширения формы редактора** — в `BaseCardsEdit` появилась универсальная опция `extraButtons` для media-полей. Вызывающий код объявляет дополнительные кнопки (label, className, onClick) и получает контекст с `getValue`, `getAllValues`, `setValue`, `showError`, `clearError`, `button`. `BaseCardsEdit` остаётся универсальным — никакой логики, специфичной для логотипа.

### Изменено

- **API `/editor/images`** — добавлен `POST /editor/images/generate`. Существующие эндпоинты (`GET`, `POST`, `DELETE`) не изменились.
- **`paths.py`** — `ensure_workdirs()` копирует `base/demo/` из пакета в рабочий каталог при первом запуске и создаёт `.env` из `neurocad/.env.example`, а не из inline-строки.

### Исправлено

- **Импорт демо-данных при первом старте (`neurocad/utils/dbsqlite/demo_import.py`)** — `_execute_sql_file()` передавал в raw-DBAPI-код `sqlalchemy.engine.Connection` и вызывал у него `.cursor()`. У `Connection` в SQLAlchemy такого метода нет, поэтому уже первый SQL-дамп (`modules.sql`) падал с ошибкой `'Connection' object has no attribute 'cursor'`, а манифест не помечался `applied: true` — из-за чего импорт повторялся (и снова падал) при каждом запуске. Теперь импортёр достаёт настоящее DBAPI-соединение через `sync_conn.connection.driver_connection` и уже у него вызывает `.cursor()`. Исходный замысел сохранён — raw `PRAGMA` должны применяться, — но код корректно работает на SQLAlchemy 2.x.
- **Путь сохранения SVG в `step.py`** — импорт `from ...editor.images.store import save_generated_svg` (три точки, в `word/editor/images/`), а не `...images.store`. Раньше каждая сгенерированная иллюстрация молча терялась.
- **Удаление пустого `<p>` в `DataLoader`** — `child.removed` теперь вызывается как метод (`child.removed()`), а не используется как булево, поэтому placeholder `<p></p>` действительно удаляется при первой загрузке и после rollback.