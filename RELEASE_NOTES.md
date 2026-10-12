# neurocad 1.0.22

Release date: 2026-10-12

---

## English

**Placement tracking works end to end.** `PlacementStat` had a reader but no writer — the "Отчёт" tab showed zeroes for every placement because nothing ever called `POST /creatives/hit`. The public tracking script (`creatives/public/block.js`) now sends a hit when a `core-creative` block is rendered (`show`) and when its link is clicked (`click`), using `navigator.sendBeacon` so the request survives the navigation. The admin report shows the real counts.

**Report table — readable page link and aligned numbers.** The "Страница" column now shows the destination page's title as a clickable link to its public URL (`https://<owner-host>/page/…`), falling back to `#<page_id>` when the page has been deleted or the owner's host cannot be resolved. Numeric columns (Показы, Клики, Целевые действия) are center-aligned in both the header and the body — previously the header sat left and the numbers right, so the columns did not visually line up.

**Footer links in the admin preview go to the owner's host.** In Word view the `core-footer` links are relative (`/policy`, `/rules`, `/contacts`), so a click opened them on `neurocad.ru` instead of the page owner's site. The renderer now rebases them onto `pageData.public_host` — the subdomain or custom domain resolved on the backend — so the admin preview matches what the public page does.

**No more flash of unstyled pages.** `?page=setup`, `?page=profile` and `?page=creatives` used to show a "bare" version of the page for a few hundred milliseconds while their stylesheets were still being fetched. `window.coreEngine.loadCSS()` now returns a Promise that resolves when the `<link>` fires `load`, and the affected components await it in `_init()` before rendering. The shell reveals the body only after the awaited page builder has returned, so the user sees a fully styled page from the first frame.

**Internal.** `pages/public/route.py` split into six modules — `route.py` (URLs and handlers), `render.py` (page / catalog / placeholder / `resolve_content`), `cookies.py` (folder-path cookie), `html.py` (`strip_body_wrapper`, `apply_template`), `hosts.py` (host ownership and nav resolution), `paths.py` (folder-chain walk). No behaviour change; the same three URLs serve the same three handlers.

## Русский

**Трекинг размещений работает от начала до конца.** У `PlacementStat` был читатель, но не было писателя — вкладка «Отчёт» показывала нули для каждого размещения, потому что `POST /creatives/hit` никто не вызывал. Публичный трекинг-скрипт (`creatives/public/block.js`) теперь отправляет хит при отрисовке блока `core-creative` (`show`) и при клике по его ссылке (`click`) через `navigator.sendBeacon`, чтобы запрос дошёл даже при навигации. Отчёт в админке показывает реальные числа.

**Отчёт — кликабельная ссылка на страницу и выровненные числа.** Столбец «Страница» теперь показывает название страницы-назначения кликабельной ссылкой на её публичный URL (`https://<хост-владельца>/page/…`), с фолбэком на `#<page_id>`, если страница удалена или публичный хост владельца не резолвится. Числовые столбцы (Показы, Клики, Целевые действия) центрированы и в шапке, и в теле — раньше шапка стояла слева, а числа справа, столбцы визуально не совпадали.

**Ссылки подвала в админском просмотре ведут на хост владельца.** В Word-просмотре ссылки блока `core-footer` относительные (`/policy`, `/rules`, `/contacts`), поэтому клик открывал их на `neurocad.ru`, а не на сайте владельца страницы. Рендерер теперь переписывает их на `pageData.public_host` — поддомен или кастомный домен, резолвленный на бэке, — так что админский просмотр совпадает с публичной страницей.

**Больше нет мелькания неотрисованных страниц.** `?page=setup`, `?page=profile` и `?page=creatives` показывали «голую» версию страницы на несколько сот миллисекунд, пока их стили ещё грузились. `window.coreEngine.loadCSS()` теперь возвращает Promise, который резолвится по `link.onload`, и затронутые компоненты ждут его в `_init()` до рендера. Shell показывает body только после того, как отрендерился запрошенный компонент, поэтому пользователь видит полностью стилизованную страницу с первого кадра.

**Внутреннее.** `pages/public/route.py` разбит на шесть модулей — `route.py` (URL'ы и обработчики), `render.py` (страница / каталог / заглушка / `resolve_content`), `cookies.py` (cookie текущей папки), `html.py` (`strip_body_wrapper`, `apply_template`), `hosts.py` (проверка владельца хоста и резолюция nav), `paths.py` (построение цепочки папок). Логика не менялась: те же три URL обслуживаются теми же тремя обработчиками.