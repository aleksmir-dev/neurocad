# neurocad 1.0.27

Release date: 2026-10-15

---

## English

- **`botinv` module polish and modal fixes.** Mobile layout now puts the chat in `area-center` (the table is not mounted on mobile); the table's filter row and toolbar are re-installed after every base re-render; list actions use SVG icons; the chat candidate list highlights row numbers in bordeaux and inventory numbers in blue via escaped HTML (`BaseChat.addMessage` gained an `asHtml` flag); `_mark_item` no longer prints «Каб. до: None» — it says «Находится в каб. X» when the sheet has no "before" room. `BaseModalInput` and `BaseModalDate` no longer flash unstyled on a cold cache (inline `display: none` + `_cssReady` awaited in `async open()`), and `base/modal/index.js` now appends `?v=<static_version>` to its dynamic imports. `BaseModalDate` gained the missing `_populateMonthSelect()` and `setOnCancel`.

## Русский

- **Доработка модуля `botinv` и модалок.** На мобильном чат теперь занимает `area-center` (таблица на мобильном не монтируется); строка фильтров и тулбар таблицы переустанавливаются после каждой перерисовки базовой Table; кнопки действий в списке используют SVG-иконки; список кандидатов в чате выделяет номера бордовым, инвентарные — синим через экранированный HTML (у `BaseChat.addMessage` появился флаг `asHtml`); `_mark_item` больше не пишет «Каб. до: None» — при отсутствии комнаты «до» выводится «Находится в каб. X». `BaseModalInput` и `BaseModalDate` больше не мелькают без стилей на холодном кэше (инлайн `display: none` + `_cssReady`, дожидаемый в `async open()`), а `base/modal/index.js` теперь добавляет `?v=<static_version>` к динамическим импортам. В `BaseModalDate` добавлены отсутствовавшие `_populateMonthSelect()` и `setOnCancel`.