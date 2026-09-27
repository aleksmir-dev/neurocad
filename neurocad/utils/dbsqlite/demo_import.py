# neurocad/utils/dbsqlite/demo_import.py

"""
Import demo data (SQL dumps) on first start.

Called from utils/sqlite.py → init_sqlite() AFTER migrations and
BEFORE ensure_superadmin().

The importer is a no-op when:

  - `base/demo/` does not exist in the working directory, or
  - `base/demo/manifest.json` is missing, or
  - `manifest.json` already has `applied: true` — that means demo
    was imported into this project before; we never import twice.

After a successful import, the importer sets `applied: true` in
`base/demo/manifest.json`. That flag is the ONLY marker of "demo
was applied here". The user controls it via the folder:

    keep base/demo/          → applied:true stays → no re-import
    delete base/demo/        → next run re-copies from package
                                and re-imports
    delete base/neurocad.db  → clean DB; base/demo/ stays,
                                applied:true stays → no re-import

`users`, `settings`, `page_chat`, `page_hist`, `runs`, `page_pres`,
`password_resets`, `alembic_version` are NEVER imported — by design.

Demo SQL dumps live in the working directory, next to the DB:
    <cwd>/base/demo/
      manifest.json
      modules.sql
      pages.sql
      nav.sql
      access.sql
"""

import json
from pathlib import Path


def _log(log, level: str, message: str) -> None:
    """Write through app.state.log if available, else print."""
    if log is None:
        # Нет логгера — печатаем, чтобы отладка была видна.
        print(f"[demo_import] {level.upper()}: {message}", flush=True)
        return
    fn = getattr(log, f"log_{level}_sync", None)
    if fn is None:
        print(f"[demo_import] {level.upper()}: {message}", flush=True)
        return
    try:
        fn(target="demo", message=message)
    except Exception:
        print(f"[demo_import] {level.upper()}: {message}", flush=True)


def _demo_dir() -> Path:
    """Return the demo dir in the working directory (base/demo)."""
    from ..paths import user_demo_dir
    return user_demo_dir()


def _split_sql_statements(sql: str) -> list[str]:
    """
    Split a SQL dump into individual statements on `;`.

    Correctly handles:
      - single-quoted string literals  ('...', with '' escape)
      - double-quoted identifiers      ("...", with "" escape)
      - line comments                  (-- ... until end of line)
      - block comments                 (/* ... */)

    Semicolons inside strings/comments do not split statements.
    Empty/whitespace-only chunks are dropped.
    """
    statements: list[str] = []
    buf: list[str] = []
    i = 0
    n = len(sql)

    in_single = False
    in_double = False
    in_line_comment = False
    in_block_comment = False

    while i < n:
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < n else ""

        if in_line_comment:
            # Line comment ends at newline; we drop the comment body.
            if ch == "\n":
                in_line_comment = False
                buf.append(ch)
            i += 1
            continue

        if in_block_comment:
            if ch == "*" and nxt == "/":
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue

        if in_single:
            buf.append(ch)
            if ch == "'" and nxt == "'":
                # Escaped quote '' inside string.
                buf.append(nxt)
                i += 2
                continue
            if ch == "'":
                in_single = False
            i += 1
            continue

        if in_double:
            buf.append(ch)
            if ch == '"' and nxt == '"':
                # Escaped quote "" inside identifier.
                buf.append(nxt)
                i += 2
                continue
            if ch == '"':
                in_double = False
            i += 1
            continue

        # Not in string/comment.
        if ch == "-" and nxt == "-":
            in_line_comment = True
            i += 2
            continue
        if ch == "/" and nxt == "*":
            in_block_comment = True
            i += 2
            continue
        if ch == "'":
            in_single = True
            buf.append(ch)
            i += 1
            continue
        if ch == '"':
            in_double = True
            buf.append(ch)
            i += 1
            continue
        if ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
            i += 1
            continue

        buf.append(ch)
        i += 1

    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)

    return statements


