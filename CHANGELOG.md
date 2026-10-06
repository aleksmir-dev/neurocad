# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.15] - 2026-10-07
- Per-user policy / rules documents: markdown editors in the domain page, saved to `users.policy` / `users.rules`, served publicly at `/policy` and `/rules` on the user's host; `core-footer` block substitutes the real public host on drop; `editor.js` split into `brand.js`, `autosave.js`, `session.js`; fixed the old `word/service.py` import path, the footer-link blue underline in `ready.css`, and the ISO date format in the legal texts.

## [1.0.14] - 2026-10-06
- Fixed `word/service.py` importing the domain service from the old module path after the 1.0.13 package split — admin page viewer returned 500 ("страница не найдена").

## [1.0.13] - 2026-10-06
- Per-user policy / rules markdown pages served at `/policy` и `/rules` on the user's host, with universal fallback texts, a new `domain/public.py` router, `domain/service.py` split into a package, and async DNS checks.

## [1.0.12] - 2026-10-05
- Page-link trait inserts public URLs without `nav_id`; test root domain bound to the first superadmin.

## [1.0.11] - 2026-10-05
- Public URLs are host-based and contain no `nav_id`.

## [1.0.10] - 2026-10-05
- `pages_url` in `GET /domain/`; "Отключить" disabled for platform domains.

## [1.0.9] - 2026-10-05
- Platform root domain bound to the first superadmin.

## [1.0.8] - 2026-10-05
- Media library picker via `BaseAssets`; public routes scoped to the owner's host.

## [1.0.7] - 2026-10-05
- Generated SVGs written to the project's `static/`.

## [1.0.6] - 2026-10-04
- On-the-fly `sitemap.xml`, cookie banner, `domain.js` split into modules.

## [1.0.5] - 2026-10-04
- Admin impersonation, `create-user` CLI, public `/pages` catalog.

## [1.0.4] - 2026-10-04
- robots.txt editing for both domains via a shared modal.

## [1.0.3] - 2026-10-03
- Real certificate-issuance check via a TLS handshake.

## [1.0.2] - 2026-10-03
- Home-page selection, `APP_DOMAIN` in settings, Trial tariff with 2M tokens.

## [1.0.1] - 2026-10-02
- Lazy cleanup of Caddy certificates for disconnected domains.

## [1.0.0] - 2026-10-01
- License changed from MIT to BSL 1.1.

## [0.1.29] - 2026-09-30
- `create_page` agent; DeepSeek reasoning-model support.

## [0.1.28] - 2026-09-30
- Editor import/export: `.grp`, `.html`, URLs, standalone HTML.

## [0.1.27] - 2026-09-29
- Article catalog block, hybrid `href` trait, balance fixes.

## [0.1.26] - 2026-09-27
- Demo pages importable into an existing DB.

## [0.1.25] - 2026-09-27
- `Page.nav_id` scopes pages to a nav; media layout `media/<nav_id>/`.

## [0.1.24] - 2026-09-27
- Multi-line HTML `INSERT` handling in demo import.

## [0.1.23] - 2026-09-27
- Logo generation, demo data on first start.

## [0.1.21] - 2026-09-27
- Effects palette, images palette, page-level CSS builder.

## [0.1.20] - 2026-09-24
- LLM settings UI for five providers, encrypted `Setting` table.

## [0.1.19] - 2026-09-23
- Extendable base templates, unified `blocks/manifest.js`.

## [0.1.18] - 2026-09-22
- Initial public release.

[1.0.15]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.14...v1.0.15
[1.0.14]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.13...v1.0.14
[1.0.13]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.12...v1.0.13
[1.0.12]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.11...v1.0.12
[1.0.11]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.10...v1.0.11
[1.0.10]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.9...v1.0.10
[1.0.9]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.29...v1.0.0
[0.1.29]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.28...v0.1.29
[0.1.28]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.27...v0.1.28
[0.1.27]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.26...v0.1.27
[0.1.26]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.25...v0.1.26
[0.1.25]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.24...v0.1.25
[0.1.24]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.23...v0.1.24
[0.1.23]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.22...v0.1.23
[0.1.21]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.20...v0.1.21
[0.1.20]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.19...v0.1.20
[0.1.19]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.18...v0.1.19
[0.1.18]: https://github.com/aleksmir-dev/neurocad/releases/tag/v0.1.18