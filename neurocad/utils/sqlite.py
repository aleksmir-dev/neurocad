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


async def init_sqlite(log=None):
    """
    Initialize SQLite:
      1. create working directories,
      2. check connection,
      3. apply migrations,
      4. create superadmin,
      5. register modules from mod/.

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

        # 4. Superadmin (auth bootstrap)
        await ensure_superadmin(log=log)

        # 5. Modules (engine bootstrap).
        # NOTE: temporary for 0.1.x — will be replaced by web UI in 0.2.x.
        # Local import: utils/ must not depend on core/engine at module level.
        from ..core.engine.modules import ensure_modules
        from ..core.engine.route import MOD_ROOT
        await ensure_modules(MOD_ROOT, log)

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