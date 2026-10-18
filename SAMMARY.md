# SUMMARY.md — NeuroCad, что делали в последней сессии

> Дополнение к `PROJECT.md`. Описывает **что делали в последней сессии**, а не что есть в проекте. Для «что есть» — см. `PROJECT.md`.

---

## Агенты — статус на сегодня

Всего в проекте **15 агентов**. Реализованы все, но в роутер (`AGENTS` в `agent/router.py`) включены **три**:

| # | Агент | Файл | Вызов | Статус |
|---|---|---|---|---|
| 1 | **Администратор** (роутер) | `agent/router.py` | В чате (всегда первым) | ✅ Включён. Документация HTML готова (8 разделов) |
| 2 | **Вежливый отказ** (`none`) | `agent/none.py` | В чате (fallback) | ✅ Включён. HTML готов, **CSS не доделан** |
| 3 | **Создание страницы** (`create_page`) | `agent/create_page.py` | В чате | ✅ Включён. В работе |
| 4 | **Универсальный шаблон** (`template_uni`) | `agent/template_uni.py`? | В чате | Не включён |
| 5 | **Шаблон для статей** (`template_art`) | `agent/template_art.py`? | В чате | Не включён |
| 6 | **Статья** (`article`) | `agent/article.py`? | В чате | Не включён |
| 7 | **Помощник** (`help`) | `agent/help.py` | Отдельный чат | **Отключён.** Нужен свой режим (`mode: "help"`), без роутера |
| 8 | **Сборка из блоков** (`create`) | `agent/create.py` | В чате | Не включён |
| 9 | **Заполнение** (`fill`) | `agent/fill.py` | В чате | Не включён |
| 10 | **Эффект** (`effect`) | `agent/effect.py` | В чате | Не включён |
| 11 | **Создание эффекта** (`create_effect`) | `agent/create_effect.py` | Прямой WS (`create_effect`) | Не в роутере |
| 12 | **Правка эффекта** (`edit`) | `agent/edit.py` | Прямой WS (`effect_edit`) | Не в роутере |
| 13 | **Переименование эффекта** (`rename`) | `agent/rename.py` | Прямой WS (`effect_rename`) | Не в роутере |
| 14 | **Создание логотипа** (`generate_logo`) | `agent/generate_logo.py` | Кнопка в UI / HTTP | Не в роутере |
| 15 | **Генерация документов** (`generate_legal`) | `agent/generate_legal.py` | HTTP (`POST /domain/legal/generate`) | Не в роутере |

**Ключевая идея.** Агенты делятся на три категории:

1. **В чате** (через роутер) — пользователь пишет словами, роутер выбирает агента.
2. **Отдельный чат** — `help`. Свой режим, не через роутер.
3. **Вспомогательные** (без чата) — вызываются кнопкой или HTTP-роутом: `generate_logo`, `generate_legal`.

---

## Порядок работы

Идём **по одному**, с проверкой. Текущий план:

1. **`create_page`** — довести до конца. Включён, в работе.
2. **`generate_logo`** — простой, кнопка уже есть. Включить и документировать.
3. **Группа эффектов** — `effect`, `create_effect`, `edit`, `rename`. Четыре агента вокруг одной темы.
4. **`help`** — отдельный чат.
5. **Остальные** — по одному: `create`, `fill`, `article`, `template_uni`, `template_art`.

---

## `create_page` — что делаем в этой сессии

**Блок А — диалог-бриф.**
- Сейчас: роутер задаёт один вопрос — `create_page` генерирует.
- Надо: серия вопросов до генерации. Пользователь отвечает или говорит «вперёд» на любом шаге.
- Жанры: лендинг, лонгрид, промо, личная страница, FAQ, меню / прайс.
- Вопросы под жанр. Для лендинга: тематика → что продаёшь → кому → блоки → эффекты → тексты → пожелания.
- «Вперёд» — LLM распознаёт сама, без жёстких триггеров.
- Дефолты для пропущенных.
- Механизм: `Run.brief` (JSON), `base.py` расширить `{"question": "..."}`, `dispatch.py → _run_agent` обрабатывать `question` от любого агента.

