# neurocad 0.1.19

Release date: 2026-09-23

---

## English

### Added

- **Base template extension** — a base template can now be extended by child pages: the base template is rendered as a wrapper, and the child page's content is mounted into the `[data-slot="content"]` region. If the template has no slot, it is shown as a read-only preview.

### Changed

- **Base blocks refactoring** — the base block library has been reworked: a unified block manifest (`blocks/manifest.js`), dynamic versioned imports for block modules, block CSS scoped to `.core-engine-lib-word-blocks`, and category pre-creation with `open: false`.

---

## Русский

### Добавлено

- **Расширение базового шаблона** — базовый шаблон теперь может расширяться дочерними страницами: базовый шаблон рендерится как обёртка, а содержимое дочерней страницы монтируется в область `[data-slot="content"]`. Если в шаблоне нет слота, он показывается как read-only preview.

### Изменено

- **Рефакторинг базовых блоков** — переработана библиотека базовых блоков: единый манифест блоков (`blocks/manifest.js`), динамические версионированные импорты модулей блоков, CSS блоков с ограничением по `.core-engine-lib-word-blocks`, пре-создание категорий с `open: false`.