# neurocad 1.0.2

Release date: 2026-10-03

---

## English

### Added

- **Home page.** Pick a page from the new "Home page" card in Profile → Domains. It opens when a visitor hits the user's subdomain or custom domain with no path. If no page is chosen, the first page by date is used.
- **Custom domains now resolve to their owner.** Both `<login>.neurocad.ru` and a connected second-level domain (`example.com`) redirect to the owner's home page.

### Changed

- **`APP_DOMAIN` in settings.** The root domain is now read from `config.py` (default `neurocad.ru`) instead of being hardcoded. A single `.env` line switches between environments.
- **`auth` vs `page` query params.** `?auth=` now only accepts auth forms (login / register / restore / password); app pages use `?page=profile` / `?page=setup`.

### Fixed

- **"Выход" and "Настройки" buttons in the header.** The menu click handler is now attached to `document` and survives any re-render of the header, so the buttons work on the profile and setup pages too.
- **Logout URL.** `auth.js` was calling `/core/auth/logout`; the actual endpoint is `/core/auth/login/logout`. Fixed.
- **Login error messages.** A failed login shows "Неверный логин или пароль" instead of the generic "Session expired".
- **Inline SVG no longer stripped.** Inline SVG stays in the markup; it is not replaced by an `<img>` and no longer breaks the visual design on import / export.
- **Trial tariff label.** New users see "Trial" instead of "Free" in the balance page.
- **Trial tokens.** New users get 2 000 000 tokens immediately on registration, so the first LLM request works without waiting for a reset.

---

## Русский

### Добавлено

- **Главная страница.** В карточке «Главная страница» (Профиль → Домены) можно выбрать, что открывается при заходе на поддомен или кастомный домен без пути. Если ничего не выбрано — показывается первая страница по дате.
- **Кастомные домены резолвятся на владельца.** И `<login>.neurocad.ru`, и подключённый домен второго уровня (`example.com`) редиректят на личную главную владельца.

### Изменено

- **`APP_DOMAIN` в настройках.** Корневой домен читается из `config.py` (по умолчанию `neurocad.ru`), а не захардкожен. Одна строка в `.env` переключает окружения.
- **`auth` и `page` в URL.** `?auth=` теперь принимает только формы авторизации (login / register / restore / password); страницы приложения — `?page=profile` / `?page=setup`.

### Исправлено

- **Кнопки «Выход» и «Настройки» в хедере.** Обработчик клика теперь висит на `document` и переживает любую перерисовку хедера — кнопки работают и на странице профиля, и в настройках.
- **URL выхода.** `auth.js` дёргал `/core/auth/logout`, а эндпоинт — `/core/auth/login/logout`. Поправлено.
- **Ошибки при входе.** При неверном логине показывается «Неверный логин или пароль», а не общее «Session expired».
- **Inline SVG больше не вырезается.** SVG остаётся в разметке, не заменяется на `<img>` и не ломает дизайн при экспорте/импорте.
- **Название trial-тарифа.** Новые пользователи видят «Trial», а не «Free».
- **Токены trial-тарифа.** Новый пользователь сразу получает 2 000 000 токенов, первый запрос к LLM работает без ожидания сброса.