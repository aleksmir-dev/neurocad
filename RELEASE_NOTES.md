# neurocad 1.0.12

Release date: 2026-10-05

---

## English

### Fixed

- **Page-link trait in the editor now inserts public URLs without `nav_id`.** The `GET /pages/my-list` endpoint (used by the trait's `<select>`) used to return `/page/<nav_id>/<date>/<time>` for every page. Links inserted into article content via the trait therefore carried `nav_id`, which does not belong in a public URL. The service now returns `/page/<date>/<time>` — matching the host-based public URL scheme introduced in 1.0.11.

### Added

- **Platform root domain is bound to the system admin in the test environment.** `users.domain = 'neurocad-dev.ru'` for the first superadmin, so `https://neurocad-dev.ru/page/...` and `https://neurocad-dev.ru/pages` resolve through the custom-domain path just like on prod. This is a database-only change, no code — kept here for reference so both environments stay in sync.

---

## Русский

### Исправлено

- **Trait «Ссылка» в редакторе теперь вставляет публичные URL без `nav_id`.** Эндпоинт `GET /pages/my-list` (его использует `<select>` внутри trait'а) отдавал `/page/<nav_id>/<date>/<time>` для каждой страницы. Ссылки, которые вставлялись в контент статьи через trait, несли с собой `nav_id`, а он в публичном URL не нужен. Теперь сервис отдаёт `/page/<date>/<time>` — в соответствии с host-based схемой публичных URL из 1.0.11.

### Добавлено

- **Корневой домен тестового окружения привязан к системному админу.** `users.domain = 'neurocad-dev.ru'` у первого суперадмина — теперь `https://neurocad-dev.ru/page/...` и `https://neurocad-dev.ru/pages` резолвятся через custom-domain ветку, как и на проде. Это правка только в базе, без кода — оставлено для справки, чтобы окружения не разъезжались.