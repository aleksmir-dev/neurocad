# neurocad/utils/sqlite.py

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import AsyncAdaptedQueuePool
from sqlalchemy import text, select
from pathlib import Path
from ..config import settings
import logging

logger = logging.getLogger(__name__)

# SQLite URL
SQLITE_URL = settings.SQLITE_URL

# Engine with async pool
engine = create_async_engine(
    SQLITE_URL,
    echo=True,
    poolclass=AsyncAdaptedQueuePool,
    connect_args={
        "check_same_thread": False,
        "timeout": 30,
    }
)

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


async def init_sqlite(log=None):
    """
    Initialize SQLite:
      1. create working directories,
      2. check connection,
      3. apply migrations,
      4. create superadmin,
      5. register modules from mod/.
    """
    try:
        # 1. Working directories (base/, log/, media/, app/, alembic/versions/)
        from .paths import ensure_workdirs
        ensure_workdirs()

        # 2. Check connection
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))

        if log:
            await log.log_info(target="sqlite", message="SQLite connected")
        else:
            print("[SQLite] connected")

        # 3. Alembic migrations
        from .migrations import apply_migrations
        apply_migrations()

        # 4. Superadmin (auth bootstrap)
        await ensure_superadmin()

        # 5. Modules (engine bootstrap).
        # NOTE: temporary for 0.1.x — will be replaced by web UI in 0.2.x.
        # Local import: utils/ must not depend on core/engine at module level.
        from ..core.engine.modules import ensure_modules
        from ..core.engine.route import MOD_ROOT
        await ensure_modules(MOD_ROOT, log)

    except Exception as e:
        error_msg = f"SQLite connection error: {e}"
        if log:
            await log.log_error(target="sqlite", message=error_msg)
        else:
            print(f"[SQLite] ERROR: {error_msg}")
        raise


async def close_sqlite():
    """Close SQLite connection."""
    try:
        await engine.dispose()
        print("[SQLite] disconnected")
    except Exception as e:
        print(f"[SQLite] close error: {e}")


async def ensure_superadmin():
    """
    Check for a specific superadmin (by login from .env).
    If missing — create from SUPERADMIN_LOGIN and SUPERADMIN_PASSWORD.

    Does not fail if there are multiple superadmins — checks only the specific one.
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
                logger.info(f"User '{login}' promoted to superadmin")
                print(f"[Superadmin] user '{login}' promoted")
            else:
                logger.info(f"Superadmin already exists: {existing_admin.login}")
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

        logger.info(f"Superadmin created: {login}")
        print(f"[Superadmin] created: {login}")