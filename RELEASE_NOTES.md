# RELEASE-NOTES.md

## neurocad 1.0.33

Release date: 2026-10-17

---

### English

- **New `lib/llm` layer with a standalone `generate_logo` agent.** The logo agent was moved out of `word/llm/` into `core/engine/lib/llm/agents/_01_generate_logo/` and is now self-contained: a `Prompt` class (system prompt), a `Service` class (LLM call, retries, SVG extraction and validation — no module-level constants or functions), a `Schema` module (Pydantic request / data / response) and a `Route` module (HTTP endpoint with balance guard, provider resolution, image saving, token charging and public URL). The endpoint `POST /core/engine/lib/llm/agents/_01_generate_logo/generate` is a drop-in replacement for the legacy `POST /core/engine/lib/word/editor/images/generate`: same request body (`prompt`, `alt`, `source`), same response shape (`{id, file, url, bytes}`), same storage (`/static/core/engine/lib/word/editor/images/files/<id>.svg`). The logo button in the page form (`pages/logo.js`) now calls the new endpoint. The legacy endpoint and the old `word/llm/agent/generate_logo.py` are still in place — to be removed once the new one has been verified in production.

### Русский

- **Новый слой `lib/llm` и самостоятельный агент `generate_logo`.** Агент логотипа вынесен из `word/llm/` в `core/engine/lib/llm/agents/_01_generate_logo/` и теперь самодостаточен: класс `Prompt` (системный промпт), класс `Service` (вызов LLM, ретраи, извлечение и валидация SVG — без глобальных констант и функций), модуль `Schema` (Pydantic request / data / response) и модуль `Route` (HTTP-эндпоинт с проверкой баланса, получением провайдера, сохранением изображения, списанием токенов и публичным URL). Эндпоинт `POST /core/engine/lib/llm/agents/_01_generate_logo/generate` полностью заменяет легаси `POST /core/engine/lib/word/editor/images/generate`: то же тело запроса (`prompt`, `alt`, `source`), тот же формат ответа (`{id, file, url, bytes}`), то же хранение (`/static/core/engine/lib/word/editor/images/files/<id>.svg`). Кнопка «Генерировать» в форме карточки статьи (`pages/logo.js`) теперь вызывает новый эндпоинт. Легаси-эндпоинт и старый `word/llm/agent/generate_logo.py` пока остаются — удалим, когда новый эндпоинт будет проверен в проде.