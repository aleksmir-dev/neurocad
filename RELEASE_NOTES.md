# neurocad 1.0.16

Release date: 2026-10-07

---

## English

### Added

- **External link cards for the catalog.** Pages now have an optional `url` field (`pages.url`, `VARCHAR(2048)`, nullable). When set, the page is treated as a *link card*: both the admin catalog and the public catalog open that URL on click, in the current tab, instead of the internal `/page/<date>/<time>` target. The editor is still reachable — the page keeps its own admin URL, `url` only changes where a catalog card click goes.

- **`url` field in the create/edit form** in the admin catalog (`Внешняя ссылка`). Leave blank to turn a link card back into a regular page.

- **`url` badge on cards in the admin catalog** (`↗`) — a small visual marker that a card leads to an external site.

- **`url` surfaced in the API** — `CoreEngineLibPagesItemListItem`, `CoreEngineLibPagesPublicItemListItem`, `_page_to_dict` (word editor) and `pages/service.py` all carry the field, so every consumer (admin catalog, public catalog, editor toolbar) can decide where a card links.

### Changed

- **`word/service.py → _page_to_dict`** — `public_url` now equals `page.url` when set; falls back to `_build_public_url()` otherwise. This makes the "Открыть публичную версию" button in the editor lead to the external URL for link cards.

- **Trait `page-link` in the editor** — `list_for_user` returns the external `url` for link cards instead of the internal `/page/<date>/<time>` path, so links inserted into article content point at the right target.

### Database

- **Migration `bd36e37c3294`** adds `pages.url` (`VARCHAR(2048)`, nullable). Auto-generated, applied with `./migrate.sh`.

---

## Русский

### Добавлено

- **Карточки-ссылки на внешние сайты в каталоге.** У страниц появилось необязательное поле `url` (`pages.url`, `VARCHAR(2048)`, nullable). Если оно задано, страница считается *карточкой-ссылкой*: и админский, и публичный каталоги при клике открывают этот URL в текущей вкладке вместо внутренней страницы `/page/<date>/<time>`. Редактор остаётся доступен — страница сохраняет свой админский URL, `url` меняет только то, куда ведёт клик по карточке.

- **Поле `url` в форме создания/редактирования** статьи в админском каталоге («Внешняя ссылка»). Оставьте пустым — карточка снова станет обычной статьёй.

- **Бейдж `↗` на карточках в админском каталоге** — маленькая метка, что карточка ведёт на внешний сайт.

- **`url` в API** — `CoreEngineLibPagesItemListItem`, `CoreEngineLibPagesPublicItemListItem`, `_page_to_dict` (редактор) и `pages/service.py` — все отдают поле, чтобы каждый потребитель (админский каталог, публичный каталог, тулбар редактора) знал, куда ведёт карточка.

### Изменено

- **`word/service.py → _page_to_dict`** — `public_url` теперь равен `page.url`, если он задан; иначе — `_build_public_url()`. Кнопка «Открыть публичную версию» в редакторе для карточек-ссылок ведёт на внешний URL.

- **Trait `page-link` в редакторе** — `list_for_user` возвращает внешний `url` для карточек-ссылок вместо внутреннего `/page/<date>/<time>`, чтобы вставленные в контент ссылки вели куда надо.

### База данных

- **Миграция `bd36e37c3294`** добавляет `pages.url` (`VARCHAR(2048)`, nullable). Автогенерация, применяется через `./migrate.sh`.