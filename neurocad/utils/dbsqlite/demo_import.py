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
    """Write through app.state.log if available, else silently."""
    if log is None:
        return
    fn = getattr(log, f"log_{level}_sync", None)
    if fn is None:
        return
    try:
        fn(target="demo", message=message)
    except Exception:
        pass


def _demo_dir() -> Path:
    """Return the demo dir in the working directory (base/demo)."""
    from ..paths import user_demo_dir
    return user_demo_dir()


async def import_demo(log=None) -> None:
    """
    Import demo data if `base/demo/` exists and is not yet applied.

    Rules (checked in order):
      1. `base/demo/` does not exist            → skip.
      2. `base/demo/manifest.json` missing      → skip.
      3. manifest.applied is true               → skip.
      4. Otherwise → run the SQL dumps, then set applied:true.
    """
    demo = _demo_dir()

    # 1. base/demo/ exists?
    if not demo.is_dir():
        _log(log, "info", f"demo: {demo} not found — skip import")
        return

    # 2. manifest.json exists?
    manifest_path = demo / "manifest.json"
    if not manifest_path.is_file():
        _log(log, "warning", f"demo: manifest not found at {manifest_path} — skip")
        return

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as e:
        _log(log, "warning", f"demo: manifest unreadable ({e}) — skip")
        return

    # 3. already applied?
    if manifest.get("applied"):
        _log(log, "info", "demo: already applied — skip import")
        return

    tables = manifest.get("tables", [])
    _log(log, "info", f"demo: importing from {demo} ...")

    for table in tables:
        sql_file = demo / f"{table}.sql"
        if not sql_file.is_file():
            _log(log, "warning", f"demo: {sql_file.name} not found — skip")
            continue

        try:
            await _execute_sql_file(sql_file)
            _log(log, "info", f"demo: {table}.sql applied")
        except Exception as e:
            _log(log, "error", f"demo: {table}.sql failed: {e}")
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


async def _execute_sql_file(path: Path) -> None:
    """
    Execute a demo SQL dump against the async engine.

    Uses the raw DBAPI connection (via engine.begin().run_sync())
    so PRAGMA statements take effect. session.execute(text("PRAGMA"))
    is unreliable — SQLAlchemy treats PRAGMA as a SELECT and may
    not apply the side effect.
    """
    from ..sqlite import engine

    sql = path.read_text(encoding="utf-8")

    statements: list[str] = []
    for line in sql.splitlines():
        line = line.strip()
        if not line or line.startswith("--"):
            continue
        statements.append(line)

    def _run(sync_conn):
        cur = sync_conn.cursor()
        try:
            for stmt in statements:
                cur.execute(stmt)
        finally:
            cur.close()

    async with engine.begin() as async_conn:
        await async_conn.run_sync(_run)