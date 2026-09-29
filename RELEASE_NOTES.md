# neurocad 0.1.27

Release date: 2026-09-29

---

## English

### Added

- **Article catalog block for GrapesJS.** New ready-made section «Каталог статей» in the «Секции» category. Renders a grid of page cards — each card is an `<a>` link with logo, title, description and date. Pure HTML+CSS, no JavaScript on the public page. Ships with three placeholder cards; the editor replaces texts, links and images via traits or inline editing.
- **Link picker in the editor.** The `href` trait for `<a>` elements is now a hybrid control:
  - a `<select>` listing the current user's pages (`title — url`), pulled once from `GET /core/engine/lib/pages/my-list`;
  - a text `<input>` for manual URL entry (external links, anchors, etc.).
  Selecting a page fills the input and updates `href`; typing a URL updates `href` directly.
- **API endpoint `GET /core/engine/lib/pages/my-list`** — returns active, non-deleted, non-template pages of the current user across all their navs, each with a ready-to-use `/page/<nav_id>/<YYYYMMDD>/<HHMMSS>` URL. Supports `?exclude_page_id=` to skip the page being edited.

### Changed

- **`grapes.js` (editor bootstrap) rewritten as a modular loader** under `editor/grapes/`:
  - `index.js` — entry point, `load()` + `init()`;
  - `config.js` — GrapesJS config builder;
  - `link.js` — `registerLinkType` + `registerLinkCommand`;
  - `page-link.js` — new `page-link` trait type;
  - `scope.js`, `empty.js`, `undo.js`, `traits.js` — extracted helpers.
  Modules are loaded dynamically with `?v=<static_version>` so cache-busting keeps working; no static imports between them.
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
- **`websocket.state.user_id` cached during WS handshake.** `auth.py` now stores the resolved user and `user_id` on `websocket.state` after a successful JWT decode, so downstream dispatchers don't re-decode the cookie on every run.
- **`cleanup_stale()` in the admin balance list.** `BalanceChecked.cleanup_stale()` runs lazily when the superadmin opens `/core/engine/lib/balance` — soft-deletes free users past `FREE_TTL_DAYS` and drops their `media/<nav_id>/` folder. The list query now filters `User.is_delete = 0` so soft-deleted users don't linger.
- **Trial tariff label.** `TARIF_LABELS[3] = "Trial"` — previously fell back to "Free".

### Removed

- **`editor/grapes.js` (monolithic version).** Superseded by `editor/grapes/` modules. The file was unused after the split; confirmed by `grep -rn "grapes.js"` — only stale comments remained.

---

## Русский

### Добавлено

- **Блок «Каталог статей» для GrapesJS.** Новая готовая секция «Каталог статей» в категории «Секции». Рендерит сетку карточек-ссылок: логотип, заголовок, описание, дата. Чистый HTML+CSS, без JavaScript на публичной странице. В комплекте — три карточки-заглушки; редактор меняет тексты, ссылки и картинки через трайты или прямое редактирование.
- **Выбор страницы в редакторе.** Трайт `href` для `<a>` теперь гибридный:
  - `<select>` со страницами текущего пользователя (`title — url`), список грузится один раз с `GET /core/engine/lib/pages/my-list`;
  - `<input>` для ручного ввода URL (внешние ссылки, якоря и т.п.).
  Выбрал страницу — URL подставился в `href`; ввёл вручную — `href` обновился напрямую.
- **API-эндпоинт `GET /core/engine/lib/pages/my-list`** — отдаёт активные, неудалённые, не-шаблонные страницы текущего пользователя по всем его nav, каждая с готовым URL вида `/page/<nav_id>/<YYYYMMDD>/<HHMMSS>`. Поддерживает `?exclude_page_id=`, чтобы исключить редактируемую страницу.

### Изменено

- **`grapes.js` (загрузчик редактора) разбит на модули** под `editor/grapes/`:
  - `index.js` — точка входа, `load()` + `init()`;
  - `config.js` — сборка конфига GrapesJS;
  - `link.js` — `registerLinkType` + `registerLinkCommand`;
  - `page-link.js` — новый тип трайта `page-link`;
  - `scope.js`, `empty.js`, `undo.js`, `traits.js` — вынесенные хелперы.
  Модули грузятся динамически с `?v=<static_version>` — кэш-бастинг работает; статических импортов между ними нет.
- **Чистка `<body>` на публичной странице.** `pages/public/route.py` теперь срезает лишние обёртки `<body>…</body>` (наследие экспорта GrapesJS) на рендере — скомпилированным регексом. БД и редактор не трогаются: чистится только итоговый HTML. Исправляет вложенный `<body>`, который ловят валидаторы W3C / Google / Яндекс.
- **Шапка публичной страницы убрана из шаблона.** Старый `<header class="core-engine-lib-pages-public-header">` (логотип + `<h1>` + `<time>`) удалён из `public.html` — он дублировал `<h1>` из контента и на публичной странице был не нужен.
- **Раскладка футера.** `.core-engine-lib-base-footer` теперь `display: flex; align-items: center; justify-content: flex-start` — текст слева, по центру по вертикали. `base.js` больше не форсит `display: block` на элементе футера.
- **Содержимое футера.** Заглушка «Подвал» заменена на `© 2026 NeuroCad. Смирнов Алексей Владимирович.`

### Исправлено

- **Проверка баланса в WebSocket-диспетчере LLM.** Все четыре run-метода (`start`, `effect_edit`, `effect_rename`, `create_effect`) теперь проверяют тариф и остаток токенов до вызова LLM:
  - free → `llm_not_available`;
  - токенов ≤ 0 → `tokens_exhausted`;
  - для create-агента дополнительно `gen > 0` на Pro → `gen_exhausted`.
  После успешного руна с баланса списываются токены (а для create-агента на Pro — ещё одна генерация). Если guard заблокировал — LLM не вызывается.
- **Проверка баланса при генерации логотипа.** `POST /core/engine/lib/word/editor/images/generate` вызывает `logo_allowed` до запроса к провайдеру и списывает токены (плюс одну генерацию на Pro) после успешного сохранения.
- **Учёт токенов во всех пяти провайдерах LLM** (`deepseek`, `openai`, `yandex`, `gigachat`, `gemini`). Каждый держит `self.tokens_used`, сбрасываемый в начале `get_response()` и увеличиваемый на входных сообщениях и выходных чанках. `BaseProvider.count_tokens()` — fallback; DeepSeek и OpenAI переопределяют через tiktoken; Gemini использует точный `usageMetadata`, когда API его возвращает.
- **`websocket.state.user_id` кэшируется во время WS-рукопожатия.** `auth.py` после успешного декода JWT сохраняет пользователя и `user_id` в `websocket.state`, чтобы диспетчеры не декодировали cookie на каждом руне.
- **`cleanup_stale()` в списке баланса админки.** `BalanceChecked.cleanup_stale()` срабатывает лениво при заходе суперадмина на `/core/engine/lib/balance` — soft-delete free-юзеров, у которых `acc_at` старше `FREE_TTL_DAYS`, и удаление их папки `media/<nav_id>/`. Список теперь фильтрует `User.is_delete = 0`, чтобы soft-deleted юзеры не висели.
- **Метка Trial-тарифа.** `TARIF_LABELS[3] = "Trial"` — раньше падало в «Free».

### Удалено

- **`editor/grapes.js` (монолитная версия).** Заменён модулями `editor/grapes/`. Файл не использовался после разбивки — подтверждено `grep -rn "grapes.js"`: оставались только устаревшие комментарии.