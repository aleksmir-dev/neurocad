# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.5] - 2026-10-04
- Admin impersonation, `neurocad create-user` CLI, public `/pages` catalog with editable title, plus fixes for `POST /impersonate/stop` 422, stale `sessionStorage` after impersonation, and `auth._restoreSession()` not falling back to the server.

## [1.0.4] - 2026-10-04
- robots.txt editing for both domains: a "Редактировать robots.txt" button in each card (subdomain and custom domain) opens a shared modal, the body is stored in `users.robots_3` / `users.robots_2`, served at `GET /robots.txt`, and saved via `POST /domain/robots` with `{ which, robots }`.

## [1.0.3] - 2026-10-03
- Real certificate-issuance check: `_ask_caddy` now performs an actual TLS handshake instead of trusting the Caddy admin API, and "Сертификат выпущен" is shown only after a successful handshake.

## [1.0.2] - 2026-10-03
- Home-page selection in Profile → Domains, `APP_DOMAIN` moved from a hardcode to settings, header menu fixed to survive re-renders, logout corrected to `/core/auth/login/logout`, and new users get a "Trial" tariff with 2 000 000 tokens up front.

## [1.0.1] - 2026-10-02
- Lazy cleanup of Caddy certificates for disconnected custom domains, system domains never touched, and second-level domains accepted by the connection form.

## [1.0.0] - 2026-10-01
- License changed from MIT to Business Source License 1.1 (BSL 1.1).

## [0.1.29] - 2026-09-30
- New `create_page` agent generates a landing page from a single prompt; DeepSeek gains reasoning-model support.

## [0.1.28] - 2026-09-30
- Import/export for the editor: `.grp` archives, `.html` files, remote URLs, standalone HTML export.

## [0.1.27] - 2026-09-29
- Article catalog block, hybrid `href` trait with page picker, and balance/token-accounting fixes across all five LLM providers.

## [0.1.26] - 2026-09-27
- Demo pages (10) importable into an existing DB via `INSERT`-only SQL, scoped to `nav_id = 1`.

## [0.1.25] - 2026-09-27
- `Page.nav_id` scopes pages to a nav instance, media layout `media/<nav_id>/`, permissions relaxed to any authenticated user.

## [0.1.24] - 2026-09-27
- Demo import handles multi-line HTML `INSERT`s via `_split_sql_statements()` and `exec_driver_sql()`.

## [0.1.23] - 2026-09-27
- Logo generation from the editor, demo data on first start, `.env.example` in the package.

## [0.1.21] - 2026-09-27
- Effects palette, images palette, page-level CSS builder, blocks manifest as JSON.

## [0.1.20] - 2026-09-24
- LLM settings UI for five providers, `Setting` table with Fernet encryption, setup landing page.

## [0.1.19] - 2026-09-23
- Base templates extendable by child pages via `[data-slot="content"]`, unified `blocks/manifest.js`.

## [0.1.18] - 2026-09-22
- Initial public release: FastAPI backend, SQLite storage, BaseCards widgets, GrapesJS Word editor, LLM chat panel, media library, page history.

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