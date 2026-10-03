# neurocad 1.0.4

Release date: 2026-10-04

---

## English

### Added
- **robots.txt editor.** Both domain cards (free subdomain and custom second-level domain) now have a "Редактировать robots.txt" button that opens a universal modal — one modal, two targets. On save it stores the text in `users.robots_3` or `users.robots_2`.
- **`users.robots_2` and `users.robots_3` columns.** Two new `TEXT` columns on `users` hold the robots.txt body for the custom second-level domain and the free third-level subdomain respectively. Both are nullable — `NULL` is substituted with the default "closed" body at read time.
- **`GET /robots.txt`.** Served for any host: subdomain → `robots_3`, custom domain → `robots_2`, apex / unknown → `ROBOTS_CLOSED`. Always `200 text/plain`, no redirects, no caching.
- **`POST /core/engine/lib/base/profile/domain/robots`.** New endpoint with body `{ which: "2" | "3", robots: "<text>" }`. Saves the file for the selected target.

### Changed
- **Default robots.txt state.** The free subdomain is closed to crawlers by default. Attaching a custom domain opens its robots.txt (`ROBOTS_OPEN` if it was empty) and closes the subdomain's (`ROBOTS_CLOSED`). Detaching reopens the subdomain (`ROBOTS_OPEN`), keeping the custom-domain body for the next attach.

### Fixed
- **Nothing from 1.0.3 was regressed.** The real TLS certificate check and clickable domain links stay as they were.

---

## Русский

### Добавлено
- **Редактор robots.txt.** В обеих карточках (бесплатный поддомен и свой домен 2 уровня) появилась кнопка «Редактировать robots.txt», открывающая универсальную модалку — одна модалка, две цели. При сохранении текст пишется в `users.robots_3` или `users.robots_2`.
- **Поля `users.robots_2` и `users.robots_3`.** Две новые колонки типа `TEXT` в таблице `users` хранят тело robots.txt для кастомного домена 2 уровня и для бесплатного поддомена 3 уровня соответственно. Обе nullable — при чтении `NULL` подменяется дефолтным «закрытым» текстом.
- **`GET /robots.txt`.** Отдаётся для любого хоста: поддомен → `robots_3`, кастомный домен → `robots_2`, апекс / неизвестный → `ROBOTS_CLOSED`. Всегда `200 text/plain`, без редиректов и без кеша.
- **`POST /core/engine/lib/base/profile/domain/robots`.** Новый эндпоинт с телом `{ which: "2" | "3", robots: "<текст>" }`. Сохраняет файл для выбранной цели.

### Изменено
- **Дефолтное состояние robots.txt.** Бесплатный поддомен по умолчанию закрыт от роботов. При подключении кастомного домена его robots.txt открывается (`ROBOTS_OPEN`, если был пустым), а поддомен закрывается (`ROBOTS_CLOSED`). При отключении поддомен снова открывается (`ROBOTS_OPEN`), текст кастомного домена сохраняется на случай повторного подключения.

### Исправлено
- **Ничего из 1.0.3 не сломано.** Реальная TLS-проверка сертификата и кликабельные ссылки на домены остались как были.

---

## Файлы, затронутые в 1.0.4

### Backend
- `app/core/models/user.py` — поля `robots_2`, `robots_3` (Text, nullable).
- `alembic/versions/b34d42853cc7_*.py` — миграция через `batch_alter_table` (SQLite).
- `neurocad/core/engine/lib/base/profile/domain/schema.py` — `robots_2` / `robots_3` в `Data`, поле `which` в `SetRobotsRequest` / `SetRobotsData`.
- `neurocad/core/engine/lib/base/profile/domain/service.py` — `robots_3` в `get_for_user`, `set_robots(which, text)`, тогглы `robots_2` / `robots_3` в `add_custom` / `remove_custom`.
- `neurocad/core/engine/lib/base/profile/domain/route.py` — `POST /robots` прокидывает `which` и отвечает `{which, robots}`.
- `neurocad/utils/routes.py` — `GET /robots.txt`.

### Frontend
- `neurocad/core/engine/lib/base/profile/domain/domain.js` — две кнопки `edit-robots` (`data-which="3"` в поддомене, `data-which="2"` в кастомном), `_openRobotsModal(which)` с передачей домена через `setDomain`.
- `neurocad/core/engine/lib/base/profile/domain/robots.js` — новый файл: `RobotsModal`, `open(which, initialText)`, `setDomain(domain)`, пресеты «Открыть всем» / «Закрыть от всех», кнопки «Отмена» / «ОК».
- `neurocad/core/engine/lib/base/profile/domain/robots.css` — новый файл: оверлей, диалог, пресеты сверху слева, кнопки внизу справа, мобильная адаптация.