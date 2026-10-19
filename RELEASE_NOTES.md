# RELEASE-NOTES.md

## neurocad 1.0.36

Release date: 2026-10-19

---

### English

- **Fixed HTML import and code injection in template mode.** Resolved an issue where importing a page or applying HTML via the `<>` modal would break the base template (the iframe would detach from its slot). The editor now correctly repositions the rendered content back into the template's slot, preserving the layout.

### Русский

- **Исправлен импорт HTML и вставка кода в режиме шаблона.** Устранена проблема, из-за которой при импорте страницы или применении HTML через модалку `<>` ломался базовый шаблон (iframe «отвязывался» от своего слота). Теперь редактор корректно возвращает отрендеренный контент на место в слот шаблона, сохраняя вёрстку.