**Блок Б — QA.**
- Сейчас: QA не поймал перекрытие блоков в тесте «для кофейни» (1 из 7 секций).
- Надо: усилить QA-промпт + структурная проверка CSS перед склейкой.
- Промпт: «проверь, что нет `position: absolute` без родителя с `position: relative`, нет `z-index` без контекста, нет отрицательных `margin`, нет `overflow: hidden`, обрезающего контент».
- Структурная: детерминированный анализ CSS всех секций на опасные паттерны.

**Что НЕ делаем в этой итерации:**
- Кнопку «Вперёд» в UI. Сначала — только текст.
- Многостраничники. Только одна страница.
- БД. Всё статичное.

---

## Что осталось от прошлых сессий по агентам

**Администратор** — документация HTML готова. 8 разделов. Переименован из «Роутер».

**Вежливый отказ** — HTML готов, CSS не доделан. Переименован из `none`.

**`create_page`** — включён в роутер. `_run_edit` — мёртвый код (edit-режим отключён). `REVIEW_ENABLED = True`.

**`help`** — отключён, но файл рабочий. В TODO: создать отдельный чат (`mode: "help"`), обновить FAQ (новые блоки, шаблоны, копирование / перемещение), задокументировать.

**Остальные** — код есть, в роутер не включены. Причина: старая версия роутера не справлялась с выбором между похожими агентами. Решение — включать по одному, с проверкой.

# SUMMARY.md — что делали в последней сессии

## Что сделано

Реализован модуль **botinv** (инвентаризация) — пер-юзерный инструмент для
обхода помещений с бухгалтером. Полный цикл: импорт Excel/CSV → поиск по
фрагменту в чате → отметка позиции → экспорт XLSX.

### Backend

- **Модели:** `BotInvSheet`, `BotInvItem`; поле `User.use_botinv`.
- **Миграции:** 4 штуки — создать таблицы, добавить `inv_num_norm`,
  синхронизировать nullable, добавить `use_botinv`.
- **`importer.py`:** парсит `.xlsx` / `.csv`, ищет заголовки по именам
  (`inv_num`, `name`, `room`), дедуплицирует по `inv_num.upper()`.
- **`exporter.py`:** XLSX с title-строкой, шапкой, 7 колонками,
  монопространственный для inv_num, транслит в имени файла.
- **`service.py`:** `list_sheets`, `get_active_sheet`, `create_sheet_from_file`,
  `activate_sheet`, `soft_delete_sheet`, `list_items`, `change_room`,
  `find_and_mark`, `resolve_nav_id_for_botinv`. Философия `note` — только
  при повторах.
- **`route.py`:** `/active`, `/sheets`, `/sheets/import`, `/sheets/{id}/activate`,
  `/sheets/{id}` PATCH/DELETE, `/sheets/{id}/items`, `/sheets/{id}/export`,
  `/room`, `/mark`.

### Frontend

- **`botinv.js`** — оркестратор `BaseBotInv`, три области + `BotInvResizer`.
- **`list/list.js`** — список ведомостей (sidebar + drawer).
- **`table/table.js`** — обёртка над `base/table/table.js`, highlight.
- **`chat/handler.js`** — обёртка над `BaseChat`, поиск по фрагменту,
  кандидаты 1/2/3, `#NNN` — смена кабинета.
- **`resizer.js`** — ручки между панелями, localStorage.
- **`api.js`** — HTTP-клиент.
- Патчи в `base/chat/chat.js` (`headerExtra`, `setPlaceholder`),
  `base/chat/chat.css` (варианты сообщений),
  `base/pages.js` (`showServices('botinv')`),
  `base/services/services.js` (пункт «Инвентаризация»),
  `core/auth/service.py` (`serialize_user` → bool).

### Релиз

- `1.0.25` — модуль `botinv`.
- `1.0.26` — фикс доставки `use_botinv` на фронт (`profile/route.py`,
  `login/route.py`, `auth/service.py`).

## Что осталось на завтра (релиз 1.0.27)

1. **Скроллбар таблицы** — сделать видимым (`base/table/table.css`).
   `thumb: #94a3b8` вместо `var(--border-hover)` + `track: #eef2f8` +
   `scrollbar-color` для Firefox.

