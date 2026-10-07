# neurocad 1.0.17

Release date: 2026-10-07

---

## English

### Added

- **AI-generated Policy and Rules.** A new "✨ Сгенерировать" button in the legal modal (Profile → Domains → Документы сайта) calls `POST /domain/legal/generate`, which reads the user's home page (title, description, visible text) and runs the LLM to produce a fresh markdown document. Nothing is saved automatically — the generated text replaces the textarea contents, and the user reviews it and clicks "Сохранить" themselves.

- **Two new prompt modes** — `policy` and `rules` — in `word/llm/prompts/generate_legal.py`. Each has its own system prompt, structure (headings, sections, order) and style rules.

- **A new agent** `CoreEngineLibWordLlmAgentGenerateLegal` (`word/llm/agent/generate_legal.py`). It is NOT registered in the router and is NOT called by the WebSocket dispatcher — same pattern as `generate_logo`: called directly from the HTTP endpoint.

- **`LegalMixin.load_home_context()`** — a new method on the domain service that resolves the user's home page (explicit `users.home_page_id`, or first page by datetime ASC), strips its HTML and returns `owner_name` / `site_host` / `title` / `description` / visible text.

- **`site_host` in the prompt context** — the user's public host (`users.domain` if set, otherwise `<login>.<APP_DOMAIN>`) is passed to the LLM so it does not invent a brand name like "Нейрокад".

### Changed

- **Date is now explicit.** The legal prompt receives today's date (`DD.MM.YYYY`) from the server and is told to use it verbatim, with an explicit ban on `01.01.2026` and other default placeholders.

- **The prompts no longer allow inventing data categories.** The Policy prompt now only adds `email` / `name` / `phone` / `login` if they are clearly visible in the home page text (a form, a "Sign in" button, a mention of registration). If nothing is visible — only IP, cookies and browser data are listed.

- **Brand invention is forbidden.** Both prompts instruct the model to use only the `site_host` value from the context and to write "сайт" if it is empty. Hallucinated names like "Нейрокад" or "Сайт Ромашка" are explicitly banned.

- **`build_user_message()`** takes a new `site_host` keyword argument and adds a "Адрес сайта" line to the context block.

### Endpoints

- **`POST /core/engine/lib/base/profile/domain/legal/generate`** — new admin endpoint. Takes `{ "which": "policy" | "rules" }`, runs the agent, charges tokens (and one generation on Pro) to the Balance, and returns `{ "which": ..., "text": ... }`. Nothing is written to the DB — saving goes through `POST /domain/legal`.

  - Errors: `400` — no home page, `403` — tariff blocked or tokens exhausted, `500` — LLM error.

---

## Русский

### Добавлено

- **Генерация Политики и Правил через ИИ.** В модалке документов (Профиль → Домены → Документы сайта) появилась кнопка «✨ Сгенерировать». Она вызывает `POST /domain/legal/generate`, который читает главную страницу пользователя (заголовок, описание, видимый текст) и запускает LLM для создания свежего markdown-документа. Ничего не сохраняется автоматически — сгенерированный текст подставляется в textarea, пользователь проверяет и жмёт «Сохранить».

- **Два новых режима промпта** — `policy` и `rules` — в `word/llm/prompts/generate_legal.py`. У каждого свой системный промпт, структура (заголовки, разделы, порядок) и стилевые правила.

- **Новый агент** `CoreEngineLibWordLlmAgentGenerateLegal` (`word/llm/agent/generate_legal.py`). Он НЕ зарегистрирован в роутере и НЕ вызывается WebSocket-диспетчером — тот же паттерн, что у `generate_logo`: вызывается напрямую из HTTP-эндпоинта.

- **`LegalMixin.load_home_context()`** — новый метод в сервисе. Резолвит главную страницу пользователя (`users.home_page_id`, либо первую по datetime ASC), чистит HTML и возвращает `owner_name` / `site_host` / `title` / `description` и видимый текст.

- **`site_host` в контексте промпта** — публичный хост пользователя (`users.domain`, если задан, иначе `<login>.<APP_DOMAIN>`) передаётся в LLM, чтобы она не выдумывала бренд вроде «Нейрокад».

### Изменено

- **Дата теперь передаётся явно.** Промпт получает сегодняшнюю дату (`ДД.ММ.ГГГГ`) с сервера и должен использовать её дословно. Явно запрещено ставить `01.01.2026` и другие дефолтные заглушки.

- **Промпты больше не разрешают выдумывать категории данных.** Промпт Политики добавляет `email` / `имя` / `телефон` / `логин` только если они явно видны в тексте главной (форма, кнопка «Войти», упоминание регистрации). Если ничего не видно — только IP, cookie и данные браузера.

- **Выдумывание бренда запрещено.** Оба промпта требуют использовать только `site_host` из контекста и писать «сайт», если он пуст. Выдуманные названия вроде «Нейрокад» или «Сайт Ромашка» явно запрещены.

- **`build_user_message()`** получил новый keyword-аргумент `site_host` и добавляет в контекст строку «Адрес сайта».

### Эндпоинты

- **`POST /core/engine/lib/base/profile/domain/legal/generate`** — новый админский эндпоинт. Принимает `{ "which": "policy" | "rules" }`, запускает агента, списывает токены (и одну генерацию на Pro) с баланса и возвращает `{ "which": ..., "text": ... }`. В БД ничего не пишется — сохранение идёт через `POST /domain/legal`.

  - Ошибки: `400` — нет главной страницы, `403` — тариф блокирует или токены кончились, `500` — ошибка LLM.