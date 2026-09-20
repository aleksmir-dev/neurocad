# NeuroCad

**English** | [Русский](#русский)

[![PyPI version](https://img.shields.io/pypi/v/neurocad.svg?cacheSeconds=3600)](https://pypi.org/project/neurocad/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python versions](https://img.shields.io/pypi/pyversions/neurocad.svg)](https://pypi.org/project/neurocad/)

---

**NeuroCad** is a lightweight platform for building websites and web apps
on FastAPI. It includes a visual editor, an LLM editor, a modular system,
and ready-to-use authentication.

## Features

- 🎨 **Visual editor** — GrapesJS, drag-and-drop blocks, StyleManager
- ⚡ **LLM editor** — edit pages via DeepSeek, chat with history
- 📦 **Modular system** — modules defined in `app/*.json`
- 🔐 **Auth** — superadmin, roles, password reset
- 🖼️ **Media library** — image upload and storage
- 🗄️ **SQLite out of the box** — no setup required

## Quick start

```bash
pip install neurocad

mkdir my_project && cd my_project
neurocad run
```

Open <http://127.0.0.1:8000> — login `admin`, password `admin`.

## Installation

Requirements: Python 3.10+, pip.

```bash
pip install neurocad
```

## Usage

### CLI

```bash
neurocad run        # start the server (uvicorn)
```

`neurocad init` creates the following structure:

```text
my_project/
├── app/            # modules (JSON page configs)
├── base/           # SQLite database
├── core/           # Core
├── log/            # logs
├── media/          # uploaded files
├── static/         # static files
├── mig/            # migrations
├── .env
└── main.py
```

### As a library

```python
from neurocad import NeuroCad

app = NeuroCad()
```

## Configuration

Create a `.env` file in your project root:

```env
SQLITE_URL=sqlite+aiosqlite:///base/neurocad.db
SQLITE_URL_SYNC=sqlite:///base/neurocad.db

SECRET_KEY=change-me-in-production
SUPERADMIN_LOGIN=admin
SUPERADMIN_PASSWORD=admin

APP_HOST=127.0.0.1
APP_PORT=8000

# LLM (DeepSeek)
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-flash
```

## LLM editor

The ⚡ button in the page toolbar opens the LLM editor:

- left — page preview;
- center — current page preview;
- right — chat with DeepSeek.

Describe what you want to change — the model returns HTML, which is applied
to the preview and saved on the server. Chat history is stored per page.

Requires a DeepSeek API key in `.env` (`DEEPSEEK_API_KEY`).

## Visual editor

The ✏ button opens GrapesJS:

- block library on the left;
- canvas in the center;
- StyleManager on the right.

Changes are saved via `/core/engine/lib/word/{id}`.

## Project structure

```text
neurocad/
├── core/                  # core
│   ├── auth/              # authentication
│   ├── engine/            # engine, modules, editors
│   │   ├── lib/           # base components
│   │   │   ├── base/      # page skeleton
│   │   │   ├── word/      # page content + editors
│   │   │   │   ├── editor/    # GrapesJS
│   │   │   │   └── llm/       # LLM editor
│   │   │   ├── pages/     # article list
│   │   │   └── nav/       # navigation
│   │   └── mod/           # built-in modules (JSON)
│   └── models/            # SQLAlchemy models
├── utils/                 # utilities
│   ├── llm/               # LLM clients (DeepSeek)
│   ├── sqlite.py          # DB connection
│   └── static.py          # static files serving
├── alembic/               # migrations
├── cli.py                 # CLI
└── app.py                 # FastAPI factory
```

## License

MIT. See [LICENSE](LICENSE).

## Links

- PyPI: <https://pypi.org/project/neurocad/>
- GitHub: <https://github.com/aleksmir-dev/neurocad>

<a name="русский"></a>

# Русский

**NeuroCad** — лёгкая платформа для создания сайтов и веб-приложений на FastAPI.
Включает визуальный редактор, LLM-редактор, модульную систему и готовую авторизацию.

## Возможности

- 🎨 **Визуальный редактор** — GrapesJS, drag-and-drop блоков, StyleManager
- ⚡ **LLM-редактор** — правки страниц через DeepSeek, чат с историей
- 📦 **Модульная система** — модули описываются в `app/*.json`
- 🔐 **Авторизация** — суперадмин, роли, восстановление пароля
- 🖼️ **Медиатека** — загрузка и хранение изображений
- 🗄️ **SQLite из коробки** — не требует настройки

## Быстрый старт

```bash
pip install neurocad

mkdir my_project && cd my_project
neurocad run
```

Откройте <http://127.0.0.1:8000> — логин `admin`, пароль `admin`.

## Установка

Требования: Python 3.10+, pip.

```bash
pip install neurocad
```

## Использование

### CLI

```bash
neurocad run        # запустить сервер (uvicorn)
```

`neurocad init` создаёт структуру:

```text
my_project/
├── app/            # модули (JSON-конфиги страниц)
├── base/           # SQLite БД
├── core/           # для переопределения core
├── log/            # логи
├── media/          # загруженные файлы
├── static/         # статика
├── mig/            # миграции
├── .env
└── main.py
```

### Как библиотека

```python
from neurocad import NeuroCad

app = NeuroCad()
```

## Конфигурация

Создайте `.env` в корне проекта:

```env
SQLITE_URL=sqlite+aiosqlite:///base/neurocad.db
SQLITE_URL_SYNC=sqlite:///base/neurocad.db

SECRET_KEY=change-me-in-production
SUPERADMIN_LOGIN=admin
SUPERADMIN_PASSWORD=admin

APP_HOST=127.0.0.1
APP_PORT=8000

# LLM (DeepSeek)
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-flash
```

## LLM-редактор

Кнопка ⚡ в тулбаре страницы открывает LLM-редактор:

- слева — превью страницы;
- в центре — превью текущей страницы;
- справа — чат с DeepSeek.

Опишите, что нужно изменить — модель вернёт HTML, он применится к превью
и сохранится на сервере. История чата сохраняется по каждой странице.

Для работы нужен ключ DeepSeek в `.env` (`DEEPSEEK_API_KEY`).

## Визуальный редактор

Кнопка ✏ открывает GrapesJS:

- библиотека блоков слева;
- canvas в центре;
- StyleManager справа.

Изменения сохраняются через `/core/engine/lib/word/{id}`.

## Структура проекта

```text
neurocad/
├── core/                  # ядро
│   ├── auth/              # авторизация
│   ├── engine/            # движок, модули, редакторы
│   │   ├── lib/           # базовые компоненты
│   │   │   ├── base/      # каркас страницы
│   │   │   ├── word/      # контент страницы + редакторы
│   │   │   │   ├── editor/    # GrapesJS
│   │   │   │   └── llm/       # LLM-редактор
│   │   │   ├── pages/     # список статей
│   │   │   └── nav/       # навигация
│   │   └── mod/           # встроенные модули (JSON)
│   └── models/            # SQLAlchemy-модели
├── utils/                 # утилиты
│   ├── llm/               # клиенты LLM (DeepSeek)
│   ├── sqlite.py          # подключение к БД
│   └── static.py          # раздача статики
├── alembic/               # миграции
├── cli.py                 # CLI
└── app.py                 # фабрика FastAPI
```

## Лицензия

MIT. См. [LICENSE](LICENSE).

## Ссылки

- PyPI: <https://pypi.org/project/neurocad/>
- GitHub: <https://github.com/aleksmir-dev/neurocad>
