# neurocad 0.1.22

Release date: 2026-09-27

---

## English

### Added

- **Logo generation from the editor** — the "Логотип" media field in the page form now has a **"Генерировать"** button. It sends the page title and description to the LLM, receives an SVG logo, saves it to the images registry, and fills the field with the resulting URL. The prompt is tailored for compact square symbols (not illustrations).
- **`/editor/images/generate` endpoint** — a thin HTTP wrapper around the `generate_logo` agent and `CoreEngineLibWordImagesService`. Returns `{id, file, url, bytes}` for the freshly generated image.
- **Demo data on first start** — a demo project (modules, pages, navigation, access) ships with the package and is imported on the very first run. The package contains SQL dumps under `neurocad/base/demo/`. On the first start they are copied to `base/demo/` next to the database, then imported. Users who do not want demo can either keep the database and remove `base/demo/`, or delete both `base/demo/` and `base/neurocad.db` and re-run.
- **`.env.example` in the package** — the `.env` template now lives in `neurocad/.env.example` (injected via `force-include`). On the first run it is copied to `./.env`. The template in the package is the single source of truth: `paths.py` no longer hard-codes the `.env` body.

### Changed

- **Editor form extension point** — `BaseCardsEdit` gained a generic `extraButtons` option for media fields. Callers declare additional buttons (label, className, onClick) and get a context object with `getValue`, `getAllValues`, `setValue`, `showError`, `clearError`. `BaseCardsEdit` itself stays generic; no logo-specific logic inside.
- **`/editor/images` API** — added `POST /editor/images/generate`. The existing endpoints (`GET`, `POST`, `DELETE`) are unchanged.

### Fixed

- **SVG save path in `step.py`** — the import is `from ...editor.images.store import save_generated_svg` (three dots, into `word/editor/images/`), not `...images.store`. Previously every generated illustration was silently dropped.
- **`DataLoader` empty `<p>` cleanup** — `child.removed` is now called as a method (`child.removed()`), not used as a boolean property, so the placeholder `<p></p>` is actually removed.

---

## Русский

### Добавлено

- **Генерация логотипа из редактора** — в форме страницы у поля «Логотип» появилась кнопка **«Генерировать»**. Она отправляет заголовок и описание страницы в LLM, получает SVG-логотип, сохраняет его в реестр изображений и подставляет полученный URL в поле. Промпт заточен под компактные квадратные символы (не иллюстрации).
- **Эндпоинт `/editor/images/generate`** — тонкая HTTP-обёртка над агентом `generate_logo` и `CoreEngineLibWordImagesService`. Возвращает `{id, file, url, bytes}` для сгенерированного изображения.
- **Демо-данные при первом старте** — демо-проект (модули, страницы, навигация, доступы) едет вместе с пакетом и импортируется при первом запуске. В пакете лежат SQL-дампы под `neurocad/base/demo/`. При первом старте они копируются в `base/demo/` рядом с базой и импортируются. Если демо не нужно — можно оставить базу и удалить `base/demo/`, либо удалить и `base/demo/`, и `base/neurocad.db`, и запустить заново.
- **`.env.example` в пакете** — шаблон `.env` теперь лежит в `neurocad/.env.example` (кладётся через `force-include`). При первом запуске копируется в `./.env`. Шаблон в пакете — единственный источник правды: `paths.py` больше не содержит хардкод тела `.env`.

### Изменено

- **Точка расширения формы редактора** — в `BaseCardsEdit` появилась универсальная опция `extraButtons` для media-полей. Вызывающий код объявляет дополнительные кнопки (label, className, onClick) и получает контекст с `getValue`, `getAllValues`, `setValue`, `showError`, `clearError`. `BaseCardsEdit` остаётся универсальным — никакой логики, специфичной для логотипа.
- **API `/editor/images`** — добавлен `POST /editor/images/generate`. Существующие эндпоинты (`GET`, `POST`, `DELETE`) не изменились.

### Исправлено

- **Путь сохранения SVG в `step.py`** — импорт `from ...editor.images.store import save_generated_svg` (три точки, в `word/editor/images/`), а не `...images.store`. Раньше каждая сгенерированная иллюстрация молча терялась.
- **Удаление пустого `<p>` в `DataLoader`** — `child.removed` теперь вызывается как метод (`child.removed()`), а не используется как булево, поэтому placeholder `<p></p>` действительно удаляется.