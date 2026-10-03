# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2026-10-03
- Real certificate-issuance check for custom domains: `_ask_caddy` replaced the no-op stub with an actual TLS handshake (`ssl.create_default_context` + `socket.create_connection`), first attempt with a 30-second timeout to trigger On-Demand TLS issuance and a second attempt with a 5-second timeout once the certificate is cached. "Сертификат выпущен" is now shown only when the handshake actually succeeds; on failure the UI displays the specific reason (timeout, connection refused, DNS not resolving, SSL verification error). Domain cards now show full clickable URLs (`https://testuser1.neurocad.ru`, `https://atou.ru`) and a "Копировать" button that copies the full URL — ready to paste into the address bar — instead of the bare hostname.

## [1.0.2] - 2026-10-03
- Home-page selection (Profile → Domains) that also powers custom domains: both `<login>.<APP_DOMAIN>` and a connected second-level domain now resolve to the owner's chosen home page, with `APP_DOMAIN` moved from a hardcode to settings, the header menu fixed to survive re-renders, logout corrected to `/core/auth/login/logout`, login errors shown in Russian, inline SVG preserved on import/export, and new users granted a "Trial" tariff with 2 000 000 tokens up front.

## [1.0.1] - 2026-10-02
- Lazy cleanup of Caddy certificates for disconnected custom domains: removed domains get their certificates physically deleted after 30 days, system domains (`neurocad.ru`, `neurocad-dev.ru`, `neurocad-demo.ru` and subdomains) are never touched, and second-level domains are now accepted by the connection form.

## [1.0.0] - 2026-10-01
- License changed from MIT to Business Source License 1.1 (BSL 1.1).

## [0.1.29] - 2026-09-30
- New `create_page` agent generates a full landing page (HTML + CSS) from a single prompt; DeepSeek provider gains reasoning-model support with fallback to `reasoning_content`.

## [0.1.28] - 2026-09-30
- Import/export for the editor: `.grp` archives, `.html` files, remote URLs, standalone HTML export, plus Import/Export toolbar buttons.

## [0.1.27] - 2026-09-29
- Article catalog block, hybrid `href` trait with page picker, `grapes.js` split into modules, and balance/token-accounting fixes across all five LLM providers.

## [0.1.26] - 2026-09-27
- Demo pages (10) importable into an existing DB via `INSERT`-only SQL, scoped to `nav_id = 1`.

## [0.1.25] - 2026-09-27
- `Page.nav_id` scopes pages to a nav instance; media layout `media/<nav_id>/`; permissions relaxed from superadmin to any authenticated user.

## [0.1.24] - 2026-09-27
- Demo import handles multi-line HTML `INSERT`s via `_split_sql_statements()` and `exec_driver_sql()`.

## [0.1.23] - 2026-09-27
- Logo generation from the editor, demo data on first start, `.env.example` in the package, `BaseCardsEdit.extraButtons`.

## [0.1.21] - 2026-09-27
- Effects palette, images palette, page-level CSS builder, blocks manifest as JSON; legacy `effects/manifest.js` removed.

## [0.1.20] - 2026-09-24
- LLM settings UI for five providers, `Setting` table with Fernet encryption, setup landing page, `Base.renderInArea()`.

## [0.1.19] - 2026-09-23
- Base templates extendable by child pages via `[data-slot="content"]`; unified `blocks/manifest.js` with dynamic versioned imports.

## [0.1.18] - 2026-09-22
- Initial public release: FastAPI backend, SQLite storage, BaseCards widgets, GrapesJS Word editor, LLM chat panel, presets, media library, page history.

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