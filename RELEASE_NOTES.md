# neurocad 1.0.15

Release date: 2026-10-07

---

## English

### Added

- **Per-user policy / rules editors.** Domain page → «Документы сайта» → «Редактировать» for each document. The modal (`modal/legal/legal.js`) has a split-pane markdown editor with live preview and a template button. Saved to `users.policy` / `users.rules` via `POST /domain/legal`. Public `/policy` and `/rules` serve the text (or a universal fallback) per Host.
- **`core-footer` block substitutes the real public host on drop** — `© 2026 <public_host>` instead of `site.ru`. Only on drop, never on load. New `editor/brand.js` on `canvas:drop`.

### Changed

- **`editor.js` split.** Auto-save → `editor/autosave.js`; save/cancel/close/clear → `editor/session.js`. Orchestrator ~1050 → ~600 lines.

### Fixed

- **`word/service.py` import path.** After the 1.0.13 service split, `_build_public_url()` still imported from the old `..base.profile.domain.service`. Admin page viewer returned 500. Now `.service.facade`.
- **`ready.css` — footer links kept the blue underline** from `:where(...) a`. Added `border-bottom: none` to `.footer__link`.
- **Legal page date format** — `%d.%m.%Y` instead of ISO (`06.10.2026`, not `2026-10-06`).

---

## Русский

### Добавлено

- **Редакторы policy / rules.** Профиль → Домены → «Документы сайта» → «Редактировать». Модалка `modal/legal/legal.js` — сплит markdown-редактор с живым превью и шаблоном. Сохранение в `users.policy` / `users.rules` через `POST /domain/legal`. Публичные `/policy` и `/rules` отдают текст (или универсальный fallback) по Host.
- **Блок `core-footer` подставляет реальный хост при перетаскивании** — `© 2026 <public_host>` вместо `site.ru`. Только при drop, никогда при загрузке. Новый `editor/brand.js` на `canvas:drop`.

### Изменено

- **`editor.js` разбит.** Auto-save → `editor/autosave.js`; save/cancel/close/clear → `editor/session.js`. Оркестратор ~1050 → ~600 строк.

### Исправлено

- **`word/service.py` — путь импорта.** После разбиения сервиса в 1.0.13 `_build_public_url()` всё ещё импортировал из старого `..base.profile.domain.service`. Просмотрщик страниц в админке отдавал 500. Теперь `.service.facade`.
- **`ready.css` — ссылки футера держали синюю полосу** от `:where(...) a`. Добавлен `border-bottom: none` к `.footer__link`.
- **Формат даты** в юридических страницах — `%d.%m.%Y` вместо ISO (`06.10.2026`, не `2026-10-06`).