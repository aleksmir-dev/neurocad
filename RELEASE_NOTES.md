# neurocad 1.0.11

Release date: 2026-10-05

---

## English

### Changed

- **Public URLs are now host-based and contain no `nav_id`.** Single pages live at `/page/<YYYYMMDD>/<HHMMSS>` and the catalog at `/pages` — the user is resolved from the request Host (subdomain `<login>.<APP_DOMAIN>` or a registered custom domain), and the page is looked up within that user's navs. `nav_id` remains an internal concept (used by the admin editor and admin API), but never appears in a public address. This makes URLs shorter, shareable, and consistent with the multi-tenant host model.

### Fixed

- **`demo.neurocad.ru/pages` returned 404.** The catalog without an explicit `?nav_id=` used to resolve "the first nav in the DB" (which is admin's), then the host-ownership check rejected it. Now the nav is resolved from the request Host — `demo.neurocad.ru/pages` shows demo's catalog, `user1.neurocad.ru/pages` shows user1's, and the DB-wide fallback is only used for dev hosts.

---

## Русский

### Изменено

- **Публичные URL теперь host-based и не содержат `nav_id`.** Отдельные страницы живут по адресу `/page/<YYYYMMDD>/<HHMMSS>`, каталог — по `/pages`. Пользователь определяется по Host'у запроса (поддомен `<login>.<APP_DOMAIN>` или привязанный домен второго уровня), а страница ищется среди nav'ов этого пользователя. `nav_id` остался внутренним понятием (используется редактором и админским API), но никогда не появляется в публичном адресе. Это делает URL короче, удобнее для шаринга и согласованнее с моделью мультитенантных доменов.

### Исправлено

- **`demo.neurocad.ru/pages` возвращал 404.** Каталог без явного `?nav_id=` резолвился как «первый nav в БД» (это nav admin'а), после чего host-ownership проверка его отклоняла. Теперь nav резолвится из Host'а запроса — `demo.neurocad.ru/pages` показывает каталог demo, `user1.neurocad.ru/pages` показывает каталог user1, а общий fallback используется только для dev-хостов.