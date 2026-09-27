# neurocad/utils/sqlite.py

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import AsyncAdaptedQueuePool
from sqlalchemy import event, text, select
from ..config import settings

# SQLite URL
SQLITE_URL = settings.SQLITE_URL

# Engine with async pool
#
# Notes on the connect_args:
#   check_same_thread=False — required for SQLAlchemy's async adapter.
#   timeout=30               — seconds to wait on a locked DB (kernel level).
#
# PRAGMA tuning is done in _set_sqlite_pragma below, once per new
# connection. See the docstring there for the reasoning.
engine = create_async_engine(
    SQLITE_URL,
    echo=True,
    poolclass=AsyncAdaptedQueuePool,
    connect_args={
        "check_same_thread": False,
        "timeout": 30,
    }
)


# ============================================
# SQLITE PRAGMA — once per new connection
# ============================================
#
# SQLite's default journal_mode is "delete": while one connection is
# writing (INSERT/UPDATE/DELETE), every other connection — including
# readers — blocks. With a FastAPI app that mixes HTTP saves,
# auto-saves, and WebSocket-driven LLM runs, that means a long write
# (e.g. saving a page) blocks the WS handler for the whole duration.
# In practice this looks like the WS "hanging" for tens of seconds.
#
# WAL (Write-Ahead Logging) fixes this: writers go to a separate
# -wal file, readers see a consistent snapshot. Writers and readers
# no longer block each other.
#
# The other PRAGMAs:
#   synchronous=NORMAL   — safe default under WAL; faster than FULL.
#   busy_timeout=30000   — if a writer must wait, wait up to 30 s
#                          instead of failing immediately.
#   foreign_keys=ON      — SQLite does not enforce FKs by default.
#
# All four run on every new DB connection. journal_mode is persistent
# (stored in the DB file), the rest are per-connection.

@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


# Session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)


async def get_db_sqlite():
    """Session generator for Dependency Injection (SQLite)."""
    async with AsyncSessionLocal() as session:
        yield session


def _log_sync(log, level: str, message: str) -> None:
    """Write through app.state.log if available, else silently."""
    if log is None:
        return
    fn = getattr(log, f"log_{level}_sync", None)
    if fn is None:
        return
    try:
        fn(target="sqlite", message=message)
    except Exception:
        pass


# ============================================
# FRESH-DB CHECK
# ============================================

async def _is_db_fresh() -> bool:
    """
    Return True if the DB has no users yet.

    "No users" is our marker for "clean DB": a freshly created DB
    has an empty `users` table, and demo data (if any) can be
    imported into it.

    If the table does not exist yet (very first run, migrations
    not applied), we treat this as "not fresh" — the importer
    must not run before the schema is in place anyway.

    Any user — superadmin, regular, whatever — is enough to
    consider the DB "in use". Demo data must never be mixed
    with real data.
    """
    try:
        from ..core.models.base import User

        async with AsyncSessionLocal() as session:
            stmt = select(User.id).limit(1)
            result = await session.execute(stmt)
            return result.scalar_one_or_none() is None
    except Exception:
        # Table `users` not there yet, DB unreachable, etc.
        # Conservative default: not fresh → skip demo import.
        return False


# ============================================
# INIT
# ============================================

async def init_sqlite(log=None):
    """
    Initialize SQLite:
      1. create working directories,
      2. check connection,
      3. apply migrations,
      4. import demo data — only if the DB is fresh (no users yet)
         AND `base/demo/` exists in the working directory,
      5. create superadmin,
      6. register modules from mod/,
      7. ensure the admin has a default Nav row (owns demo pages).

    log — app.state.log from lifespan. If None — silent.
    """
    try:
        # 1. Working directories (base/, log/, media/, app/, alembic/versions/)
        from .paths import ensure_workdirs
        ensure_workdirs()

        # 2. Check connection
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))

        if log is not None:
            await log.log_info(target="sqlite", message="SQLite connected")

        # 3. Alembic migrations
        from .migrations import apply_migrations
        apply_migrations()

        # 4. Demo data — only if the DB is fresh.
        #
        #    "Fresh" means: no users yet. If the DB already has
        #    any user (superadmin or regular), it is considered
        #    "in use" and demo data must NOT be mixed into it.
        #
        #    The importer itself also checks that `base/demo/`
        #    exists — so a user who deleted that folder gets a
        #    clean DB without demo content.
        #
        #    Non-fatal: import errors do not block startup.
        try:
            if await _is_db_fresh():
                from .dbsqlite.demo_import import import_demo
                await import_demo(log=log)
            else:
                _log_sync(
                    log,
                    "info",
                    "SQLite: DB is not fresh (users exist) — "
                    "demo import skipped",
                )
        except Exception as e:
            _log_sync(log, "warning", f"demo import failed: {e}")

        # 5. Superadmin (auth bootstrap)
        await ensure_superadmin(log=log)

        # 6. Modules (engine bootstrap).
        # NOTE: temporary for 0.1.x — will be replaced by web UI in 0.2.x.
        # Local import: utils/ must not depend on core/engine at module level.
        from ..core.engine.modules import ensure_modules
        from ..core.engine.route import MOD_ROOT
        await ensure_modules(MOD_ROOT, log)

        # 7. Default nav for admin (the object that owns demo pages).
        # Idempotent: does nothing if the row already exists.
        await ensure_default_nav(log=log)

    except Exception as e:
        error_msg = f"SQLite connection error: {e}"
        if log is not None:
            await log.log_error(target="sqlite", message=error_msg)
        raise


