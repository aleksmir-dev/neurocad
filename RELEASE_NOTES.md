# RELEASE-NOTES.md

## neurocad 1.0.38

Release date: 2026-10-22

---

### English

- **Fixed logo generation from the article card form.** The "Генерировать" button in the logo media field was POSTing to a stale URL (`/_01_generate_logo/generate`) that no longer existed, so the server returned 405 Method Not Allowed. The endpoint is now the correct `/_01_logo/generate`.
- **Fixed HTML import on regular (non-template) pages.** The 1.0.36 fix that moves the GrapesJS iframe back into the template slot was running for every page. On a regular page the canvas *is* the slot, so `slotEl.innerHTML = ''` wiped the page — the imported HTML only appeared after saving and reloading. The iframe re-attach is now guarded by `template_id`: it runs only for template children, exactly as before. Regular pages render the imported HTML immediately.

### Русский

- **Исправлена генерация логотипа из формы карточки статьи.** Кнопка «Генерировать» в поле «Логотип» отправляла POST на устаревший URL (`/_01_generate_logo/generate`), которого больше нет, — сервер отвечал 405 Method Not Allowed. Теперь используется правильный эндпоинт `/_01_logo/generate`.
- **Исправлен импорт HTML на обычных (не шаблонных) страницах.** Фикс из 1.0.36, возвращавший iframe GrapesJS в слот шаблона, выполнялся для всех страниц. На обычной странице canvas *и есть* слот, поэтому `slotEl.innerHTML = ''` стирал страницу — импортированный HTML появлялся только после сохранения и перезагрузки. Теперь перенос iframe выполняется только при наличии `template_id` (дочерние страницы шаблона), как и было задумано. Обычные страницы показывают импортированный HTML сразу.