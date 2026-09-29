# neurocad 0.1.28

Release date: 2026-09-30

---

## English

### Added

- **Import and export for the editor.** The editor can now exchange pages with the outside world in three formats:
  - **Import from `.grp` archive** — a ZIP file with the full GrapesJS project:
    - `index.html` — HTML components;
    - `index.css` — custom CSS from the Style Manager;
    - `index.json` — full GrapesJS project data (preferred on import);
    - `media/*` — asset files referenced by the page.
    Loading a `.grp` restores the page completely — components, styles, and images (as data-URI).
  - **Import from `.html` file** — plain HTML document with optional `<style>` blocks. The `<style>` contents are extracted into the editor's CSS; the body HTML is inserted as components.
  - **Import from URL** — the backend fetches a remote page, inlines every `<link rel="stylesheet">` into an inline `<style>` (optionally downloads `<img>` and embeds them as data-URI), and returns the result to the editor. Guards against self-referencing URLs and non-http schemes.
  - **Export to standalone HTML** — a single `.html` file with all CSS inlined in a `<style>` block. Ready to upload to any hosting, open from disk, or share — no server required, no external CSS.
  - **Export to `.grp` archive** — the same ZIP layout as above. Importable into any NeuroCad instance via the Import dialog. Media referenced by the page is pulled from `media/<nav_id>/` and written into the archive.
- **New editor API under `/core/engine/lib/word/editor/io/`**:
  - `POST /import/url` — fetch a remote page (JSON body: `{ url, include_images }`);
  - `POST /import/file` — parse an uploaded `.grp` or `.html` (multipart);
  - `GET  /export/html/{page_id}` — download a standalone HTML document;
  - `GET  /export/grp/{page_id}`  — download a `.grp` archive.
  All endpoints require an authenticated user; the requested `page_id` must belong to the current user's nav.
- **Import / Export buttons in the editor toolbar.** Two new icons open the corresponding dialogs. Both dialogs follow the Base modal visual language (overlay + window + title bar + actions).
- **Automatic cache-busting for the editor UI CSS.** `io.css` joined the `cssFiles` list in `editor/grapes/index.js`, so its URL always carries the current `?v=<static_version>`.

### Changed

- **Editor toolbar spacing.** Buttons in the toolbar are now separated by `8px` (was `2px`); separator margins increased to `8px`; device-switcher gap raised to `6px`. Icons have more breathing room and the layout matches modern editor UIs.
- **Inline SVG support in the toolbar.** The toolbar CSS now styles inline `<svg>` icons (used by the Import / Export buttons) — they inherit `currentColor` from the button, work in hover and active states, and need no external SVG files.
- **Editor modal pattern aligned with Base modals.** The Import / Export dialogs are now singletons — created once in the constructor and toggled via the `.active` class. This matches the pattern used by `BaseModalMessage` / `BaseModalConfirm` and eliminates the "modal visible below the page" issue that occurred when the overlay was appended with `display: flex` on every open.

### Fixed

- **Import / Export dialogs stayed visible in the page flow.** Root cause — `io.css` was not loaded by the editor (404), so `.core-engine-lib-word-editor-io { display: none }` never applied. Fixed by adding `io.css` to `cssFiles` and rebuilding the dialogs as singletons with `.active` toggling.
- **Editor dialogs no longer block the canvas after import or export.** Each dialog now removes its `.active` class when finished (or on cancel / Escape) instead of leaving an inert overlay in the DOM.

---

## Русский

### Добавлено

- **Импорт и экспорт в редакторе.** Редактор теперь умеет обмениваться страницами с внешним миром в трёх форматах:
  - **Импорт из архива `.grp`** — ZIP-файл с полным проектом GrapesJS:
    - `index.html` — HTML-компоненты;
    - `index.css` — кастомный CSS из Style Manager;
    - `index.json` — полное состояние проекта GrapesJS (приоритет при импорте);
    - `media/*` — файлы ресурсов, на которые ссылается страница.
    Загрузка `.grp` восстанавливает страницу полностью — компоненты, стили и картинки (как data-URI).
  - **Импорт из файла `.html`** — обычный HTML-документ с возможными блоками `<style>`. Содержимое `<style>` выносится в CSS редактора; HTML тела вставляется как компоненты.
  - **Импорт по URL** — бэкенд скачивает удалённую страницу, встраивает все `<link rel="stylesheet">` в инлайн `<style>` (опционально скачивает `<img>` и встраивает их как data-URI) и возвращает результат редактору. Защита от self-referencing URL и не-http схем.
  - **Экспорт в самостоятельный HTML** — один файл `.html` со всем CSS, встроенным в `<style>`. Готов к загрузке на любой хостинг, открытию с диска или отправке — без сервера, без внешних CSS.
  - **Экспорт в архив `.grp`** — та же ZIP-структура, что выше. Импортируется в любой инстанс NeuroCad через диалог «Импорт». Медиа, на которые ссылается страница, берутся из `media/<nav_id>/` и упаковываются в архив.
- **Новый API редактора под `/core/engine/lib/word/editor/io/`**:
  - `POST /import/url` — скачать удалённую страницу (JSON: `{ url, include_images }`);
  - `POST /import/file` — разобрать загруженный `.grp` или `.html` (multipart);
  - `GET  /export/html/{page_id}` — скачать HTML-документ;
  - `GET  /export/grp/{page_id}`  — скачать архив `.grp`.
  Все эндпоинты требуют аутентификации; запрошенный `page_id` должен принадлежать nav текущего пользователя.
- **Кнопки «Импорт» / «Экспорт» в тулбаре редактора.** Две новые иконки открывают соответствующие диалоги. Оба диалога оформлены в стиле Base-модалок (overlay + окно + заголовок + панель действий).
- **Автоматический cache-busting для UI-CSS редактора.** `io.css` добавлен в `cssFiles` в `editor/grapes/index.js` — его URL теперь всегда несёт актуальный `?v=<static_version>`.

### Изменено

- **Отступы в тулбаре редактора.** Кнопки теперь разнесены на `8px` (было `2px`); отступы разделителя увеличены до `8px`; внутренний зазор переключателя устройств — `6px`. Иконкам стало просторнее, раскладка соответствует современным редакторам.
- **Поддержка inline SVG в тулбаре.** CSS тулбара теперь стилизует inline `<svg>`-иконки (используются кнопками «Импорт» / «Экспорт») — они наследуют `currentColor` от кнопки, работают в hover и active состояниях, не требуют внешних SVG-файлов.
- **Схема модалок редактора приведена к Base-модалкам.** Диалоги «Импорт» / «Экспорт» стали синглтонами — создаются один раз в конструкторе и переключаются через класс `.active`. Это соответствует паттерну `BaseModalMessage` / `BaseModalConfirm` и устраняет проблему «модалка видна ниже страницы», которая возникала, когда overlay добавлялся с `display: flex` при каждом открытии.

### Исправлено

- **Диалоги «Импорт» / «Экспорт» оставались видимыми в потоке страницы.** Причина — `io.css` не загружался редактором (404), поэтому `.core-engine-lib-word-editor-io { display: none }` не применялся. Исправлено добавлением `io.css` в `cssFiles` и переработкой диалогов в синглтоны с переключением `.active`.
- **Диалоги редактора больше не блокируют холст после импорта или экспорта.** Каждый диалог снимает класс `.active` по завершении (или по «Отмена» / Escape), а не оставляет инертный overlay в DOM.