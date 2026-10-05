# neurocad 1.0.10

Release date: 2026-10-05

---

## English

### Fixed

- **The "Открыть каталог статей" toolbar button** now opens the public catalog on the owner's domain (`https://neurocad.ru/pages`) instead of a relative `/pages` that resolved against the admin host. The `pages_url` field is now part of the `GET /domain/` response and is computed via `get_public_base_url()` — the same source the sitemap and the "Открыть публичную версию" button use.
- **`normalize_host()` no longer special-cases `APP_DOMAIN`** — `neurocad.ru` now resolves through the custom-domain path, which restores public pages, `robots.txt` and `sitemap.xml` on the platform's root domain.
- **The "Отключить" button for platform domains** (`neurocad.ru`, `neurocad-dev.ru`, `neurocad-demo.ru` and their subdomains) is now disabled in the UI with a "Системный домен — отключение запрещено" tooltip — an accidental click can no longer detach the platform's root domain and put its certificate into the deletion queue.

---

## Русский

### Исправлено

- **Кнопка «Открыть каталог статей»** в тулбаре каталога теперь открывает публичный каталог на домене владельца (`https://neurocad.ru/pages`), а не относительный `/pages`, который резолвился в хост админки. Поле `pages_url` добавлено в ответ `GET /domain/` и вычисляется через `get_public_base_url()` — тот же источник, что у sitemap и кнопки «Открыть публичную версию».
- **`normalize_host()` больше не отсекает `APP_DOMAIN`** — `neurocad.ru` теперь резолвится через custom-domain ветку, что возвращает публичные страницы, `robots.txt` и `sitemap.xml` на корневом домене платформы.
- **Кнопка «Отключить» для системных доменов** (`neurocad.ru`, `neurocad-dev.ru`, `neurocad-demo.ru` и их поддомены) теперь `disabled` в UI с подсказкой «Системный домен — отключение запрещено» — случайный клик больше не отвяжет корневой домен платформы и не отправит его сертификат в очередь на удаление.