# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.23] - 2026-09-27

### Added
- Logo generation from the editor — the "Логотип" media field in the page form now has a "Генерировать" button. It sends the page title and description to the LLM, receives an SVG logo, saves it to the images registry, and fills the field with the resulting URL. Prompt built for compact square symbols (see `llm/prompts/logo.py`), agent in `llm/agent/generate_logo.py`.
- `POST /editor/images/generate` — thin HTTP endpoint around the `generate_logo` agent and `CoreEngineLibWordImagesService`. Returns `{id, file, url, bytes}`.
- Demo data on first start — demo project (modules, pages, navigation, access) ships inside the package under `neurocad/base/demo/`, is copied to `base/demo/` next to the database on first run, and imported once. Users can keep the DB and delete `base/demo/`, or delete both `base/demo/` and `base/neurocad.db` to get a clean DB without demo.
- `.env.example` in the package — the `.env` template moved into `neurocad/.env.example` (injected via `force-include`) and is copied to `./.env` on first run. `paths.py` no longer hard-codes the `.env` body; the package file is the single source of truth.
- `BaseCardsEdit` extension point — media fields now accept `extraButtons: [{label, className, onClick}]`. The onClick receives a context object with `getValue`, `getAllValues`, `setValue`, `showError`, `clearError`, `button`. No logo-specific logic inside `BaseCardsEdit`.

### Changed
- `/editor/images` API — added `POST /editor/images/generate`. Existing endpoints (`GET`, `POST`, `DELETE`) unchanged.
- `paths.py` — `ensure_workdirs()` copies `base/demo/` from the package into the working directory on the first run and creates `.env` from `neurocad/.env.example` instead of an inline string.

### Fixed
- `demo_import.py` — `_execute_sql_file()` called `.cursor()` on a `sqlalchemy.engine.Connection` (what `run_sync` actually passes), which has no such method. The first demo dump failed with `'Connection' object has no attribute 'cursor'`, and because the manifest was never marked `applied: true`, the importer retried and failed on every start. The raw DBAPI connection is now obtained via `sync_conn.connection.driver_connection`, so the original intent (raw `PRAGMA` must take effect) is preserved and the import works on SQLAlchemy 2.x.
- `step.py` — SVG save import is `from ...editor.images.store import save_generated_svg` (three dots, into `word/editor/images/`), not `...images.store`. Previously every generated illustration was dropped silently.
- `DataLoader` empty `<p>` cleanup — `child.removed` is now called as a method (`child.removed()`), not used as a boolean property. The placeholder `<p></p>` is now actually removed on first load and after rollback.

[0.1.23]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.22...v0.1.23

## [0.1.22] - 2026-09-27
...

## [0.1.23] - 2026-09-27

### Added
- Logo generation from the editor — the "Логотип" media field in the page form now has a "Генерировать" button. It sends the page title and description to the LLM, receives an SVG logo, saves it to the images registry, and fills the field with the resulting URL. Prompt built for compact square symbols (see `llm/prompts/logo.py`), agent in `llm/agent/generate_logo.py`.
- `POST /editor/images/generate` — thin HTTP endpoint around the `generate_logo` agent and `CoreEngineLibWordImagesService`. Returns `{id, file, url, bytes}`.
- Demo data on first start — demo project (modules, pages, navigation, access) ships inside the package under `neurocad/base/demo/`, is copied to `base/demo/` next to the database on first run, and imported once. Users can keep the DB and delete `base/demo/`, or delete both `base/demo/` and `base/neurocad.db` to get a clean DB without demo.
- `.env.example` in the package — the `.env` template moved into `neurocad/.env.example` (injected via `force-include`) and is copied to `./.env` on first run. `paths.py` no longer hard-codes the `.env` body; the package file is the single source of truth.
- `BaseCardsEdit` extension point — media fields now accept `extraButtons: [{label, className, onClick}]`. The onClick receives a context object with `getValue`, `getAllValues`, `setValue`, `showError`, `clearError`, `button`. No logo-specific logic inside `BaseCardsEdit`.

### Changed
- `/editor/images` API — added `POST /editor/images/generate`. Existing endpoints (`GET`, `POST`, `DELETE`) unchanged.
- `paths.py` — `ensure_workdirs()` copies `base/demo/` from the package into the working directory on the first run and creates `.env` from `neurocad/.env.example` instead of an inline string.

### Fixed
- `step.py` — SVG save import is `from ...editor.images.store import save_generated_svg` (three dots, into `word/editor/images/`), not `...images.store`. Previously every generated illustration was dropped silently.
- `DataLoader` empty `<p>` cleanup — `child.removed` is now called as a method (`child.removed()`), not used as a boolean property. The placeholder `<p></p>` is now actually removed on first load and after rollback.

[0.1.22]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.21...v0.1.22

## [0.1.21] - 2026-09-27

