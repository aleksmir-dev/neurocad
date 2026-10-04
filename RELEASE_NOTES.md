# neurocad 1.0.5

Release date: 2026-10-04

---

## English

### Added
- **Admin impersonation.** A superadmin can log in as any user from the balance page ("Войти" per row) without knowing their password, and return to their own session with one click. A yellow bar under the header always shows the impersonated login. The session switch is a JWT cookie (`sub` = target, `imp_by` = admin) — no DB writes, no password access.
- **`neurocad create-user` CLI.** New subcommand creates a user through the same code path as the registration form, but skips the 8-character login minimum. For technical accounts with short logins (`demo`, `docs`, `wiki`) that would otherwise collide with system subdomains. Balance and personal Nav are created like for a regular signup.
- **Public article catalog at `/pages`.** A JS-free page listing every active, non-deleted article of the current nav. Reachable from the admin catalog toolbar and from the subdomain root. Title comes from `Nav.name` and is editable in place via a new "Заголовок" toolbar button.

### Changed
- **`profile/route.py`** now returns `impersonated_by` in the current-user payload, so the frontend can tell an impersonated session from a normal one.
- **`Header.setUser()`** re-renders the header in place, so the impersonation bar appears the moment the session switches.
- **Login, impersonate and stop share one `_set_session_cookie` helper** so their cookie attributes cannot drift apart.

### Fixed
- **`POST /core/auth/impersonate/stop` returned 422.** The route was declared after `POST /impersonate/{user_id}`, so `stop` was parsed as a `user_id` value. Literal routes now come before dynamic ones.
- **Frontend kept stale session data after impersonation.** `sessionStorage.clear()` before reload forces `auth._restoreSessionAsync()` to fetch the current user from the server via `GET /core/engine/lib/base/profile/`.
- **`auth._restoreSession()` only read `sessionStorage`.** Now, if the cache is empty and a valid cookie is present, it falls back to the server — so a fresh tab or an externally swapped cookie no longer appears as a guest.

---

## Русский

### Добавлено
- **Импосонация администратором.** Суперадмин может войти под любым пользователем со страницы баланса (кнопка «Войти» в строке) без знания пароля и одной кнопкой вернуться в свою сессию. Под шапкой всегда видна жёлтая плашка с логином импосонированного. Переключение — JWT-cookie (`sub` = цель, `imp_by` = админ), без записи в БД и без доступа к паролю.
- **CLI `neurocad create-user`.** Новая подкоманда создаёт пользователя тем же путём, что и форма регистрации, но пропускает минимум 8 символов в логине. Для технических аккаунтов с короткими логинами (`demo`, `docs`, `wiki`), которые иначе конфликтуют с системными поддоменами. Баланс и личный Nav создаются как при обычной регистрации.
- **Публичный каталог статей на `/pages`.** JS-free страница со списком всех активных неудалённых статей текущего nav'а. Доступна из тулбара админского каталога и из корня поддомена. Заголовок берётся из `Nav.name` и правится на месте кнопкой «Заголовок» в тулбаре.

### Изменено
- **`profile/route.py`** теперь возвращает `impersonated_by` в payload текущего пользователя — фронт отличает импосонированную сессию от обычной.
- **`Header.setUser()`** перерисовывает шапку на месте — плашка импосонации появляется в момент переключения сессии.
- **Login, impersonate и stop используют один `_set_session_cookie`** — атрибуты cookie больше не разъезжаются.

### Исправлено
- **`POST /core/auth/impersonate/stop` возвращал 422.** Роут был объявлен после `POST /impersonate/{user_id}`, поэтому `stop` парсился как значение `user_id`. Теперь литеральные роуты идут до динамических.
- **Фронт сохранял старые данные сессии после импосонации.** `sessionStorage.clear()` перед reload заставляет `auth._restoreSessionAsync()` сходить на сервер за текущим пользователем через `GET /core/engine/lib/base/profile/`.
- **`auth._restoreSession()` читал только `sessionStorage`.** Теперь при пустом кэше и валидной cookie идёт fallback на сервер — свежая вкладка или подменённая извне cookie больше не выглядят как гость.

---

## Файлы, затронутые в 1.0.5

### Backend
- `neurocad/core/auth/validators.py` — `validate_login(login, skip_min_length=False)`.
- `neurocad/core/auth/register/service.py` — `register_user(..., skip_login_length_check=False)`.
- `neurocad/core/auth/register/schema.py` — docstring про CLI-обход.
- `neurocad/core/auth/dependencies.py` — чтение `imp_by` из JWT, проброс в user как `impersonated_by`.
- `neurocad/core/auth/service.py` — комментарии на английском.
- `neurocad/core/auth/route.py` — подключение `impersonate_router`.
- `neurocad/core/auth/impersonate/__init__.py` — новый.
- `neurocad/core/auth/impersonate/route.py` — новый: `POST /stop` (объявлен первым), `POST /{user_id}`.
- `neurocad/core/engine/lib/base/profile/route.py` — `impersonated_by` в ответе.
- `neurocad/core/engine/lib/pages/route.py` — `GET /nav-name`, `PUT /nav-name`.
- `neurocad/core/engine/lib/pages/public/route.py` — `router_pages`, `GET /pages`, `_resolve_nav_name`.
- `neurocad/core/engine/lib/pages/public/service.py` — `get_list`, `_page_to_list_item`.
- `neurocad/core/engine/lib/pages/public/schema.py` — `url` в `ListItem`, `nav_id` в `ListResponse`.
- `neurocad/utils/routes.py` — подключение `router_pages`.
- `neurocad/cli.py` — подкоманда `create-user`.

### Frontend
- `neurocad/core/engine/lib/base/auth/auth.js` — `_restoreSessionAsync()`, fallback на `/profile/`.
- `neurocad/core/engine/lib/base/header.js` — `_renderImpersonationBar()`, `_rerender()`, `_handleStopImpersonate()`.
- `neurocad/core/engine/lib/base/header.css` — стили плашки, `.header` → `flex-direction: column`.
- `neurocad/core/engine/lib/base/balance/balance.js` — кнопка «Войти», `_handleImpersonate()`.
- `neurocad/core/engine/lib/base/cards/toolbar.js` — extra-кнопки в левой группе.
- `neurocad/core/engine/lib/base/cards/toolbar/toolbar.css` — стили `<a>.cards-toolbar-btn`.
- `neurocad/core/engine/lib/base/cards/cards.js` — `extraToolbarButtons` в конструкторе.
- `neurocad/core/engine/lib/base/cards/initool.js` — нормализация `extraToolbarButtons`.
- `neurocad/core/engine/lib/pages/pages.js` — две extra-кнопки, вызов модалки заголовка.
- `neurocad/core/engine/lib/pages/title.js` — новый: `PagesTitle`.
- `neurocad/core/engine/lib/pages/public/pages.html` — новый шаблон каталога.
- `neurocad/core/engine/lib/pages/public/pages.css` — новый.
- `neurocad/core/engine/lib/base/images/title.svg` — новая иконка.