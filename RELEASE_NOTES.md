# neurocad 1.0.14

Release date: 2026-10-06

---

## English

### Fixed

- **`word/service.py` imported the domain service from the old module path.** After `domain/service.py` was split into the `domain/service/` package in 1.0.13, the late import inside `_build_public_url()` still pointed at `..base.profile.domain.service` — a module that no longer exists. Because the import was inside a function, module load did not fail; the error only surfaced when a page was opened in the editor (`GET /word/item/{id}`, `GET /word/bydatetime/{date}/{time}`), which made the admin page viewer return 500 and the frontend display "страница не найдена". The path is now `..base.profile.domain.service.facade`.

## Русский

### Исправлено

- **`word/service.py` импортировал domain-сервис по старому пути.** После того как в 1.0.13 `domain/service.py` был разбит на пакет `domain/service/`, отложенный импорт внутри `_build_public_url()` всё ещё указывал на `..base.profile.domain.service` — модуль, которого больше нет. Импорт был внутри функции, поэтому загрузка модуля не падала; ошибка проявлялась только при открытии страницы в редакторе (`GET /word/item/{id}`, `GET /word/bydatetime/{date}/{time}`), из-за чего админский просмотрщик страниц возвращал 500 и фронт показывал «страница не найдена». Путь теперь `..base.profile.domain.service.facade`.