async def import_demo(log=None) -> None:
    """
    Import demo data if `base/demo/` exists and is not yet applied.

    Rules (checked in order):
      1. `base/demo/` does not exist            → skip.
      2. `base/demo/manifest.json` missing      → skip.
      3. manifest.applied is true               → skip.
      4. Otherwise → run the SQL dumps, then set applied:true.
    """
    _log(log, "info", "=== import_demo: START ===")
    demo = _demo_dir()
    _log(log, "info", f"demo dir resolved: {demo!r}")

    # 1. base/demo/ exists?
    if not demo.is_dir():
        _log(log, "info", f"demo: {demo} not found — skip import")
        _log(log, "info", "=== import_demo: END (no dir) ===")
        return

    # 2. manifest.json exists?
    manifest_path = demo / "manifest.json"
    _log(log, "info", f"manifest path: {manifest_path!r}")
    if not manifest_path.is_file():
        _log(log, "warning", f"demo: manifest not found at {manifest_path} — skip")
        _log(log, "info", "=== import_demo: END (no manifest) ===")
        return

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        _log(log, "info", f"manifest loaded: {manifest!r}")
    except Exception as e:
        _log(log, "warning", f"demo: manifest unreadable ({e}) — skip")
        _log(log, "info", "=== import_demo: END (manifest unreadable) ===")
        return

    # 3. already applied?
    if manifest.get("applied"):
        _log(log, "info", "demo: already applied — skip import")
        _log(log, "info", "=== import_demo: END (already applied) ===")
        return

    tables = manifest.get("tables", [])
    _log(log, "info", f"demo: tables to import = {tables!r}")
    _log(log, "info", f"demo: importing from {demo} ...")

    for idx, table in enumerate(tables, start=1):
        sql_file = demo / f"{table}.sql"
        _log(log, "info", f"[{idx}/{len(tables)}] table={table!r} file={sql_file!r}")
        if not sql_file.is_file():
            _log(log, "warning", f"demo: {sql_file.name} not found — skip")
            continue

        try:
            await _execute_sql_file(sql_file, log=log)
            _log(log, "info", f"demo: {table}.sql applied")
        except Exception as e:
            _log(log, "error", f"demo: {table}.sql failed: {type(e).__name__}: {e}")
            raise

    # ===== Mark as applied =====
    manifest["applied"] = True
    try:
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        _log(log, "info", "demo: marked as applied")
    except Exception as e:
        _log(log, "warning", f"demo: failed to write manifest ({e})")

    _log(log, "info", "demo: import complete")
    _log(log, "info", "=== import_demo: END ===")


async def _execute_sql_file(path: Path, log=None) -> None:
    """
    Execute a demo SQL dump against the async engine.

    The dump may contain multi-line INSERT statements — HTML content
    with embedded newlines and semicolons inside string literals — so
    statements are split with a quote/comment-aware scanner
    (`_split_sql_statements`). Each resulting statement is then
    executed via `Connection.exec_driver_sql()`.

    The engine is backed by aiosqlite, so the raw DBAPI connection
    behind `sync_conn.connection.driver_connection` is an
    `aiosqlite.core.Connection`, whose `.cursor()` is a coroutine.
    Calling it synchronously returns an `aiosqlite.context.Result`,
    not a cursor. We therefore stay on the SQLAlchemy side and use
    `exec_driver_sql()`, which works for both `sqlite3` and
    `aiosqlite` inside `run_sync()`.
    """
    from ..sqlite import engine

    _log(log, "info", f"--- _execute_sql_file: START file={path!r} ---")
    sql = path.read_text(encoding="utf-8")
    _log(log, "info", f"SQL file size: {len(sql)} chars")

    statements = _split_sql_statements(sql)
    _log(log, "info", f"parsed statements: {len(statements)}")

    if not statements:
        _log(log, "warning", "no statements to execute — nothing to do")
        _log(log, "info", "--- _execute_sql_file: END (empty) ---")
        return

    def _run(sync_conn):
        _log(log, "info",
             f"_run: sync_conn type = "
             f"{type(sync_conn).__module__}.{type(sync_conn).__name__}")
        for i, stmt in enumerate(statements, start=1):
            preview = stmt[:80].replace("\n", " ")
            _log(log, "info",
                 f"_run: [{i}/{len(statements)}] exec_driver_sql -> {preview!r}")
            try:
                sync_conn.exec_driver_sql(stmt)
            except Exception as e:
                _log(log, "error",
                     f"_run: FAILED at statement [{i}/{len(statements)}]: "
                     f"{type(e).__name__}: {e}")
                _log(log, "error", f"_run: offending statement: {stmt!r}")
                raise

    _log(log, "info", "_execute_sql_file: entering engine.begin() ...")
    try:
        async with engine.begin() as async_conn:
            _log(log, "info",
                 "_execute_sql_file: engine.begin() opened, "
                 "calling run_sync(_run) ...")
            await async_conn.run_sync(_run)
            _log(log, "info",
                 "_execute_sql_file: run_sync(_run) returned, committing ...")
    except Exception as e:
        _log(log, "error",
             f"_execute_sql_file: engine.begin() block FAILED: "
             f"{type(e).__name__}: {e}")
        raise

    _log(log, "info", "--- _execute_sql_file: END ---")