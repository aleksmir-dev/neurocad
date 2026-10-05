# neurocad 1.0.8

Release date: 2026-10-05

---

## English

### Added

- **Media library picker in the editor.** Double-clicking an `<img>` in the canvas (and every other built-in GrapesJS path that opens the asset manager) now goes through `BaseAssets` — the same full-screen picker with tabs «Медиатека» / «Логотипы» used by the article edit form.

### Changed

- **Public pages are scoped to the owner's host.** Requests to `/page/...` and `/pages` on a host that does not belong to the nav owner (other subdomain, bare `APP_DOMAIN`, unknown domain) now return 404 instead of serving the page — this fixes cross-domain content duplication.

### Fixed

- **"Открыть публичную версию" button** in the editor now opens the page on the OWNER's public host (via `pageData.public_url` from the backend), not on the technical admin host.
- **Generated images** were written to the package tree instead of the running project's `static/`, so they never appeared in the browser. The static root now comes from `user_static_dir()`.
- **`word/service.py`** had a broken relative import (`...base` → `..base`) that crashed `/word/bydatetime` with HTTP 500.

---

## Русский

### Добавлено

- **Пикер медиатеки в редакторе.** Двойной клик по `<img>` на канвасе (и любые другие встроенные пути GrapesJS, открывающие ассет-менеджер) теперь ведут в `BaseAssets` — тот же полноэкранный пикер с табами «Медиатека» / «Логотипы», что и в форме статьи.

### Изменено

- **Публичные страницы привязаны к домену владельца.** Запросы к `/page/...` и `/pages` на чужом домене (другой поддомен, голый `APP_DOMAIN`, неизвестный домен) теперь возвращают 404 вместо отдачи страницы — это закрывает дублирование контента между доменами.

### Исправлено

- **Кнопка «Открыть публичную версию»** в редакторе теперь открывает страницу на публичном домене владельца (через `pageData.public_url` с бэкенда), а не на техническом хосте админки.
- **Сгенерированные картинки** писались в пакетное дерево вместо `static/` запущенного проекта, поэтому не отображались в браузере. Static-корень теперь берётся из `user_static_dir()`.
- **`word/service.py`** содержал битый относительный импорт (`...base` → `..base`), из-за которого `/word/bydatetime` падал с HTTP 500.