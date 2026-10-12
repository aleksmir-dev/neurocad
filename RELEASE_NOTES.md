# neurocad 1.0.23

Release date: 2026-10-12

---

## English

**Home link in the header stays inside the admin shell.** The "Главная" item in the top menu was configured with `href: "/"`, which on the platform host resolves to the public landing page from `.env` — not the admin shell. Clicking it took the user out of the panel. The menu renderer now treats a bare "/" (or an empty href) as "the current module root" and substitutes `window.coreEngine.baseUrl` — `/core/engine/admin` on the admin module. Any other href (a specific path or an absolute URL) is rendered as-is, so custom menu entries keep working.

**Creative report — 500 on `?page=creatives` → "Отчёт" fixed.** `_public_base_for_nav` in `creatives/service.py` used `from ....base…` — four dots — but the domain facade lives one level up from `creatives/`, not four. That raised `ImportError: attempted relative import beyond top-level package` on the first request to `GET /creatives/stats`, and the report tab showed an error instead of data. The import is now `from ..base…`, matching the same pattern already used in `word/url.py`. The report loads normally and the "Страница" column again renders the destination page as a clickable link to its public URL.

## Русский

**Ссылка «Главная» в шапке остаётся внутри админки.** Пункт «Главная» в верхнем меню был настроен как `href: "/"`, а на платформенном хосте `/` резолвится в публичную главную из `.env` — не в админку. Клик уводил пользователя из панели. Рендерер меню теперь трактует пустой `/` (или пустой href) как «корень текущего модуля» и подставляет `window.coreEngine.baseUrl` — на модуле админа это `/core/engine/admin`. Любой другой href (конкретный путь или абсолютный URL) рендерится как есть, поэтому пользовательские пункты меню продолжают работать.

**Отчёт по креативам — 500 на `?page=creatives` → «Отчёт» исправлен.** `_public_base_for_nav` в `creatives/service.py` использовал `from ....base…` — четыре точки — но фасад домена живёт на один уровень выше `creatives/`, а не на четыре. Это давало `ImportError: attempted relative import beyond top-level package` на первом же запросе к `GET /creatives/stats`, и вкладка отчёта показывала ошибку вместо данных. Импорт теперь `from ..base…` — тот же паттерн, что уже используется в `word/url.py`. Отчёт загружается нормально, а столбец «Страница» снова рендерит страницу-назначение кликабельной ссылкой на её публичный URL.