2. **Иконки в списке ведомостей** — заменить `⤓ ✎ ✕` на `<img src="...">`
   из `base/images/export.svg`, `edit.svg`, `delete.svg` (в `list.js`).

3. **Фильтры в таблице** — над каждой колонкой:
   - Инв. № — текст (подстрока, case-insensitive);
   - Наименование — текст;
   - Каб. до — select из уникальных `room_before`;
   - Каб. после — select из уникальных `room_after`;
   - Найден/не найден — select (все / найден / не найден);
   - Примечание — текст.
   
   Плюс счётчик «Показано N из M» и кнопка «Сбросить» над таблицей.
   
   Фильтры **на фронте** (`applyFilters` в `table.js`). Логика AND.
   
   При `updateAndHighlight(item)` — **сначала `resetFilters()`**,
   потом `updateRow`, потом `highlight` — чтобы строка не оказалась
   скрытой фильтром.

4. **Сборка 1.0.27** — обновить `pyproject.toml`, `CHANGELOG.md`,
   `RELEASE_1.0.27.md`, собрать, поставить на оба инстанса.

## Что нужно от пользователя в начале следующего чата

- Содержимое `base/images/export.svg`, `edit.svg`, `delete.svg`
  (и `reset.svg`, `add.svg`, `burger.svg`, если хотим сразу).
- Актуальный `botinv/table/table.js` — полный код.
- Актуальный `botinv/table/table.css` — полный код.
- Актуальный `botinv/list/list.js` — полный код.
- Актуальный `base/table/table.css` — блок `::-webkit-scrollbar*`.

## Ключевые правила проекта

- CSS без `!important`, кроме редких случаев.
- JS без статических импортов — всё через `await import()` с `?v=`.
- Комментарии на английском, строки для пользователя на русском.
- `__init__.py` — не трогать.
- Не трогать `test/static/` — это сгенерированная папка, синк при старте.

## Два инстанса

- `neurocad.ru` — main, superadmin `admin`.
- `inv.uc-rosseti-ural.ru` — боевой для бухгалтера, юзер `inv` (id=10).
  Ведомость на 531 позицию загружена.

## Открытые вопросы

- Ведомость 531 позиция — фильтры на фронте. Если будет > 5000 — переедем
  на бэкенд.
- Nav «Инвентаризация» создаётся лениво. `module_id = None`, иначе
  `ensure_default_nav` падает.
- `change_room` принимает **любой текст** — валидировать не по чему.

# lib/llm — итог сессии

## Цель

Вынести LLM-агентов из `word/llm/` в самостоятельный компонент
`lib/llm/`. Агент не должен знать, кто его вызывает (HTTP, WS,
CLI, тест). Пока делаем **только одного агента** —
`generate_logo` — по одному шагу, без слома работающего кода.

## Согласованные принципы

1. **По одному агенту.** Сначала `_01_generate_logo`. Остальные
   (`_02_admin`, `_03_none`, `_04_create_page` и т.д.) — потом,
   отдельными сессиями.
2. **Никаких общих `prompts/` и `steps/`.** Всё, что относится к
   агенту, живёт в его папке. Если что-то нужно двум агентам —
   один импортирует у другого (или дублируется). Общих
   модулей нет.
3. **Никаких `__init__.py`.** Проект использует namespace-пакеты
   (PEP 420). Все папки — без `__init__.py`.
4. **Никаких глобальных функций и констант.** Всё — на классе.
   Иначе коллизии имён при тысячах файлов в проекте.
5. **Имена классов по конвенции проекта:**
   `CoreEngine<путь><Entity>`. Пример:
   - `core/engine/lib/llm/agents/_01_generate_logo/service.py`
     → `CoreEngineLibLlmAgentsGenerateLogoService`
   - `core/engine/lib/llm/agents/_01_generate_logo/prompt.py`
     → `CoreEngineLibLlmAgentsGenerateLogoPrompt`
6. **Порядок папок = порядок агентов.** Префикс `_01_`, `_02_` и
   т.д. Реестр (`registry.py`, когда дойдём) собирает агентов
   обходом `_??_*` по алфавиту.
7. **Транспорт (WS/HTTP) — не в `llm/`.** `chat/backend/` или
   `word/` — отдельно. Агент не знает про WS, HTTP, dispatch.
