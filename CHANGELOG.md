# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.12] - 2026-10-05
- The `page-link` trait in the editor now inserts public URLs without `nav_id` — `GET /pages/my-list` returns `/page/<date>/<time>` instead of `/page/<nav_id>/<date>/<time>`, matching the host-based public URL scheme from 1.0.11; and the test environment's root domain (`neurocad-dev.ru`) is bound to the first superadmin via `users.domain` so it resolves the same way as on prod.

## [1.0.11] - 2026-10-05
- Public URLs are now host-based and contain no `nav_id` — single pages live at `/page/<date>/<time>`, the catalog at `/pages`, and the page/catalog is resolved from the request Host; this also fixes `demo.neurocad.ru/pages` returning 404 because the catalog used to fall back to "the first nav in the DB" (admin's) before the host-ownership check rejected it.

## [1.0.10] - 2026-10-05
- `pages_url` is now part of the `GET /domain/` response so the "Открыть каталог статей" toolbar button opens the catalog on the owner's domain; `normalize_host()` no longer special-cases `APP_DOMAIN`; and the "Отключить" button for `neurocad.ru` / `neurocad-dev.ru` / `neurocad-demo.ru` (and their subdomains) is now disabled in the UI.

## [1.0.9] - 2026-10-05
- Platform root domain (`neurocad.ru`) is bound to the first superadmin so its public pages resolve again, `normalize_host()` no longer special-cases `APP_DOMAIN`, and the "Отключить" button for platform domains is now disabled in the UI.

## [1.0.8] - 2026-10-05
- Media library picker in the editor now uses `BaseAssets` (same full-screen picker with tabs «Медиатека» / «Логотипы» as the article form) via an override of GrapesJS's `open-assets` command; public `/page/...` and `/pages` routes are now scoped to the owner's host (404 on foreign hosts, closing cross-domain duplication); the "Открыть публичную версию" button opens on the owner's public host via `pageData.public_url`; and `word/service.py` had a broken relative import (`...base` → `..base`) that crashed `/word/bydatetime` with HTTP 500.

## [1.0.7] - 2026-10-05
- `images/service.py` now writes generated SVGs to the project's `static/` (via `user_static_dir()`) instead of a phantom package-relative path, so images load from `/static/...` again.

## [1.0.6] - 2026-10-04
- `sitemap.xml` generated on the fly (nothing stored), cookie-consent banner on public pages, `domain.js` split into `cards.js` / `actions.js` / `modals.js` / `helpers.js`, and fixes for tokens not being credited on tariff upgrade plus the "Перейти к балансу" link going to the login form instead of the profile page.

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