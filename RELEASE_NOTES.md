# neurocad 1.0.6

Release date: 2026-10-04

---

## English

### Added

- **`sitemap.xml`.** Generated on the fly from the `pages` table — nothing is stored, so adding, editing or deleting a page requires no cache invalidation. Served as `application/xml` on the user's public host (`https://<login>.<APP_DOMAIN>/sitemap.xml` or `https://<custom-domain>/sitemap.xml`). A read-only viewer in the domain admin page shows the same XML.
- **Cookie consent banner** on public pages (article + catalog). Self-contained script, one "Согласен" button, remembered in `localStorage`.

### Changed

- **`domain.js` split into modules:** `cards.js` (renderers), `actions.js` (submit handlers), `modals.js` (modal openers), `helpers.js` (utilities). `domain.js` is now an orchestrator only.
- **`sitemap.css` restyled** to match `robots.css` (light palette, same overlay, same dialog box).

### Fixed

- **Tokens were not credited when switching to a paid tariff.** `change_tarif` set `limit_tokens` but left `tokens = 0`, blocking the LLM until the next billing day. Tokens are now raised up to the new cap, never lowered — no farming by switching tariffs back and forth.
- **"Перейти к балансу" link in the chat error** pointed at `?auth=profile`, which the router treats as an auth form and sends the user to the login page instead of the profile. Now uses `?page=profile&section=balance`, and strips any stale `?auth=` from the URL.

---

## Русский

### Добавлено

- **`sitemap.xml`.** Генерируется на лету из таблицы `pages` — ничего не хранится, добавление / редактирование / удаление страницы не требует инвалидации кэша. Отдаётся как `application/xml` на публичном домене пользователя (`https://<login>.<APP_DOMAIN>/sitemap.xml` или `https://<custom-domain>/sitemap.xml`). Просмотр того же XML — в админке на странице доменов.
- **Cookie-баннер** на публичных страницах (статья + каталог). Самодостаточный скрипт, одна кнопка «Согласен», запоминается в `localStorage`.

### Изменено

- **`domain.js` разбит на модули:** `cards.js` (рендер карточек), `actions.js` (submit-обработчики), `modals.js` (открытие модалок), `helpers.js` (утилиты). `domain.js` — теперь только оркестратор.
- **`sitemap.css` приведён к стилю `robots.css`** (светлая палитра, тот же оверлей, тот же диалог).

### Исправлено

- **Токены не начислялись при смене тарифа на платный.** `change_tarif` обновлял `limit_tokens`, но не трогал `tokens = 0` — LLM был заблокирован до следующего расчётного дня. Теперь `tokens` поднимаются до нового лимита, никогда вниз — фарм сменой тарифов невозможен.
- **Ссылка «Перейти к балансу» в чате** вела на `?auth=profile` — роутер обрабатывал это как форму авторизации и уводил на страницу логина вместо профиля. Теперь `?page=profile&section=balance`, а старый `?auth=` из URL удаляется.
