# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.24] - 2026-09-27

### Fixed
- Demo import: statements are split by `_split_sql_statements()` and run via `exec_driver_sql()`, so `pages.sql` with multi-line HTML `INSERT`s imports correctly (supersedes the incomplete 0.1.23 fix).

## [0.1.23] - 2026-09-27

### Added
- Logo generation from the editor: the "Логотип" field has a "Генерировать" button that asks the LLM for an SVG, stores it, and fills the URL.
- `POST /editor/images/generate` — endpoint around the `generate_logo` agent and `CoreEngineLibWordImagesService`.
- Demo data on first start: `neurocad/base/demo/` is copied to `base/demo/` and imported once; delete the folder or the DB to opt out.
- `.env.example` in the package (via `force-include`), copied to `./.env` on first run; `paths.py` no longer hard-codes it.
- `BaseCardsEdit.extraButtons` — media fields accept `[{label, className, onClick}]` with a context object (`getValue`, `getAllValues`, `setValue`, `showError`, `clearError`).

### Changed
- `paths.py` — `ensure_workdirs()` copies `base/demo/` from the package and creates `.env` from `neurocad/.env.example`.

### Fixed
- `demo_import.py` — `.cursor()` was called on a `sqlalchemy.engine.Connection` (no such method); switched to `driver_connection` (later superseded by 0.1.24).
- `step.py` — SVG save import is `...editor.images.store`, not `...images.store`; illustrations were silently dropped.
- `DataLoader` — `child.removed` is now called as a method, so the empty `<p></p>` placeholder is actually removed.

## [0.1.21] - 2026-09-27

### Added
- Effects palette for the editor, backed by `editor/effects/registry.json` and served via `GET /editor/effects`; applied as plain `fx-*` CSS classes.
- LLM-generated effects: the model drafts `{id, label, hint, css, media}`, the editor previews it, the user confirms.
- Images palette: `GET /editor/images` serves `editor/images/registry.json`; clicking an image inserts an `<img>` block.
- LLM illustrations: `step_svg_illustrations` saves every generated SVG into the images registry.
- Page-level CSS builder (`word/css_builder.py`) assembles `content.css` + used `blocks/*.css` + `fx/*.css` + custom CSS, frozen in `Page.css`.
- Blocks manifest as JSON (`editor/blocks/manifest.json`) is the single source of truth; `manifest.js` is a thin wrapper.
- `DataLoader.removeEmptyPlaceholder()` removes the empty `<p></p>` after load and rollback.

### Changed
- Public page loads only `public.css` + `pages/<id>.css`; editor CSS is frozen at publish time.
- Editor sub-APIs are mounted under the parent `editor` router.
- `BlocksRegistry` pre-creates five categories (`Элементы`, `Секции`, `Разметка`, `Эффекты`, `Изображения`).
- Planner prompt excludes layout blocks on both client and server.

### Removed
- `effects/manifest.js` legacy fallback; the API is the single source of truth.
- Static `blockCssUrls` import in `word.js`; replaced by dynamic versioned `import()`.

### Fixed
- `DataLoader` — `child.removed` called as a method; the placeholder was never removed.
- Empty placeholder cleanup is deferred by two `requestAnimationFrame`s (GrapesJS fills the wrapper asynchronously).
- SVG save path in `step.py` — `from ...editor.images.store import ...` (three dots).

## [0.1.20] - 2026-09-24

### Added
- LLM settings UI (`setup/llm`) for DeepSeek, OpenAI, YandexGPT, GigaChat, Google Gemini; superadmin-only.
- `Setting` key-value table with JSON values; LLM config under `domain='neurocad', subsys='setup', module='llm', key='llm'`.
- Fernet encryption for `api_key`, `auth_key`, `ca_pem` (`NEUROCAD_SECRET_KEY`); skipped with a UI warning if the key is missing.
- Setup landing page (`setup/setup.js`) with navigation to sections.
- Menu item "Настройки", visible to superadmins.
- `Base.renderInArea()` — shared renderer into `area-center`.
- `ensure_css_file()` — atomic page CSS writer with content-hash cache-busting; served under `/static/core/engine/lib/pages/public/pages/<id>.css`.

### Changed
- Page CSS split into `Page.css` (DB source of truth) + derived `static/.../pages/<id>.css`; legacy `<style>` in `content` handled via `split_style_from_html`.
- `BaseSetup` renders into `area-center` through `Base.renderInArea()`.
- DeepSeek tokenizer uses `cl100k_base` directly; dead `encoding_for_model()` calls removed.

### Removed
- `LLMSetting` model and `llm` table — replaced by `Setting`.

### Fixed
- Page CSS cache-busting `?v=<hash>` now reflects content changes, not restarts.

## [0.1.19] - 2026-09-23

### Added
- Base templates can be extended by child pages; content mounts into `[data-slot="content"]`, otherwise the template is a read-only preview.

### Changed
- Base blocks refactor: unified `blocks/manifest.js`, dynamic versioned imports, CSS scoped to `.core-engine-lib-word-blocks`, categories pre-created with `open: false`.

## [0.1.18] - 2026-09-22

### Added
- Initial public release: FastAPI backend, SQLite storage, BaseCards widgets, GrapesJS Word editor, LLM chat panel, presets, media library, page history.

[0.1.24]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.23...v0.1.24
[0.1.23]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.22...v0.1.23
[0.1.21]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.20...v0.1.21
[0.1.19]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.18...v0.1.19
[0.1.18]: https://github.com/aleksmir-dev/neurocad/releases/tag/v0.1.18