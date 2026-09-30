# neurocad 0.1.29

Release date: 2026-09-30

---

## English

### Added

- **`create_page` agent — full-page generation from a single prompt.** A new agent that builds a complete, self-contained landing page (HTML + CSS) in one pass, bypassing the block catalog and the effects editor entirely.
  - **Free-form layout.** The model is not limited to the registered blocks (`core-heading-h1`, `core-card`, …). It returns arbitrary HTML — sections, grids, cards, hero blocks, whatever the prompt asks for — instead of stitching together catalog entries.
  - **Single-shot HTML + CSS.** The agent returns a JSON payload `{ "html": "...", "css": "..." }`. The HTML goes straight into `editor.setComponents()`; the CSS goes through `editor.setStyle()`. The page is rendered on the canvas immediately, with no per-block editing step, no effect drafts, no save button.
  - **Router integration.** Requests that describe a whole page («напиши главную страницу…», «собери лендинг для…», «сделай сайт про…») are routed to `create_page`. Requests that target a specific element or an existing block still go to the existing edit / effects flow. The two paths do not interfere.
  - **No dependence on the effects subsystem.** `create_page` does not touch `EffectBlocks`, does not create drafts, does not write anything to `_effectsApiBase`. Everything the agent produces lives in the page's own HTML and CSS columns.
- **WebSocket frame `page_css_update`.** A new frame type emitted by the dispatcher right after `html_update` when `create_page` returns a `{ html, css }` payload. The front end handles it in `chat/handler.js` and applies the CSS via a new `_applyPageCss(css)` method on the chat controller, which calls `editor.setStyle(css)`.
  - The CSS is passed as a plain string **without** the surrounding `<style>` tag. This is required: GrapesJS cannot parse `<style>` mixed into a component tree and would silently drop the whole tree if we tried to inline it into the HTML.
- **New prompt and parser for the agent.**
  - `prompts/create_page.py` — JSON-mode prompt that asks the model for `{ "html": "...", "css": "..." }` and nothing else.
  - `agent/create_page.py` — a strict JSON parser with a fallback: if the model returns raw HTML (no JSON wrapper), the parser still extracts `<style>` blocks into CSS and the rest into HTML.

### Changed

- **DeepSeek provider: reasoning-model support.** `deepseek-flash` (V4.1-Flash) may run in “thinking” mode and spend part of `max_tokens` on an internal `reasoning_content` field before producing the final `content`. Two changes in `utils/llm/deepseek.py`:
  - **`_extract_message_content()`** — if `content` comes back empty, the provider falls back to `reasoning_content`. Previously, an empty `content` yielded `""` and the agent treated the response as malformed, even though the model had produced 30–40K characters of usable text.
  - **`thinking: { type: disabled }`** in the request payload. Asks the model to skip the thinking phase. Models that do not know the parameter ignore it, so the change is backward-compatible.
  - Both the streaming and non-streaming paths respect the fallback.
- **DeepSeek provider: post-mortem dumps.** When the response looks suspicious (empty `content`, `finish_reason: "length"`), the full raw JSON is written to `/tmp/neurocad_llm_dumps/deepseek_<ts>_<reason>.json`, and the head / tail of `reasoning_content` (500 chars each) is logged. This made the “model returned a non-html answer: ''” bug diagnosable in one run instead of many.

### Fixed

- **`create_page` on reasoning models: empty response despite a successful call.** Root cause — `deepseek-flash` runs in thinking mode; the model produced 34K characters of `reasoning_content` and hit `finish_reason: "length"` before ever writing to `content`. The provider read only `content` and returned `""`. The agent then reported “Модель вернула некорректный ответ”. Fixed by the two provider changes above; the default `max_output_tokens` for DeepSeek is also raised so that the thinking phase plus a full page fit into one response.

---

## Русский

### Добавлено

