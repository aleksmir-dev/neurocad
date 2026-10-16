# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.31] - 2026-10-16
- **Inventory (`botinv`) fixes and MAX bot.** Mobile layout puts the chat in `area-center`, the table's filter row and toolbar survive every re-render, list actions use SVG icons, the chat candidate list highlights row numbers in bordeaux and inventory numbers in blue via escaped HTML, `BaseModalInput` / `BaseModalDate` no longer flash unstyled on a cold cache, and the module now ships a MAX chat-bot (`botinv/max.py` + `POST /botinv/max/webhook`) where the accountant picks a room with `#405`, types an inventory number, and taps a candidate button — the bot marks the item in the same active sheet the web UI shows, enabled per-user via `MAX_ALLOWED_USER_ID` in `.env` plus a `use_botinv = 1` lookup, with TLS trusting the system CA bundle so the Russian Trusted Root CA is honoured.

## [1.0.30] - 2026-10-16
- Backup fixes (per-instance cron isolation, `{"level": "..."}` body, `rclone` PATH/HOME env + fallback, `/backup/s3/test` never 500s, S3 credential stripping, `neurocad install` CLI), plus `botinv` follow-up changes.

## [1.0.29] - 2026-10-16
- Backup: all hardcoded paths/URLs/user replaced by `APP_DOMAIN` / `APP_HOST` / `APP_PORT` / `APP_SYSTEM_USER` (per-instance `/etc/cron.d/<APP_DOMAIN>`, `level` now sent in the cron body instead of `-d '{}'`), `rclone` resolved via `shutil.which()` with explicit `PATH`/`HOME` env, `/backup/s3/test` never 500s (always `{"success": false, "message": "..."}`), S3 credentials stripped of whitespace/quotes, and new `neurocad install` CLI writing systemd + nginx from `neurocad/etc/*.conf` templates.

## [1.0.28] - 2026-10-15
- Mobile chat input no longer hides behind the system navigation bar (`100dvh` in `03_layout.css`, `dvh` in `chat.css`).

## [1.0.27] - 2026-10-15
- `botinv` polish: chat in `area-center` on mobile, table filter row re-installed after every base re-render, SVG icons in list actions, bordeaux/blue row-number and inventory-number highlighting in the candidate list, no more «Каб. до: None», and `BaseModalInput` / `BaseModalDate` no longer flash unstyled on a cold cache (`_cssReady` awaited in `open()`, `?v=<static_version>` on modal imports, restored `_populateMonthSelect()` and `setOnCancel` on `BaseModalDate`).

## [1.0.26] - 2026-10-15
- `use_botinv` added to `GET /core/engine/lib/base/profile/` and `POST /core/auth/login` responses and normalized to a real boolean in `serialize_user`, so the inventory section appears for non-superadmins when the DB flag is set.

## [1.0.25] - 2026-10-15
- Inventory module (`botinv`): per-user walking tool with Excel/CSV import (`inv_num;name;room`), case-insensitive lookups, substring search with numbered candidates, side-by-side chat and table, XLSX export, new `botinv_sheets` / `botinv_items` tables plus four migrations, new `users.use_botinv` flag, and `BaseChat.headerExtra` / `setPlaceholder` / per-message `variant`.

## [1.0.24] - 2026-10-14
- Backup management: automated S3 backups (Selectel) on five levels (hourly/daily/weekly/monthly/yearly) with retention, rotation, UI-driven schedules stored in `panel_tasks`, auto-regenerated `/etc/cron.d/neurocad`, encrypted (Fernet) S3 secret, run history, and a new superadmin "Сервисы" page (`?page=services`).

## [1.0.23] - 2026-10-12
- "Главная" in the header links to the module root (`/core/engine/admin`) via `window.coreEngine.baseUrl` instead of `/`, and `GET /creatives/stats` no longer 500s — `_public_base_for_nav` in `creatives/service.py` uses `from ..base…` (two dots) instead of `from ....base…`.

## [1.0.22] - 2026-10-12
- Placement tracking end to end: `creatives/public/block.js` sends `show`/`click` hits via `navigator.sendBeacon`, the "Отчёт" tab shows real counts with a clickable page-title column, footer links in Word view rebase onto `pageData.public_host`, FOUC is gone on `?page=setup`/`profile`/`creatives` (`coreEngine.loadCSS()` returns a Promise awaited in `_init()`), and `pages/public/route.py` is split into six modules (route / render / cookies / html / hosts / paths).

## [1.0.21] - 2026-10-11
- Contacts page for every user's site: new `users.contacts` TEXT column (migration `0943e8bd752c`), served at `/contacts` alongside `/policy` and `/rules` with a universal fallback from `modal/legal/contacts.md`, generalised `LegalModal` (three `LEGAL_WHICH` targets), `/contacts` link in `core-footer`, and LLM generation disabled for contacts on both frontend and backend.

## [1.0.20] - 2026-10-11
- Creative model gains `text` / `button_text` / `brand` / `inn`, admin modal has eight fields, placements tab is read-only, new `core-creative` block renders the ad insert with legal markers and auto-fills on drop, and `BaseModalForm._createDOM()` no longer reuses a stale container that emptied freshly filled fields.

## [1.0.19] - 2026-10-11
- Article catalog managed by the "Администратор" agent (always asks one clarifying question first), plus "Копировать" / "Переместить" toolbar buttons, `BaseModalList` picker, "Публиковать" checkbox, and a reworked `create_page` dialog prompt with `_parse_dialog_response` fallback for bare-text questions.

## [1.0.18] - 2026-10-08
- Folders in the article catalog (admin and public, unlimited nesting, `/pages/<id>` URLs, breadcrumbs, "Вернуться" card) with `?root=1` escape hatch, `renderUpCard` hook on `BaseCards`, `parent_id` reaching the API, `edit-body--folder`/`edit-body--page` tags, neutral folder palette, and fixes for `InvalidCharacterError` on spaced `customClass` and for the open folder appearing inside itself.

## [1.0.17] - 2026-10-07
- AI generation of Policy and Rules via a new "✨ Сгенерировать" button and `POST /domain/legal/generate` — the LLM reads the user's home page and returns fresh markdown without saving, with explicit today's date, a ban on inventing brands/data categories, and token charge on Balance.

## [1.0.16] - 2026-10-07
- Pages gain an optional external `url` that catalog cards open in the current tab instead of `/page/<date>/<time>`, with a `↗` badge in the admin catalog and `url` surfaced across page APIs and the `page-link` trait.

## [1.0.14] - 2026-10-06
- Fixed `word/service.py` importing the domain service from the old module path after the 1.0.13 package split (admin page viewer 500).

## [1.0.13] - 2026-10-06
- Per-user `/policy` and `/rules` markdown pages with universal fallback texts, new `domain/public.py` router, `domain/service.py` split into a package, and async DNS checks.

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
[0.1.25]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.24...v0.1.25
[0.1.24]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.23...v0.1.24
[0.1.23]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.22...v0.1.23
[0.1.21]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.20...v0.1.21
[0.1.20]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.19...v0.1.20
[0.1.19]: https://github.com/aleksmir-dev/neurocad/compare/v0.1.18...v0.1.19
[0.1.18]: https://github.com/aleksmir-dev/neurocad/releases/tag/v0.1.18