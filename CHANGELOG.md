# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.28] - 2026-09-30

### Added
- Import pages from `.grp` archives, `.html` files or remote URLs, and export the current page as a standalone `.html` document or a `.grp` archive, with new Import / Export buttons in the editor toolbar and a corresponding API under `/core/engine/lib/word/editor/io/`.

### Changed
- Editor toolbar buttons got more breathing room (`gap: 8px`), inline SVG icons are now supported, and the Import / Export dialogs follow the Base-modal singleton pattern (`.active` toggling).

### Fixed
- Import / Export dialogs no longer render below the page — `io.css` is now loaded by the editor (`cssFiles` in `editor/grapes/index.js`), and the dialogs are proper singletons.

## [0.1.27] - 2026-09-29

### Added
- Article catalog block for GrapesJS, a hybrid `href` trait with a page picker, and `GET /core/engine/lib/pages/my-list`.

### Changed
- `grapes.js` split into modules under `editor/grapes/`; `<body>` wrapper cleanup and header removal on public pages; footer layout and content updated.

### Fixed
- Balance guard in the LLM WebSocket dispatcher and logo generation; token accounting in all five providers; lazy `cleanup_stale()`; Trial tariff label.

### Removed
- Monolithic `editor/grapes.js`.

## [0.1.26] - 2026-09-27

### Added
- Demo pages (10) importable into an existing DB via `INSERT`-only SQL, scoped to `nav_id = 1`.

## [0.1.25] - 2026-09-27

### Added
- `Page.nav_id` — pages scoped to a nav instance; `?nav_id=` on write endpoints; `ensure_default_nav()`; `USER_AUTO_CREATE_NAV`.

### Changed
- `Page.mod_id` → `Page.nav_id`; media layout `media/<nav_id>/`; permissions relaxed from superadmin to any authenticated user.

### Fixed
- Public page URL, LLM chat WebSocket auth, `nav_id` propagation to child components.

## [0.1.24] - 2026-09-27

### Fixed
- Demo import: statements split by `_split_sql_statements()` and run via `exec_driver_sql()`, so multi-line HTML `INSERT`s import correctly.

## [0.1.23] - 2026-09-27

### Added
- Logo generation from the editor (`POST /editor/images/generate`); demo data on first start; `.env.example` shipped in the package; `BaseCardsEdit.extraButtons`.

### Changed
- `paths.py` — `ensure_workdirs()` copies `base/demo/` and creates `.env`.

### Fixed
- `demo_import.py` driver_connection call; `step.py` SVG save import; `DataLoader` empty `<p>` removal.

## [0.1.21] - 2026-09-27

### Added
- Effects palette and LLM-generated effects; images palette and LLM illustrations; page-level CSS builder; blocks manifest as JSON.

### Changed
- Public page loads only `public.css` + `pages/<id>.css`; editor sub-APIs under the parent `editor` router; five pre-created block categories.

### Removed
- `effects/manifest.js` legacy fallback; static `blockCssUrls` import.

### Fixed
- `DataLoader` `child.removed` call; deferred empty-placeholder cleanup; SVG save path in `step.py`.

## [0.1.20] - 2026-09-24

### Added
- LLM settings UI (DeepSeek, OpenAI, YandexGPT, GigaChat, Gemini); `Setting` table with Fernet encryption; setup landing page; `Base.renderInArea()`; `ensure_css_file()`.

### Changed
- Page CSS split into `Page.css` + derived static file; `BaseSetup` renders into `area-center`; DeepSeek tokenizer uses `cl100k_base`.

### Removed
- `LLMSetting` model and `llm` table — replaced by `Setting`.

### Fixed
- Page CSS cache-busting reflects content changes.

## [0.1.19] - 2026-09-23

### Added
- Base templates extendable by child pages via `[data-slot="content"]`.

### Changed
- Base blocks refactor: unified `blocks/manifest.js`, dynamic versioned imports, CSS scoped to `.core-engine-lib-word-blocks`.

## [0.1.18] - 2026-09-22

### Added
- Initial public release: FastAPI backend, SQLite storage, BaseCards widgets, GrapesJS Word editor, LLM chat panel, presets, media library, page history.

[0.1.28]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.27...v0.1.28
[0.1.27]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.26...v0.1.27
[0.1.26]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.25...v0.1.26
[0.1.25]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.24...v0.1.25
[0.1.24]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.23...v0.1.24
[0.1.23]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.22...v0.1.23
[0.1.21]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.20...v0.1.21
[0.1.19]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.18...v0.1.19
[0.1.18]: https://github.com/aleksmir-dev/neurocad/releases/tag/v0.1.18