async def close_sqlite(log=None):
    """Close SQLite connection."""
    try:
        await engine.dispose()
        if log is not None:
            await log.log_info(target="sqlite", message="SQLite disconnected")
    except Exception as e:
        if log is not None:
            await log.log_error(target="sqlite", message=f"close error: {e}")


# ============================================
# SUPERADMIN
# ============================================

async def ensure_superadmin(log=None):
    """
    Check for a specific superadmin (by login from .env).
    If missing — create from SUPERADMIN_LOGIN and SUPERADMIN_PASSWORD.

    Does not fail if there are multiple superadmins — checks only the specific one.

    log — app.state.log from init_sqlite. If None — silent.
    """
    from ..config import settings
    from ..core.models.base import User
    from ..utils.hash import get_hash_string

    login = getattr(settings, "SUPERADMIN_LOGIN", "admin")
    password = getattr(settings, "SUPERADMIN_PASSWORD", "admin")

    async with AsyncSessionLocal() as session:
        # Check the specific user by login (not "any superadmin")
        stmt = select(User).where(User.login == login)
        result = await session.execute(stmt)
        existing_admin = result.scalar_one_or_none()

        if existing_admin:
            # If user exists but is not superadmin — promote
            if not existing_admin.is_superadmin:
                existing_admin.is_superadmin = True
                await session.commit()
                _log_sync(log, "info", f"User '{login}' promoted to superadmin")
            else:
                _log_sync(log, "info", f"Superadmin already exists: {existing_admin.login}")
            return

        # If user does not exist — create
        hashed_password = get_hash_string(password)

        new_admin = User(
            login=login,
            password=hashed_password,
            name="Админ",
            is_superadmin=True,
            is_active=True,
            is_delete=False,
        )
        session.add(new_admin)
        await session.commit()

        _log_sync(log, "info", f"Superadmin created: {login}")


# ============================================
# DEFAULT NAV
# ============================================

async def ensure_default_nav(log=None) -> int:
    """
    Ensure the admin user (id=1) has at least one Nav row for the
    'default' module. Called on every startup — idempotent.

    This Nav row is the "object" that owns all the built-in demo
    pages, so URLs like /core/engine/pages/<nav_id>/<date>/<time>
    work for the default content.

    Returns the nav.id of the admin's default nav (found or created),
    or 0 if admin / module not found.
    """
    from ..core.models.base import Nav, Module, User

    async with AsyncSessionLocal() as session:
        # 1. Find admin.
        admin_stmt = select(User).where(User.id == 1, User.is_delete == False)
        admin = (await session.execute(admin_stmt)).scalar_one_or_none()

        if not admin:
            _log_sync(log, "info", "admin (id=1) not found — skip ensure_default_nav")
            return 0

        # 2. Find the 'default' module by name.
        mod_stmt = select(Module).where(
            Module.name == "default",
            Module.is_delete == False,
        )
        module = (await session.execute(mod_stmt)).scalar_one_or_none()

        if not module:
            _log_sync(log, "info", "module 'default' not found — skip ensure_default_nav")
            return 0

        # 3. Does admin already have a nav for this module?
        nav_stmt = select(Nav).where(
            Nav.user_id == admin.id,
            Nav.module_id == module.id,
            Nav.is_delete == False,
        )
        existing = (await session.execute(nav_stmt)).scalar_one_or_none()

        if existing:
            _log_sync(
                log, "info",
                f"admin nav for 'default' already exists: id={existing.id}",
            )
            return existing.id

        # 4. Create it.
        nav = Nav(
            user_id=admin.id,
            parent_id=None,
            card_type="link",
            sort_order=1,
            name="Каталог статей",
            description=None,
            icon=None,
            module_id=module.id,
            is_delete=False,
        )
        session.add(nav)
        await session.commit()
        await session.refresh(nav)

        _log_sync(
            log, "info",
            f"created admin nav for 'default': id={nav.id}",
        )
        return nav.id