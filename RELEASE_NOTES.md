# neurocad 0.1.24

Release date: 2026-09-27

---

## English

### Fixed

- **Demo import on first start (`neurocad/utils/dbsqlite/demo_import.py`)** — the fix in 0.1.23 was incomplete, and this release supersedes it. Three issues stacked on top of each other:
  1. The importer called `.cursor()` on a `sqlalchemy.engine.Connection`, which has no such method.
  2. After the 0.1.23 partial fix, the raw DBAPI connection was reached via `sync_conn.connection.driver_connection`, but on the `aiosqlite`-backed engine that object's `.cursor()` is a coroutine. A synchronous call returned an `aiosqlite.context.Result` instead of a cursor, so the import failed with `'Result' object has no attribute 'execute'`.
  3. The SQL dump was split line by line, which broke multi-line `INSERT`s with HTML payloads (`unrecognized token`). Handing the whole file to `exec_driver_sql` instead failed with `You can only execute one statement at a time`.

  The importer now uses `Connection.exec_driver_sql()` per statement, and statements are split with `_split_sql_statements()` — a quote/comment-aware scanner that honours single quotes, double quotes, `--` line comments and `/* */` block comments. Demo data (`modules`, `pages`, `nav`, `access`) now imports correctly on first start.

---

## Русский

### Исправлено

- **Импорт демо-данных при первом старте (`neurocad/utils/dbsqlite/demo_import.py`)** — фикс в 0.1.23 был неполным, этот релиз его заменяет. Три проблемы наложились друг на друга:
  1. Импортёр вызывал `.cursor()` у `sqlalchemy.engine.Connection`, а такого метода там нет.
  2. После частичного фикса в 0.1.23 сырое DBAPI-соединение доставалось через `sync_conn.connection.driver_connection`, но на движке с `aiosqlite` у этого объекта `.cursor()` — корутина. Синхронный вызов возвращал `aiosqlite.context.Result` вместо курсора, и импорт падал с `'Result' object has no attribute 'execute'`.
  3. SQL-дамп разбивался построчно, что рвало многострочные `INSERT` с HTML-содержимым (`unrecognized token`). Попытка отдать весь файл в `exec_driver_sql` падала с `You can only execute one statement at a time`.

  Теперь импортёр использует `Connection.exec_driver_sql()` для каждого стейтмента, а сами стейтменты режутся через `_split_sql_statements()` — сканер, учитывающий одинарные и двойные кавычки, `--`-комментарии и `/* */`-блоки. Демо-данные (`modules`, `pages`, `nav`, `access`) теперь импортируются при первом старте корректно.