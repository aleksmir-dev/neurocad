# RELEASE-NOTES.md

## neurocad 1.0.37

Release date: 2026-10-22

---

### English

- **Catalog pages are now sorted by date (newest first), not alphabetically.** The client-side sort in `base/cards/render.js` was reordering pages by title, overriding the backend order. Page sorting is now delegated to the backend (`pages/service.py` → `get_list`), which already returns pages by `datetime DESC`. Folders keep their own order (`sort_order` → `title`) and stay above pages, as before.

### Русский

- **Страницы каталога теперь сортируются по дате (новые сверху), а не по алфавиту.** Клиентская сортировка в `base/cards/render.js` переупорядочивала страницы по заголовку, перебивая порядок с бэкенда. Сортировка страниц передана бэкенду (`pages/service.py` → `get_list`), который и так отдаёт страницы по `datetime DESC`. Папки сохраняют свой порядок (`sort_order` → `title`) и по-прежнему идут выше страниц.