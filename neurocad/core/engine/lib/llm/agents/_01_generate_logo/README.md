<!-- core/engine/lib/llm/agents/_01_generate_logo/README.md -->

# _01_generate_logo

**Агент:** Generate Logo
**Класс:** `CoreEngineLibLlmAgentsGenerateLogoAgent`
**Промпт:** `CoreEngineLibLlmAgentsGenerateLogoPrompt` (в `prompt.py`)
**Имя в реестре:** `generate_logo`
**Тип:** вспомогательный (не в роутере чата)

## Что делает

Рисует **один** SVG-логотип (иконку-символ) по заголовку
и (опционально) краткому описанию страницы.

## Когда вызывается

Только из **HTTP-эндпоинта**, не из чата:

```
POST /core/engine/lib/word/editor/images/generate
```

Кнопка «Генерировать» рядом с полем «Логотип» в форме карточки
статьи (`pages/logo.js`) — это единственный UI-вызов.

## Что НЕ делает

- Не участвует в роутере чата.
- Не знает про WS, HTTP, dispatch, историю.
- Не сохраняет SVG на диск — это делает вызывающий код
  через `CoreEngineLibWordImagesService`.

## Возвращает

```python
{"svg": "<svg ...>...</svg>"}             # успех
{"svg": None, "error": "<причина>"}       # неудача
```

## Импорты

**Стандартная библиотека:**
- `asyncio` — пауза между ретраями
- `json` — толерантное извлечение JSON из ответа
- `re` — проверки безопасности SVG
- `typing` — типы

**Внутри пакета:**
- `prompt.py` — класс `CoreEngineLibLlmAgentsGenerateLogoPrompt`

## Ретраи

Внутри агента — 3 попытки с экспоненциальным backoff (2с, 4с).
Ретраятся только временные ошибки: 403 / 429 / 5xx, таймауты,
и случаи, когда модель вернула прозу без SVG.

## Параметры `run()`

```python
async def run(
    *,
    provider,
    user_message: str,
    emit=None,
    alt: str = "",
) -> dict
```

- `provider` — LLM-провайдер (DeepSeek, OpenAI, mock — что угодно
  с методом `generate_completion`).
- `user_message` — что отправить модели (обычно
  `"Заголовок: ... Описание: ..."`).
- `emit` — **не используется** этим агентом. Оставлен в сигнатуре
  для будущего dispatcher-а.
- `alt` — необязательная подсказка для модели (повторяется
  в user-сообщении).

## Зависимости между файлами

```
_01_generate_logo/
├── agent.py     ← CoreEngineLibLlmAgentsGenerateLogoAgent
├── prompt.py    ← CoreEngineLibLlmAgentsGenerateLogoPrompt
└── README.md    ← этот файл
```

`agent.py` **импортирует** `prompt.py`. **Больше** **ничего** **не**
**импортирует** — **ни** `base`, **ни** `steps/common`, **ни** `prompts/`.