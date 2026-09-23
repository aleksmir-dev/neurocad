# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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