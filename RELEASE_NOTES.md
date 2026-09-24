# neurocad 0.1.20

Release date: 2026-09-24

---

## English

### Added

- **LLM settings UI** — a new admin page at `setup/llm` for managing API keys, base URLs, models, and limits for DeepSeek, OpenAI, YandexGPT, GigaChat, and Google Gemini. Access is restricted to superadmins.
- **Settings storage** — a new `Setting` key-value table with JSON values. LLM settings are stored under a single row (`domain='neurocad', subsys='setup', module='llm', key='llm'`).
- **Encrypted secrets** — API keys are encrypted at rest with Fernet (`NEUROCAD_SECRET_KEY`). If the key is missing or invalid, encryption is skipped and the UI shows a warning.
- **Setup landing page** — a new `setup` page with navigation to setup sections (currently: LLM).
- **"Настройки" menu item** — visible to superadmins only.
- **Shared `Base.renderInArea()`** — a single method for rendering a page component into `area-center`, used by the setup pages (and ready for other pages).
- **`ensure_css_file()` utility** — writes page CSS to disk (atomic, content-hash cache-busting) and returns a URL with `?v=<hash>`. Page CSS is now served under the module's own namespace: `/static/core/engine/lib/pages/public/pages/<id>.css`.

### Changed

- **Page CSS is now split from HTML** — a new `Page.css` field (DB source of truth) with a derivative file `static/.../pages/<id>.css` served to the browser. Legacy pages (CSS embedded in `content` as `<style>`) are handled transparently via `split_style_from_html` — extracted on the fly for rendering, never written back to the DB.
- **Setup pages render through `Base.renderInArea()`** — auth pages (login/register/profile) can migrate to the same method over time.
- **DeepSeek tokenizer cleanup** — removed dead `encoding_for_model()` calls; `cl100k_base` is used directly.

### Removed

- **`LLMSetting` model and `llm` table** — superseded by the generic `Setting` key-value storage.

### Fixed

- **Page CSS cache-busting** — `?v=<hash>` now reflects content changes, not server restarts. The browser reliably fetches new CSS when the page is edited, and reuses cached CSS when nothing changed.

---

## Русский

### Добавлено

- **Интерфейс настроек LLM** — новая страница администратора `setup/llm` для управления API-ключами, базовыми URL, моделями и лимитами для DeepSeek, OpenAI, YandexGPT, GigaChat и Google Gemini. Доступ — только суперадминам.
- **Хранилище настроек** — новая таблица `Setting` (key-value с JSON-значениями). Настройки LLM хранятся одной записью (`domain='neurocad', subsys='setup', module='llm', key='llm'`).
- **Шифрование секретов** — API-ключи шифруются на диске через Fernet (`NEUROCAD_SECRET_KEY`). Если ключ отсутствует или невалиден, шифрование пропускается, а в интерфейсе показывается предупреждение.
- **Главная страница настроек** — новая страница `setup` с навигацией по разделам (пока только LLM).
- **Пункт меню «Настройки»** — виден только суперадминам.
- **Общий метод `Base.renderInArea()`** — единая точка рендера страницы в `area-center`; используется страницами настроек и готова к использованию другими страницами.
- **Утилита `ensure_css_file()`** — пишет CSS страницы на диск (атомарно, с cache-busting по хэшу содержимого) и возвращает URL с `?v=<hash>`. CSS страницы теперь отдаётся в namespace модуля: `/static/core/engine/lib/pages/public/pages/<id>.css`.

### Изменено

- **CSS страницы отделён от HTML** — новое поле `Page.css` (источник правды в БД) и производный файл `static/.../pages/<id>.css`, отдаваемый браузеру. Старые страницы (CSS вшит в `content` как `<style>`) обрабатываются прозрачно через `split_style_from_html` — извлекается на лету для рендера, в БД не пишется.
- **Страницы настроек рендерятся через `Base.renderInArea()`** — страницы auth (login/register/profile) могут быть переведены на тот же метод позже.
- **Чистка токенайзера DeepSeek** — удалены мёртвые вызовы `encoding_for_model()`; напрямую используется `cl100k_base`.

### Удалено

- **Модель `LLMSetting` и таблица `llm`** — заменены универсальным key-value хранилищем `Setting`.

### Исправлено

- **Cache-busting CSS страниц** — `?v=<hash>` теперь отражает изменения содержимого, а не перезапуски сервера. Браузер надёжно загружает новый CSS после редактирования страницы и переиспользует кэш, если ничего не менялось.