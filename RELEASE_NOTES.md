# neurocad 1.0.21

Release date: 2026-10-11

---

## English

**Contacts page.** Every user's site can now publish a contacts page
alongside `/policy` and `/rules`. The contacts text lives in a new
`users.contacts` column (TEXT, nullable) and is served at
`/contacts` on the user's own host — subdomain or custom domain —
by the same resolver as the two legal pages: Host → user → column.
When the field is empty, the page falls back to a universal
contacts template (`modal/legal/contacts.md`), so a footer link
never leads to a dead end.

**Legal card — third row.** The "Документы сайта" card in
Profile → Domains now has three rows instead of two: Policy,
Rules, Contacts. Each row keeps its own state badge
(«Универсальный текст» / «Заполнено»), its own preview link, and
its own "Редактировать" button that opens the same shared modal.

**Contacts is not a legal document.** It shares the storage
pipeline with policy / rules (free-form markdown in a Text column,
same modal, same save endpoint), but the "✨ Сгенерировать" preset
is disabled for it: the LLM cannot invent a phone number or an
address from the home page text. The frontend disables the button
and the backend returns 400 on `/domain/legal/generate` with
`which="contacts"` — guarded on both sides so a keyboard user or a
stale client cannot accidentally spend tokens on a request that
cannot be honoured.

**Footer block.** The ready-made `core-footer` section now ships
with three relative links — Политика, Правила, Контакты — so the
new page is discoverable from every page that uses the block. No
absolute URL is hardcoded; the links resolve against whatever host
the page is served on.

**Internal.** The `LegalModal` was generalised from two targets to
three via a single `LEGAL_WHICH` list and a `LEGAL_META` map of
per-document strings (title, URL, noun). Adding a fourth document
later is a one-line change in four places: `LEGAL_WHICH` in the
modal, `_LEGAL_WHICH` in `service/legal.py`, `_LEGAL_WHICH` in
`public.py`, and `LEGAL_WHICH_ALL` in `schema.py`. The route,
service, and public pipelines now agree on the set through these
constants instead of hardcoding ("policy", "rules") in six places.

## Русский

**Страница «Контакты».** Теперь на сайте каждого пользователя
может публиковаться страница контактов — рядом с `/policy` и
`/rules`. Текст хранится в новой колонке `users.contacts` (TEXT,
nullable) и отдаётся по адресу `/contacts` на хосте
пользователя — поддомене или кастомном домене — тем же
резолвером, что и две юридические страницы: Host → user →
колонка. Если поле не заполнено, отдаётся универсальный шаблон
(`modal/legal/contacts.md`), так что ссылка в подвале никогда не
ведёт в никуда.

**Карточка «Документы сайта» — третья строка.** В
Profile → Домены у карточки теперь три строки вместо двух:
Политика, Правила, Контакты. У каждой — свой бейдж состояния
(«Универсальный текст» / «Заполнено»), своя preview-ссылка и
своя кнопка «Редактировать», открывающая ту же общую модалку.

**Контакты — не юридический документ.** Они живут в том же
пайплайне, что policy / rules (свободный markdown в Text-колонке,
та же модалка, тот же эндпоинт сохранения), но пресет
«✨ Сгенерировать» для них выключен: LLM не может выдумать
телефон или адрес из текста главной страницы. Фронт гасит
кнопку, бэк возвращает 400 на `/domain/legal/generate` с
`which="contacts"` — защита с обеих сторон, чтобы клавиатурный
пользователь или устаревший клиент случайно не потратили токены
на запрос, который всё равно не будет выполнен.

**Блок подвала.** Готовая секция `core-footer` теперь содержит
три относительные ссылки — Политика, Правила, Контакты — чтобы
новая страница была доступна с любой страницы, где стоит этот
блок. Никаких абсолютных URL — ссылки резолвятся против того
хоста, на котором отдаётся страница.

**Внутреннее.** `LegalModal` обобщена с двух целей до трёх через
единый список `LEGAL_WHICH` и карту `LEGAL_META` со строками для
каждого документа (title, URL, noun). Добавить четвёртый документ
теперь — одна строка в четырёх местах: `LEGAL_WHICH` в модалке,
`_LEGAL_WHICH` в `service/legal.py`, `_LEGAL_WHICH` в
`public.py`, `LEGAL_WHICH_ALL` в `schema.py`. Роут, сервис и
публичный пайплайн теперь согласованы через эти константы, а не
через хардкод `("policy", "rules")` в шести местах.