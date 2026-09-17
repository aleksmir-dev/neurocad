# neurocad/utils/sqlite.py

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import AsyncAdaptedQueuePool
from sqlalchemy import text, select
from pathlib import Path
from ..config import settings
import logging

logger = logging.getLogger(__name__)

# URL для SQLite
SQLITE_URL = settings.SQLITE_URL

# Движок с правильным асинхронным пулом
engine = create_async_engine(
    SQLITE_URL,
    echo=True,
    poolclass=AsyncAdaptedQueuePool,
    connect_args={
        "check_same_thread": False,
        "timeout": 30,
    }
)

# Фабрика сессий
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)


async def get_db_sqlite():
    """Генератор сессий для Dependency Injection (SQLite)"""
    async with AsyncSessionLocal() as session:
        yield session


async def init_sqlite(log=None):
    """Инициализация SQLite:
       1. создаёт рабочие директории,
       2. проверяет подключение,
       3. применяет миграции,
       4. создаёт суперадмина.
    """
    try:
        # 1. Рабочие директории (base/, log/, media/, static/, templates/, app/)
        from .paths import ensure_workdirs
        ensure_workdirs()

        # 2. Проверка подключения
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))

        if log:
            await log.log_info(target="sqlite", message="Подключение к SQLite успешно")
        else:
            print("✅ SQLite connected")

        # 3. Миграции Alembic
        from .migrations import apply_migrations
        apply_migrations()

        # 4. Суперадмин
        await ensure_superadmin()

    except Exception as e:
        error_msg = f"Ошибка подключения к SQLite: {e}"
        if log:
            await log.log_error(target="sqlite", message=error_msg)
        else:
            print(f"❌ {error_msg}")
        raise


async def close_sqlite():
    """Закрытие соединения с SQLite"""
    try:
        await engine.dispose()
        print("✅ SQLite disconnected")
    except Exception as e:
        print(f"❌ Error closing SQLite: {e}")


async def ensure_superadmin():
    """
    Проверяет наличие конкретного супер-администратора (по логину из .env).
    Если его нет — создаёт из переменных окружения SUPERADMIN_LOGIN и SUPERADMIN_PASSWORD.

    НЕ падает, если супер-админов несколько — проверяет только конкретного.
    """
    from ..config import settings
    from ..core.models.base import User
    from ..utils.hash import get_hash_string

    # Логин из .env
    login = getattr(settings, "SUPERADMIN_LOGIN", "admin")
    password = getattr(settings, "SUPERADMIN_PASSWORD", "admin")

    async with AsyncSessionLocal() as session:
        # Проверяем конкретного пользователя по логину (а не "любого супер-админа")
        stmt = select(User).where(User.login == login)
        result = await session.execute(stmt)
        existing_admin = result.scalar_one_or_none()

        if existing_admin:
            # Если пользователь есть, но он не супер-админ — делаем его супер-админом
            if not existing_admin.is_superadmin:
                existing_admin.is_superadmin = True
                await session.commit()
                logger.info(f"✅ User '{login}' promoted to superadmin")
                print(f"✅ User '{login}' promoted to superadmin")
            else:
                logger.info(f"✅ Superadmin already exists: {existing_admin.login}")
            return

        # Если пользователя нет — создаём
        hashed_password = get_hash_string(password)

        new_admin = User(
            login=login,
            password=hashed_password,
            name="Супер Админ",
            is_superadmin=True,
            is_active=True,
            is_delete=False
        )
        session.add(new_admin)
        await session.commit()

        logger.info(f"✅ Superadmin created: {login}")
        print(f"✅ Superadmin created: {login}")