# RELEASE-NOTES.md

## neurocad 1.0.31

Release date: 2026-10-16

---

### English

- **Inventory (`botinv`) fixes and MAX bot.** Mobile layout puts the chat in `area-center`, the table's filter row and toolbar survive every re-render, list actions use SVG icons, the chat candidate list highlights row numbers in bordeaux and inventory numbers in blue via escaped HTML, `BaseModalInput` / `BaseModalDate` no longer flash unstyled on a cold cache, and the module now ships a MAX chat-bot (`botinv/max.py` + `POST /botinv/max/webhook`) where the accountant picks a room with `#405`, types an inventory number, and taps a candidate button — the bot marks the item in the same active sheet the web UI shows, enabled per-user via `MAX_ALLOWED_USER_ID` in `.env` plus a `use_botinv = 1` lookup, with TLS trusting the system CA bundle so the Russian Trusted Root CA is honoured.

### Русский

- **Исправления инвентаризации (`botinv`) и бот MAX.** На мобильном чат занимает `area-center`, строка фильтров и тулбар таблицы переживают каждую перерисовку, кнопки действий в списке используют SVG-иконки, список кандидатов в чате выделяет номера бордовым и инвентарные номера синим через экранированный HTML, `BaseModalInput` / `BaseModalDate` больше не мелькают без стилей на холодном кэше, и у модуля появился чат-бот MAX (`botinv/max.py` + `POST /botinv/max/webhook`), где бухгалтер выбирает кабинет командой `#405`, вводит инвентарный номер и тапает кнопку с кандидатом — бот отмечает позицию в той же активной ведомости, что показывает веб-интерфейс, включается per-user через `MAX_ALLOWED_USER_ID` в `.env` плюс поиск пользователя с `use_botinv = 1`, а TLS доверяет системному CA-бандлу, поэтому Russian Trusted Root CA распознаётся корректно.