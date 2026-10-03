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
      7. ensure the admin has a default Nav row (owns demo pages),
      8. ensure the admin has a Balance row.

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

        # 8. Balance row for admin (user_id = 1, created by step 5).
        # Idempotent: does nothing if the row already exists.
        await ensure_user_balance(user_id=1, log=log)

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


# ============================================
# USER BALANCE
# ============================================

async def ensure_user_balance(user_id: int, log=None) -> int:
    """
    Ensure a balance row exists for the given user.

    Idempotent: if the row already exists, returns its id without
    creating a new one.

    New users start on the TRIAL tariff (code 3, 1 day, same
    limits as llm). The lazy reset in BalanceChecked.reset_if_needed()
    will switch them to free after 1 day.

    Trial is granted WITH tokens already topped up to the trial
    cap — otherwise llm_allowed() sees tokens=0 against a non-zero
    limit_tokens and reports 'tokens_exhausted' on the very first
    LLM request. reset_if_needed() does NOT top up trial tokens
    (trial has no daily/monthly accrual), so it must be done here.

    Default values for a new user:

        tarif          = 3         (trial, 1 day)
        tokens         = 2_000_000 (same as limit_tokens — trial is
                                    "unlimited" for its 1-day window)
        gen            = 0
        sum            = 0
        mb             = 0
        pages          = 0
        price          = 0
        refer_id       = None
        day            = today.day (so billing/expiry math has a value)
        acc_at         = today     (trial start date — the 24h clock)

        limit_genday   = 0
        limit_genmon   = 0
        limit_mb       = 1024      (1 GB, same as llm)
        limit_pages    = 0         (unlimited, same as llm)
        limit_tokens   = 2_000_000 (2M, same as llm)

    Returns the balance row id, or 0 on error / user not found.
    """
    from datetime import date
    from ..core.models.base import Balance, User

    # Must match limit_tokens below. Kept local on purpose: utils/
    # must not import from core/engine/lib at module level (see the
    # note in init_sqlite about the utils/ → core/engine dependency).
    TRIAL_TOKENS = 2_000_000

    async with AsyncSessionLocal() as session:
        # 1. Verify the user exists (defensive — avoids FK errors).
        user_stmt = select(User).where(
            User.id == user_id,
            User.is_delete == False,
        )
        user = (await session.execute(user_stmt)).scalar_one_or_none()
        if not user:
            _log_sync(
                log, "info",
                f"ensure_user_balance: user {user_id} not found — skip",
            )
            return 0

        # 2. Does a balance row already exist?
        bal_stmt = select(Balance).where(
            Balance.user_id == user_id,
            Balance.is_delete == False,
        )
        existing = (await session.execute(bal_stmt)).scalar_one_or_none()
        if existing:
            _log_sync(
                log, "info",
                f"ensure_user_balance: balance for user {user_id} "
                f"already exists (id={existing.id})",
            )
            return existing.id

        # 3. Create it with TRIAL defaults (code 3, same limits as llm),
        #    tokens topped up so the first LLM call passes llm_allowed().
        today = date.today()

        bal = Balance(
            user_id=user_id,
            tarif=3,                       # trial
            day=today.day,                 # needed for billing-day math
            gen=0,
            tokens=TRIAL_TOKENS,           # trial is "unlimited" for 1 day
            sum=0,
            mb=0,
            pages=0,
            price=0,
            refer_id=None,
            limit_genday=0,
            limit_genmon=0,
            limit_mb=1024,
            limit_pages=0,
            limit_tokens=TRIAL_TOKENS,
            acc_at=today,                  # trial clock starts now
            is_delete=False,
        )
        session.add(bal)
        await session.commit()
        await session.refresh(bal)

        _log_sync(
            log, "info",
            f"ensure_user_balance: created balance id={bal.id} "
            f"for user {user_id} (trial, tokens={TRIAL_TOKENS})",
        )
        return bal.id