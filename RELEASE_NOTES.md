# neurocad 1.0.7

Release date: 2026-10-05

---

## English

### Fixed

- **Generated images were saved to the wrong static tree.** `images/service.py` resolved the static root from `__file__`, which pointed at the neurocad **package** checkout instead of the running **project**. New SVGs were written to `<package>/static/...` while the web server served `<project>/static/...`, so every fresh image returned 404 on the `/static/...` URL the frontend actually requested. The path now comes from `user_static_dir()` in `utils/paths.py` — the same single source of truth used elsewhere — and images load again.

---

## Русский

### Исправлено

- **Сгенерированные изображения сохранялись не в ту статику.** `images/service.py` вычислял static-корень из `__file__`, который указывал на чекаут **пакета** neurocad, а не на запущенный **проект**. Новые SVG писались в `<пакет>/static/...`, а веб-сервер отдавал из `<проект>/static/...` — поэтому каждая свежая картинка возвращала 404 на URL `/static/...`, который запрашивал фронтенд. Теперь путь берётся из `user_static_dir()` в `utils/paths.py` — единый источник правды, используемый в остальном коде — и картинки снова загружаются.