8. **Не трогаем работающий `route.py`** старого
   `/word/editor/images/generate`. Новый эндпоинт — отдельный,
   в `lib/llm/`. Когда обкатается — старый удалим.

## Структура (пока только один агент)

```
core/engine/lib/llm/
├── route.py                                  ← prefix="/llm", включает agents/route.py
├── agents/
│   ├── route.py                              ← prefix="/agents", включает всех агентов
│   └── _01_generate_logo/
│       ├── prompt.py                         ← CoreEngineLibLlmAgentsGenerateLogoPrompt
│       ├── service.py                        ← CoreEngineLibLlmAgentsGenerateLogoService
│       ├── schema.py                         ← Pydantic: Request / Data / Response
│       ├── route.py                          ← POST /generate
│       └── README.md
```

**Итоговый URL нового эндпоинта:**

```
POST /core/engine/lib/llm/agents/_01_generate_logo/generate
```

Собирается так:
- `core/engine/lib/route.py` → `prefix="/lib"` → `include_router(llm_router)`
- `llm/route.py` → `prefix="/llm"` → `include_router(agents_router)`
- `llm/agents/route.py` → `prefix="/agents"` → `include_router(generate_logo_router)`
- `llm/agents/_01_generate_logo/route.py` → `prefix="/_01_generate_logo"` → `@router.post("/generate")`

## Распределение ответственности

| Слой | Что | Где |
|---|---|---|
| Промпт | Системный промпт агента | `prompt.py` → `...Prompt.build()` |
| LLM-логика | Вызов модели, ретраи, парсинг, валидация SVG | `service.py` → `...Service.generate(...)` |
| Контракт | Pydantic Request / Data / Response | `schema.py` |
| HTTP | Баланс, провайдер, вызов сервиса, сохранение SVG, списание токенов, публичный URL | `route.py` |

**Ключевое:**
- **`service.py`** — только LLM. Никакой БД, HTTP, баланса.
- **`route.py`** — обвязка: всё, что вокруг LLM.

## Что уже сделано (код готов)

1. **`prompt.py`** — класс `CoreEngineLibLlmAgentsGenerateLogoPrompt`
   с методом `build()`, возвращает системный промпт.
2. **`service.py`** — класс `CoreEngineLibLlmAgentsGenerateLogoService`
   с методом `generate(*, provider, user_message, alt)`.
   Внутри:
   - `MAX_ATTEMPTS = 3`, `BASE_DELAY = 2.0`, `MAX_TOKENS = 2048`,
     `RETRY_MARKERS` — атрибуты класса;
   - `_log`, `_build_messages`, `_extract_json`, `_extract_svg`,
     `_validate_svg` — приватные методы класса;
   - возврат: `{"svg": "..."} ` или `{"svg": None, "error": "..."}`.
3. **`schema.py`** — три Pydantic-класса:
   - `CoreEngineLibLlmAgentsGenerateLogoRequest`
     (`prompt`, `alt`, `source`);
   - `CoreEngineLibLlmAgentsGenerateLogoData`
     (`id`, `file`, `url`, `bytes`);
   - `CoreEngineLibLlmAgentsGenerateLogoResponse`
     (`success`, `data`, `error`).
4. **`route.py`** — эндпоинт `POST /generate`:
   - `prefix="/_01_generate_logo"`;
   - шаги: `BalanceChecked.logo_allowed` → `get_provider` →
     `Service().generate(...)` → `CoreEngineLibWordImagesService.create_image(...)`
     → `_charge_logo(...)` → ответ `{id, file, url, bytes}`;
   - `_charge_logo` — приватная функция модуля (одна, не класс —
     можно перенести в `route.py` как метод или оставить).
5. **`route.py` агрегаторы:**
   - `llm/route.py` — `prefix="/llm"`, включает `agents_router`;
   - `llm/agents/route.py` — `prefix="/agents"`, включает
     `generate_logo_router`.
6. **`core/engine/lib/route.py`** — добавлены две строки:
   ```python
   from .llm.route import router as llm_router
   router.include_router(llm_router)
   ```

## Что удалено