### Added
- Effect library — a full effects palette for the GrapesJS editor, backed by `editor/effects/registry.json` and served through `GET /editor/effects`. Effects are applied as plain CSS classes (`fx-*`) on the selected element; no CSS is generated on the client.
- LLM-generated effects — the "create effect" flow asks the model for a draft (`id`, `label`, `hint`, `css`, `media`), the editor previews it live, and the user confirms to save. The new effect is written to both the model tree and the static mirror.
- Images palette — a new "Изображения" category in the block panel, backed by `editor/images/registry.json` and served through `GET /editor/images`. Clicking an image inserts it into the canvas as an `<img>` block.
- LLM-generated illustrations — step 4 of the create flow (`step_svg_illustrations`) now saves every generated SVG into the images registry, so illustrations accumulate in the palette across runs.
- One-off importer — `test/import_svgs_from_db.py` extracts large inline SVGs from all pages in `neurocad.db` and adds them to the images registry, skipping icons (< 2 KB), duplicates (by content hash), and unsafe SVGs (`<script>`, event handlers, external hrefs).
- Page-level CSS builder — `word/css_builder.py` assembles the full CSS of a page at save time: `content.css` + used `blocks/*.css` + used `fx/*.css` + custom CSS. The result is frozen in `Page.css` and served as `pages/<id>.css`.
- Blocks manifest as JSON — `editor/blocks/manifest.json` is now the single source of truth (blocks + their root classes); `manifest.js` is a thin wrapper over it.
- `removeEmptyPlaceholder()` in `DataLoader` — removes the empty `<p></p>` placeholder right after the initial data load (and after rollback), so a freshly opened page has no stray paragraph.

### Changed
- Public page CSS — the public page no longer loads `content.css`, `fx/*.css`, or `blocks/*.css` from the editor at runtime. It loads only `public.css` + `pages/<id>.css`. Updating an effect or a block in a future version of the constructor cannot change an already-published page.
- Effects/Images services — all editor sub-APIs are mounted under the parent `editor` router (`/core/engine/lib/word/editor/effects`, `.../images`).
- `BlocksRegistry` — pre-creates five categories (`Элементы`, `Секции`, `Разметка`, `Эффекты`, `Изображения`) with `open: false`, then registers `EffectBlocks` and `ImageBlocks`.
- Planner prompt (`build_plan_prompt`) — layout blocks (category "Разметка") are excluded both on the client (`catalog.js`) and on the server (belt-and-suspenders), so the model composes pages from ready-made sections and elements only.

### Removed
- `effects/manifest.js` — legacy fallback for the effects list. The API (`GET /editor/effects`) is the single source of truth; `registry.js` no longer keeps a bundled fallback.
- Static `import { blockCssUrls } from './editor/blocks/manifest.js'` in `word.js` — replaced with a dynamic, versioned `import(...)` inside `_loadCSS()`.

### Fixed
- `DataLoader` — `child.removed` is now called as a method (`child.removed()`), not used as a boolean property. The old check silently skipped every component, so the placeholder `<p></p>` was never removed.
- Empty placeholder cleanup — deferred by two `requestAnimationFrame`s, because GrapesJS fills the wrapper asynchronously after `setComponents` / `loadProjectData`. A synchronous check found nothing.
- SVG save path — `step.py` imports `save_generated_svg` via `from ...editor.images.store import ...` (three dots, into `word/editor/images/`), not `...images.store`. The wrong path silently dropped every generated SVG.

[0.1.21]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.20...v0.1.21

## [0.1.20] - 2026-09-24

### Added
- LLM settings UI (`setup/llm`) — manage API keys, base URLs, models, and limits for DeepSeek, OpenAI, YandexGPT, GigaChat, and Google Gemini from the admin panel. Access is restricted to superadmins.
- Settings storage: a new `Setting` key-value table with JSON values. LLM settings are stored under `domain='neurocad', subsys='setup', module='llm', key='llm'`.
- Symmetric encryption for secrets (`neurocad/utils/crypto.py`, Fernet). API keys (`api_key`, `auth_key`, `ca_pem`) are encrypted at rest with `NEUROCAD_SECRET_KEY`. If the key is missing or invalid, encryption is skipped and the UI shows a warning.
- Setup page (`setup/setup.js`) — landing page with navigation to setup sections. Currently: LLM settings.
- Menu item "Настройки" — visible to superadmins only.
- `Base.renderInArea()` — shared method for rendering a component into `area-center` (profile, setup, and future pages).
- `ensure_css_file()` utility in `neurocad/utils/css.py` — writes page CSS to disk (atomic, with content-hash cache-busting) and returns the URL with `?v=<hash>`. The page CSS file is now served under the module's own namespace: `/static/core/engine/lib/pages/public/pages/<id>.css`.

### Changed
- Page CSS is now split into a separate `Page.css` field (DB source of truth), with `static/.../pages/<id>.css` as a derivative file. Legacy pages (CSS embedded in `content` as `<style>`) are handled transparently via `split_style_from_html` — extracted on the fly for rendering, not written back to the DB.
- `BaseSetup` renders setup pages into `area-center` through `Base.renderInArea()`; auth pages (login/register/profile) can be migrated to the same method over time.
- DeepSeek tokenizer: removed dead `encoding_for_model()` calls (tiktoken does not ship DeepSeek encodings); `cl100k_base` is used directly.

### Removed
- `LLMSetting` model and `llm` table — superseded by the generic `Setting` key-value storage.

### Fixed
- Page CSS cache-busting: `?v=<hash>` now reflects content changes, not server restarts.

## [0.1.19] - 2026-09-23

### Added
- Base template extension: a base template can be extended by child pages. The base template is rendered as a wrapper, and the child page's content is mounted into the `[data-slot="content"]` region. If the template has no slot, it is shown as a read-only preview.

### Changed
- Base blocks refactoring: unified block manifest (`blocks/manifest.js`), dynamic versioned imports for block modules, block CSS scoped to `.core-engine-lib-word-blocks`, and category pre-creation with `open: false`.

## [0.1.18] - 2026-09-22

### Added
- Initial public release of the core engine: FastAPI backend, SQLite storage, BaseCards widget system, Word editor (GrapesJS integration), LLM chat panel, presets, media library, page history.

[0.1.19]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.18...v0.1.19
[0.1.18]: https://github.com/aleksmir-dev/neurocad/releases/tag/v0.1.18