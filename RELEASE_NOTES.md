# RELEASE-NOTES.md

## neurocad 1.0.32

Release date: 2026-10-16

---

### English

- **`botinv`: chat and MAX-bot cleanup.** The candidate list in both channels (web chat and MAX bot) is now just the rows and buttons — no header, no plural hint, no "Всего найдено N". Inline buttons in the web chat are the primary blue gradient with white bold text and a raised shadow, sized for touch on mobile; the same layout is used by the MAX bot. Single substring hits are no longer marked automatically — the service always returns `ambiguous` (1..CANDIDATE_LIMIT candidates) and only marks when called with `chosen_id`, so the user confirms by tapping a button in both channels. `_mark_item` writes «Отмечено в каб. X» instead of «Отмечена», and a repeat no longer starts the note with a stray `;`. The MAX webhook logs `user_id`, `username` and `name` on every `/start`.

### Русский

- **`botinv`: чистка чата и MAX-бота.** Список кандидатов в обоих каналах (веб-чат и MAX-бот) теперь состоит только из строк и кнопок — без заголовка, без подсказки, без «Всего найдено N». Inline-кнопки в веб-чате — основной синий градиент с белым жирным текстом и лёгкой тенью, размер подобран для тапа на мобильном; тот же layout использует MAX-бот. Одиночное совпадение по подстроке больше не отмечается автоматически — сервис всегда возвращает `ambiguous` (1..CANDIDATE_LIMIT кандидатов) и отмечает только при вызове с `chosen_id`, поэтому пользователь подтверждает тапом кнопки в обоих каналах. `_mark_item` пишет «Отмечено в каб. X» вместо «Отмечена», и повтор больше не начинает примечание с висящей `;`. Webhook MAX логирует `user_id`, `username` и `name` на каждом `/start`.