# neurocad 1.0.20

Release date: 2026-10-11

---

## English

**Creatives and placements.** The Creative model has grown from a bare name + URL into a full ad record: `text`, `button_text`, `brand`, `inn` are now part of the payload. The admin page at `?page=creatives` was reworked accordingly — the create/edit modal has eight fields, all optional except `name`. On the placements tab, the toolbar button «Создать размещение» and the per-row «Удалить» button were removed: placements are born on the page, not here. To close a placement, you edit the page and clear the «Креатив» select or uncheck «Публиковать».

**Creative block on a page.** A new ready-made section `core-creative` was added to the block library (category «Секции»). It renders an advertising insert — text, link, and the three legal markers required by Russian law: «Реклама», advertiser name, INN, and ERID. On drop, the block automatically fills itself from the creative already attached to the page (the select in the page properties), with no extra modal to re-ask what the user just chose. If no creative is attached, the block ships with placeholders and the editor fills it in by hand.

**Bug fix — modal form.** `BaseModalForm` reused a stale container in the DOM when a new modal instance was created. Old listeners from previous instances stayed attached and fired along with the new one, each calling `_collectData()` on its own detached inputs. The server then received empty values for exactly the fields the user just filled. The fix is simple: `_createDOM()` now always removes the stale container before creating a fresh one.

**Internal.** `creative.js` was added to the editor — a 1:1 copy of `brand.js` for the drop-time patcher. `manifest.json` in the block library now lists `creative-block` as a class of `ReadyBlocks`, so the backend picks up `ready.css` even on pages that contain nothing but this block.

## Русский

**Креативы и размещения.** Модель `Creative` выросла из «имя + ссылка» в полноценную рекламную запись: в payload появились `text`, `button_text`, `brand`, `inn`. Админка на `?page=creatives` обновлена соответственно — модалка создания/редактирования теперь на восемь полей, все опциональные кроме `name`. На вкладке «Размещения» убраны кнопка «Создать размещение» в тулбаре и кнопка «Удалить» в каждой строке: размещения рождаются на странице, а не здесь. Чтобы закрыть размещение — открываешь страницу, очищаешь select «Креатив» или снимаешь «Публиковать».

**Блок «Креатив» на странице.** В библиотеку блоков добавлена новая готовая секция `core-creative` (категория «Секции»). Она рендерит рекламную вставку — текст, ссылку и три юридические маркировки по закону о рекламе: «Реклама», наименование рекламодателя, ИНН и ERID. При перетаскивании блок автоматически заполняется данными того креатива, который уже привязан к странице (через select в свойствах страницы) — без лишней модалки, которая переспрашивала бы то, что пользователь только что выбрал. Если креатив не привязан — блок приходит с заглушками, редактор заполняет их вручную.

**Исправлен баг — модалка формы.** `BaseModalForm` переиспользовала старый контейнер в DOM при создании нового экземпляра. Слушатели от прошлых экземпляров оставались навешанными и срабатывали вместе с новым — каждый вызывал `_collectData()` на своих detached-полях. На бэк уходили пустые значения ровно для тех полей, которые пользователь только что заполнил. Фикс простой: `_createDOM()` теперь всегда удаляет stale-контейнер перед созданием нового.

**Внутреннее.** В редактор добавлен `creative.js` — копия `brand.js` 1:1 для drop-обработчика. В `manifest.json` библиотеки блоков теперь указан `creative-block` как класс `ReadyBlocks` — чтобы бэк подтягивал `ready.css` даже на страницах, где нет ничего кроме этого блока.