- **Агент `create_page` — генерация полной страницы из одного промпта.** Новый агент собирает готовую самодостаточную страницу (HTML + CSS) за один проход, минуя каталог блоков и редактор эффектов.
  - **Свободная вёрстка.** Модель не ограничена зарегистрированными блоками (`core-heading-h1`, `core-card`, …). Она возвращает произвольный HTML — секции, сетки, карточки, hero-блоки, что угодно по запросу — вместо склейки из элементов каталога.
  - **HTML + CSS одним ответом.** Агент возвращает JSON `{ "html": "...", "css": "..." }`. HTML идёт напрямую в `editor.setComponents()`; CSS — через `editor.setStyle()`. Страница отрисовывается на холсте сразу, без пошагового редактирования, без черновиков эффектов, без кнопки «Сохранить».
  - **Интеграция с роутером.** Запросы, описывающие целую страницу («напиши главную страницу…», «собери лендинг для…», «сделай сайт про…»), уходят в `create_page`. Запросы, адресованные конкретному элементу или существующему блоку, по-прежнему идут в старый поток редактирования и эффектов. Оба пути не мешают друг другу.
  - **Не зависит от подсистемы эффектов.** `create_page` не трогает `EffectBlocks`, не создаёт черновики, ничего не пишет в `_effectsApiBase`. Всё, что производит агент, живёт в собственных колонках HTML и CSS страницы.
- **WebSocket-кадр `page_css_update`.** Новый тип кадра, который диспетчер отправляет сразу после `html_update`, когда `create_page` возвращает пару `{ html, css }`. Фронт обрабатывает его в `chat/handler.js` и применяет CSS через новый метод `_applyPageCss(css)` на контроллере чата, который вызывает `editor.setStyle(css)`.
  - CSS передаётся обычной строкой **без** обрамляющего тега `<style>`. Это обязательно: GrapesJS не умеет парсить `<style>`, подмешанный в дерево компонентов, и молча выбросил бы всё дерево, если бы мы попытались встроить его в HTML.
- **Новый промпт и парсер для агента.**
  - `prompts/create_page.py` — JSON-промпт, который просит у модели только `{ "html": "...", "css": "..." }` и ничего больше.
  - `agent/create_page.py` — строгий JSON-парсер с фолбэком: если модель вернула сырой HTML (без JSON-обёртки), парсер всё равно вытаскивает `<style>`-блоки в CSS, а остальное — в HTML.

### Изменено

- **Провайдер DeepSeek: поддержка reasoning-моделей.** `deepseek-flash` (V4.1-Flash) может работать в режиме «размышления» и тратить часть `max_tokens` на внутреннее поле `reasoning_content`, прежде чем выдать финальный `content`. Два изменения в `utils/llm/deepseek.py`:
  - **`_extract_message_content()`** — если `content` пришёл пустым, провайдер берёт текст из `reasoning_content`. Раньше пустой `content` давал `""`, и агент считал ответ битым, хотя модель сгенерировала 30–40K символов осмысленного текста.
  - **`thinking: { type: disabled }`** в теле запроса. Просит модель пропустить фазу размышления. Модели, которые не знают этого параметра, его игнорируют — изменение обратно совместимо.
  - Оба пути — streaming и non-streaming — учитывают фолбэк.
- **Провайдер DeepSeek: дампы для разбора инцидентов.** Когда ответ выглядит подозрительно (пустой `content`, `finish_reason: "length"`), полный сырой JSON пишется в `/tmp/neurocad_llm_dumps/deepseek_<ts>_<reason>.json`, а в лог уходят начало и конец `reasoning_content` (по 500 символов). Именно это позволило диагностировать баг «model returned a non-html answer: ''» за один прогон, а не за много.

### Исправлено

- **`create_page` на reasoning-моделях: пустой ответ при успешном вызове.** Причина — `deepseek-flash` работает в thinking-режиме; модель сгенерировала 34K символов `reasoning_content` и упёрлась в `finish_reason: "length"`, так и не дойдя до записи в `content`. Провайдер читал только `content` и возвращал `""`. Агент сообщал «Модель вернула некорректный ответ». Исправлено двумя изменениями провайдера выше; заодно поднят дефолтный `max_output_tokens` для DeepSeek — чтобы фаза размышления и полная страница помещались в один ответ.