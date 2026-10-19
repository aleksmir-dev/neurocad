# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.36] - 2026-10-19
- Fixed HTML import and code injection in template mode: the base template (iframe) no longer detaches from its slot when applying HTML via the import dialog or the `<>` modal.

## [1.0.35] - 2026-10-19
- The article catalog now remembers the last opened folder (per nav_id) and restores it after a page reload or returning from an article, instead of resetting to the root.

## [1.0.34] - 2026-10-19
- Fixed the "Наследовать от" dropdown in the page editor: it now always shows the current list of templates, instead of a stale or empty list.

## [1.0.33] - 2026-10-17
- New `lib/llm` layer: the `generate_logo` agent is now a self-contained package with its own `Prompt`, `Service`, `Schema` and `Route`. It is exposed via `POST /core/engine/lib/llm/agents/_01_generate_logo/generate`, replacing the legacy endpoint; the old endpoint and code are kept until verified in production.

## [1.0.32] - 2026-10-16
- **`botinv`: chat and MAX-bot cleanup.** Candidate lists in both channels now contain only rows and buttons. Single substring hits are no longer marked automatically; the user must confirm by tapping a button. Fixed minor note formatting.

## [1.0.31] - 2026-10-16
- **Inventory (`botinv`) fixes and MAX bot.** Fixed mobile layout and table re-renders, added SVG icons, improved highlighting, and prevented modal flashes. Added a MAX chat-bot for picking rooms and marking items via inline buttons.

## [1.0.30] - 2026-10-16
- Backup fixes (per-instance cron, S3 credential stripping, `neurocad install` CLI) and `botinv` follow-up changes.

## [1.0.29] - 2026-10-16
- Backup: replaced hardcoded paths with `APP_DOMAIN`/`APP_PORT`/etc., fixed `rclone` resolution, ensured `/backup/s3/test` never 500s, and added `neurocad install` CLI for systemd/nginx.

## [1.0.28] - 2026-10-15
- Fixed mobile chat input hiding behind the system navigation bar.

## [1.0.27] - 2026-10-15
- `botinv` polish: fixed mobile layout, table filters, icons, and candidate highlighting. Prevented modal flashes on cold cache.

## [1.0.26] - 2026-10-15
- `use_botinv` is now returned in profile and login responses, so the inventory section appears correctly for non-superadmins.

## [1.0.25] - 2026-10-15
- Inventory module (`botinv`): added per-user walking tool with Excel/CSV import, case-insensitive lookups, candidate search, XLSX export, and new DB tables/flag.

## [1.0.24] - 2026-10-14
- Backup management: automated S3 backups with retention and rotation, UI schedules, encrypted secrets, and a new superadmin "Сервисы" page.

## [1.0.23] - 2026-10-12
- Fixed "Главная" link to use the module root and fixed a 500 error in `GET /creatives/stats`.

## [1.0.22] - 2026-10-12
- Placement tracking: added `show`/`click` hits, report tab counts, footer link rebasing, fixed FOUC on several pages, and split public routing into modules.

## [1.0.21] - 2026-10-11
- Contacts page: added `users.contacts` column, `/contacts` route, generalized `LegalModal` for three targets, and disabled LLM generation for contacts.

## [1.0.20] - 2026-10-11
- Creative model: added `text`/`button_text`/`brand`/`inn` fields, read-only placements tab, `core-creative` block, and fixed a stale container bug in `BaseModalForm`.

## [1.0.19] - 2026-10-11
- Article catalog managed by "Администратор" agent (asks one clarifying question), added copy/move buttons, picker, publish checkbox, and improved dialog prompts.

## [1.0.18] - 2026-10-08
- Folders in article catalog: unlimited nesting, breadcrumbs, "Вернуться" card, `parent_id` support, and fixed `InvalidCharacterError` and folder recursion bugs.

## [1.0.17] - 2026-10-07
- AI generation of Policy and Rules via "✨ Сгенерировать" button and `POST /domain/legal/generate`, with token charging.

## [1.0.16] - 2026-10-07
- Pages: added optional external `url` opened in the current tab, with `↗` badge and `page-link` trait support.

## [1.0.14] - 2026-10-06
- Fixed `word/service.py` importing from the old module path after the 1.0.13 split.

## [1.0.13] - 2026-10-06
- Per-user `/policy` and `/rules` pages with fallback texts, new `domain/public.py` router, split `domain/service.py`, and async DNS checks.

## [1.0.12] - 2026-10-05
- Page-link trait inserts URLs without `nav_id`; test root domain bound to the first superadmin.

## [1.0.11] - 2026-10-05
- Public URLs are host-based and contain no `nav_id`.

## [1.0.10] - 2026-10-05
- Added `pages_url` to `GET /domain/`; disabled "Отключить" for platform domains.

## [1.0.9] - 2026-10-05
- Bound the platform root domain to the first superadmin.

## [1.0.8] - 2026-10-05
- Added media library picker via `BaseAssets`; scoped public routes to the owner's host.

## [1.0.7] - 2026-10-05
- Generated SVGs are now written to the project's `static/`.

## [1.0.6] - 2026-10-04
- Added on-the-fly `sitemap.xml`, cookie banner, and split `domain.js` into modules.

## [1.0.5] - 2026-10-04
- Added admin impersonation, `create-user` CLI, and public `/pages` catalog.

## [1.0.4] - 2026-10-04
- Added robots.txt editing for both domains via a shared modal.

## [1.0.3] - 2026-10-03
- Added real certificate-issuance check via TLS handshake.

## [1.0.2] - 2026-10-03
- Added home-page selection, `APP_DOMAIN` setting, and Trial tariff with 2M tokens.

## [1.0.1] - 2026-10-02
- Added lazy cleanup of Caddy certificates for disconnected domains.

## [1.0.0] - 2026-10-01
- License changed from MIT to BSL 1.1.

## [0.1.29] - 2026-09-30
- Added `create_page` agent; added DeepSeek reasoning-model support.

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

[1.0.36]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.35...v1.0.36
[1.0.35]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.34...v1.0.35
[1.0.34]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.33...v1.0.34
[1.0.33]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.32...v1.0.33
[1.0.32]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.31...v1.0.32
[1.0.31]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.30...v1.0.31
[1.0.30]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.29...v1.0.30
[1.0.29]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.28...v1.0.29
[1.0.28]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.27...v1.0.28
[1.0.27]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.26...v1.0.27
[1.0.26]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.25...v1.0.26
[1.0.25]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.24...v1.0.25
[1.0.24]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.23...v1.0.24
[1.0.23]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.22...v1.0.23
[1.0.22]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.21...v1.0.22
[1.0.21]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.20...v1.0.21
[1.0.20]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.19...v1.0.20
[1.0.19]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.18...v1.0.19
[1.0.18]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.17...v1.0.18
[1.0.17]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.16...v1.0.17
[1.0.16]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.14...v1.0.16
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
[0.1.25]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.24...v1.0.25
[1.0.24]: https://github.com/aleksmir-dev/neurocad/compare/v1.0.23...v1.0.24
[0.1.24]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.23...v0.1.24
[0.1.23]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.22...v0.1.23
[0.1.21]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.20...v0.1.21
[0.1.20]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.19...v0.1.20
[0.1.19]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.18...v0.1.19
[0.1.18]: https://github.com/aleksmir-dev/neurocad/releases/tag/v0.1.18