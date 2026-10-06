# neurocad 1.0.13

Release date: 2026-10-06

---

## English

### Added

- **Per-user legal documents — Policy and Rules.** Every user now owns two markdown documents, `users.policy` and `users.rules`, editable from the domain page (`Profile → Domains → Документы сайта`). The texts are served on the user's own host at `https://<user-host>/policy` and `https://<user-host>/rules` — the same Host-based resolution used by `/robots.txt` and `/sitemap.xml` (subdomain first, custom domain second, 404 for unknown hosts).

- **Universal fallback for empty legal pages.** If a user has not filled the field (NULL, empty string, or whitespace-only), the public endpoints serve a short universal text suitable for a business-card site. The fallback lives in `modal/legal/policy.md` and `modal/legal/rules.md`; the `{date}` placeholder is substituted with today's ISO date on every request. The public endpoint never returns 404 for a known host — the page always exists, so a footer link never leads to a dead end.

- **Legal modal with live markdown preview.** A shared modal (`modal/legal/legal.js`) edits either document. It has a split-pane layout: raw markdown on the left, rendered preview on the right. Presets fill the textarea with a starter skeleton (152-ФЗ-shaped for Policy, terms-of-use for Rules) or clear it. When the user has no own text, the modal is seeded with the same universal fallback the public page serves and shows an explanatory hint that this is the fallback currently published on the site.

- **New `domain/public.py` router** for the public `/policy` and `/rules` endpoints. Registered in `utils/routes.py` alongside the other public routes. Keeps the legal-page logic out of `utils/routes.py`, which stays thin.

### Changed

- **`domain/service.py` split into a package.** The monolithic service file is now `domain/service/` with one mixin per responsibility: `common`, `dns`, `caddy`, `domain`, `robots`, `sitemap`, `legal`, `pages`, plus `constants` and a `facade` that composes them. Imports across the project updated to `domain.service.facade`. No public API changes — the facade class keeps its name.

- **`_check_dns` is now async and time-bounded.** The blocking `socket.gethostbyname` call is offloaded to a thread pool via `run_in_executor` and wrapped in `asyncio.wait_for` with a 5-second cap (`DNS_RESOLVE_TIMEOUT`). Previously a stuck resolver could block the event loop for up to 30 seconds and stall every other request.

- **Modal assets moved into `modal/` subfolders.** `robots.js`/`robots.css`, `sitemap.js`/`sitemap.css`, and `legal.js`/`legal.css` now live under `domain/modal/<name>/`. Paths in `modals.js`, `domain.js`, and each modal's `_loadCSS()` updated. All imports remain dynamic with the `?v=<static_version>` cache-buster.

- **`cards.js → renderLegalCard` badge wording.** The badge for an empty field now reads «Универсальный текст» instead of «Не задано», matching the fallback behaviour: on the public page the text is present, it is just not the user's own.

### Database

- **Migration `fe4f2cf832bb`** adds `users.policy` and `users.rules` (both `TEXT`, nullable). Auto-generated, applied with `./migrate.sh`.

### Dependencies

- **`markdown-it-py`** required on the backend. Used by `domain/public.py` to render the stored markdown to HTML on the fly. "commonmark" preset + explicit `table` rule; raw HTML in the source is not passed through.

---

## Русский

### Добавлено

- **Пользовательские юридические документы — Политика и Правила.** У каждого пользователя теперь есть два markdown-документа, `users.policy` и `users.rules`, редактируемые со страницы доменов (`Профиль → Домены → Документы сайта`). Тексты публикуются на его собственном хосте по адресам `https://<host-пользователя>/policy` и `https://<host-пользователя>/rules` — та же host-based схема резолвинга, что у `/robots.txt` и `/sitemap.xml` (сначала поддомен, потом кастомный домен, 404 для неизвестных хостов).

- **Универсальный fallback для пустых юридических страниц.** Если пользователь не заполнил поле (NULL, пустая строка или только пробелы), публичный эндпоинт отдаёт короткий универсальный текст для сайта-визитки. Fallback лежит в `modal/legal/policy.md` и `modal/legal/rules.md`; плейсхолдер `{date}` подставляется сегодняшней датой при каждом запросе. Публичный эндпоинт никогда не возвращает 404 для известного хоста — страница всегда существует, поэтому ссылка в футере никогда не ведёт в тупик.

- **Модалка редактирования с живым markdown-превью.** Общая модалка (`modal/legal/legal.js`) редактирует любой из двух документов. Разделена на два пейна: слева сырой markdown, справа отрендеренный HTML. Пресеты заполняют textarea стартовым шаблоном (по форме 152-ФЗ для Политики, terms-of-use для Правил) или очищают её. Если у пользователя ещё нет своего текста, модалка заполняется тем же универсальным fallback'ом, который отдаёт публичная страница, и показывает поясняющий хинт, что это fallback, публикуемый на сайте сейчас.

- **Новый роутер `domain/public.py`** для публичных эндпоинтов `/policy` и `/rules`. Подключён в `utils/routes.py` рядом с другими публичными маршрутами. Выносит логику юридических страниц из `utils/routes.py`, который остаётся тонким.

### Изменено

- **`domain/service.py` разбит на пакет.** Монолитный файл сервиса теперь `domain/service/` с одним миксином на ответственность: `common`, `dns`, `caddy`, `domain`, `robots`, `sitemap`, `legal`, `pages`, плюс `constants` и `facade`, который их собирает. Импорты по проекту обновлены на `domain.service.facade`. Публичный API не изменился — фасад сохраняет своё имя.

- **`_check_dns` теперь async с таймаутом.** Блокирующий вызов `socket.gethostbyname` уводится в thread pool через `run_in_executor` и оборачивается в `asyncio.wait_for` с лимитом 5 секунд (`DNS_RESOLVE_TIMEOUT`). Раньше зависший резолвер мог заблокировать event loop до 30 секунд и остановить все остальные запросы.

- **Ассеты модалок переехали в подпапки `modal/`.** `robots.js`/`robots.css`, `sitemap.js`/`sitemap.css` и `legal.js`/`legal.css` теперь лежат в `domain/modal/<имя>/`. Пути в `modals.js`, `domain.js` и в `_loadCSS()` каждой модалки обновлены. Все импорты остались динамическими с cache-buster `?v=<static_version>`.

- **Формулировка бейджа в `cards.js → renderLegalCard`.** Бейдж для пустого поля теперь «Универсальный текст» вместо «Не задано» — соответствует поведению fallback'а: на публичной странице текст есть, просто он не пользовательский.

### База данных

- **Миграция `fe4f2cf832bb`** добавляет `users.policy` и `users.rules` (обе `TEXT`, nullable). Автогенерация, применяется через `./migrate.sh`.

### Зависимости

- **`markdown-it-py`** требуется на бэкенде. Используется в `domain/public.py` для рендеринга markdown в HTML на лету. Пресет «commonmark» + явное правило `table`; сырой HTML из исходника не пропускается.