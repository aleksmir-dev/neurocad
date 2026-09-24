# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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