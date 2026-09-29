## [0.1.27] - 2026-09-29

### Added

- **Article catalog block for GrapesJS.** New ready-made section «Каталог статей» in the «Секции» category. Renders a grid of page cards — each card is an `<a>` link with logo, title, description and date. Pure HTML+CSS, no JavaScript on the public page. Ships with three placeholder cards; the editor replaces texts, links and images via traits or inline editing.
- **Link picker in the editor.** The `href` trait for `<a>` elements is now a hybrid control:
  - a `<select>` listing the current user's pages (`title — url`), pulled once from `GET /core/engine/lib/pages/my-list`;
  - a text `<input>` for manual URL entry (external links, anchors, etc.).
  Selecting a page fills the input and updates `href`; typing a URL updates `href` directly.
- **API endpoint `GET /core/engine/lib/pages/my-list`** — returns active, non-deleted, non-template pages of the current user across all their navs, each with a ready-to-use `/page/<nav_id>/<YYYYMMDD>/<HHMMSS>` URL. Supports `?exclude_page_id=` to skip the page being edited.

### Changed

- **Public page body cleanup.** `pages/public/route.py` now strips stray `<body>…</body>` wrappers (left over from GrapesJS export) at render time via a compiled regex. The DB and the editor are untouched — only the public HTML output is cleaned. Fixes nested `<body>` flagged by W3C / Google / Yandex validators.
- **Public page header removed from the template.** The old admin-era `<header class="core-engine-lib-pages-public-header">` (logo + `<h1>` + `<time>`) is gone from `public.html` — it duplicated the content `<h1>` and served no purpose on a public page.
- **Footer layout.** `.core-engine-lib-base-footer` now uses `display: flex; align-items: center; justify-content: flex-start` — text sits left, vertically centered. `base.js` no longer forces `display: block` on the footer element.
- **Footer content.** «Подвал» placeholder replaced with `© 2026 NeuroCad. Смирнов Алексей Владимирович.`

### Fixed

- **Balance guard in the LLM WebSocket dispatcher.** All four run methods (`start`, `effect_edit`, `effect_rename`, `create_effect`) now check the user's tariff and token balance before any LLM call:
  - free → `llm_not_available`;
  - tokens ≤ 0 → `tokens_exhausted`;
  - create-agent additionally requires `gen > 0` on Pro → `gen_exhausted`.
  After a successful run, tokens (and, for the create-agent on Pro, one generation) are charged to `Balance`. No LLM call is made if the guard blocks.
- **Balance guard on logo generation.** `POST /core/engine/lib/word/editor/images/generate` checks `logo_allowed` before calling the provider and charges tokens (plus one generation on Pro) after a successful save.
- **Token accounting in all five LLM providers** (`deepseek`, `openai`, `yandex`, `gigachat`, `gemini`). Each provider keeps `self.tokens_used`, reset at the start of `get_response()` and incremented for input messages and output chunks. `BaseProvider.count_tokens()` is the fallback; DeepSeek and OpenAI override it with tiktoken; Gemini uses the exact `usageMetadata` when the API returns it.
- **`cleanup_stale()` in the admin balance list.** `BalanceChecked.cleanup_stale()` runs lazily when the superadmin opens `/core/engine/lib/balance` — soft-deletes free users past `FREE_TTL_DAYS` and drops their `media/<nav_id>/` folder. The list query now filters `User.is_delete = 0` so soft-deleted users don't linger.
- **Trial tariff label.** `TARIF_LABELS[3] = "Trial"` — previously fell back to "Free".

### Removed

- **`editor/grapes.js` (monolithic version).** Superseded by `editor/grapes/` modules (`index.js`, `config.js`, `link.js`, `page-link.js`, `scope.js`, `empty.js`, `undo.js`, `traits.js`). The file was unused after the split; confirmed by `grep -rn "grapes.js"` — only stale comments remained.