- **`agent.py`** — удалён. Его содержимое целиком переехало в
  `service.py` (с переименованием класса `Agent → Service` и
  метода `run → generate`).
- **`__pycache__/`** — снесён, чтобы не подхватывался старый
  `.pyc` от удалённого `agent.py`.

## Текущее состояние

- ✅ `Service` импортируется.
- ✅ `schema.py` перезаписан — импортируется.
- ✅ `route.py` — импортируется.
- ✅ `llm/route.py` — импортируется.
- ✅ `llm/agents/route.py` — импортируется.
- ✅ `core/engine/lib/route.py` — обновлён.
- ❓ **Финальная проверка реестра маршрутов** и **тест эндпоинта
  через curl / TestClient / Swagger** — ещё не сделано.

## Следующие шаги

1. Проверить, что маршрут виден:
   ```bash
   .venvtest/bin/python -c "
   from neurocad.core.engine.lib.llm.route import router
   for r in router.routes:
       print(r.path, getattr(r, 'methods', ''))
   "
   ```
   Ожидается:
   ```
   /llm/agents/_01_generate_logo/generate {'POST'}
   ```

2. Проверить эндпоинт через TestClient или curl:
   ```python
   from fastapi.testclient import TestClient
   from neurocad import NeuroCad
   client = TestClient(NeuroCad())
   resp = client.post(
       "/core/engine/lib/llm/agents/_01_generate_logo/generate",
       json={"prompt": "Нейрокад — CMS нового поколения", "alt": "Нейрокад"},
   )
   print(resp.status_code, resp.json())
   ```
   Нужен authenticated user (cookie / Bearer). Если 401 — сначала
   логин через `/core/auth/login`.

3. Сравнить ответ с **легаси-эндпоинтом**
   `POST /word/editor/images/generate` — должен совпадать по
   структуре: `{id, file, url, bytes}`.

4. Когда новый эндпоинт заработает:
   - переключить UI (`pages/logo.js`) на новый URL — **одной
     строкой**;
   - убедиться, что кнопка «Генерировать» в форме карточки
     по-прежнему работает;
   - удалить легаси `route.py` из `word/editor/images/`, если он
     больше нигде не нужен.

## Что **не** делаем в этой итерации

- **Роутер (`router.py`)** — не трогаем. `generate_logo` — не
  агент чата, он вызывается по кнопке. Роутер не должен знать
  про него.
- **WS, dispatch, provider** — не трогаем. `get_provider` пока
  остаётся в `utils/llm/factory.py`. Перенос провайдеров в
  `llm/providers/` — отдельная сессия.
- **`chat/`** — не трогаем. Чат живёт в `word/chat/`, WS — в
  `word/llm/websocket/`. Переезд чата — отдельная сессия.
- **Остальные 14 агентов** — не трогаем. По одному, потом.
- **`registry.py`** — не нужен, пока один агент.
- **`service.py`** — не переделываем в `agent.py` обратно. Сервис
  — это и есть агент (LLM-логика).

## Ключевые файлы (для справки)

- `core/engine/lib/llm/agents/_01_generate_logo/prompt.py`
- `core/engine/lib/llm/agents/_01_generate_logo/service.py`
- `core/engine/lib/llm/agents/_01_generate_logo/schema.py`
- `core/engine/lib/llm/agents/_01_generate_logo/route.py`
- `core/engine/lib/llm/agents/_01_generate_logo/README.md`
- `core/engine/lib/llm/agents/route.py`
- `core/engine/lib/llm/route.py`
- `core/engine/lib/route.py`

## Известные проблемы и решения по ходу

| Проблема | Причина | Решение |
|---|---|---|
| `ModuleNotFoundError: ...llm.agents.base` | не было `base.py` | удалили `base.py` вообще — агент без родителя |
| `ImportError: cannot import name 'router'` | внутри `route.py` падал импорт `Service` | переименовали класс в `service.py`, починили импорт |
| `ImportError: cannot import name '...Service'` | `service.py` содержал класс `...Agent` | `sed 's/Agent/Service/g'` + ручная проверка |
| `schema.py` пустой | при копировании потерялось содержимое | перезаписали полным файлом |

*Конец документа. Обновляется в конце каждой сессии.*