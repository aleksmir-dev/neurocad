# neurocad 1.0.9

Release date: 2026-10-05

---

## English

### Changed

- **Platform root domain is bound to the system admin.** `users.domain = 'neurocad.ru'` for the first superadmin, so the bare `APP_DOMAIN` now resolves through the custom-domain path. This restores public pages, `robots.txt` and `sitemap.xml` on `neurocad.ru/page/...` — which 1.0.8's host-scope check had (unintentionally) blocked.
- **`normalize_host()` no longer special-cases `APP_DOMAIN`.** It returns `neurocad.ru` as-is, letting the custom-domain lookup find the system admin. `slug_from_host()` still ignores the bare domain (it is not a user subdomain) — that behaviour is unchanged.

### Fixed

- **Detach button for platform domains is now disabled in the UI.** The "Отключить" button for `neurocad.ru`, `neurocad-dev.ru`, `neurocad-demo.ru` (and their subdomains) is greyed out with a tooltip «Системный домен — отключение запрещено» — an accidental click can no longer detach the platform's root and send its certificate into Caddy's deletion queue.

---

## Русский

### Изменено

- **Корневой домен платформы привязан к системному админу.** `users.domain = 'neurocad.ru'` у первого суперадмина, поэтому голый `APP_DOMAIN` теперь резолвится через custom-domain ветку. Это возвращает публичные страницы, `robots.txt` и `sitemap.xml` на `neurocad.ru/page/...` — которые host-scope-проверка в 1.0.8 (непреднамеренно) заблокировала.
- **`normalize_host()` больше не отсекает `APP_DOMAIN`.** Возвращает `neurocad.ru` как есть, чтобы custom-domain lookup нашёл системного админа. `slug_from_host()` по-прежнему игнорирует голый домен (это не поддомен пользователя) — это поведение не менялось.

### Исправлено

- **Кнопка «Отключить» для системных доменов теперь disabled в UI.** Для `neurocad.ru`, `neurocad-dev.ru`, `neurocad-demo.ru` (и их поддоменов) кнопка серая с подсказкой «Системный домен — отключение запрещено» — случайный клик больше не отвяжет корневой домен и не отправит его сертификат в очередь на удаление.