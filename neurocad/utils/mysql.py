# neurocad/utils/mysql.py

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text
from ..config import settings

# Переменные будут инициализированы только при вызове init_mysql()
engine = None
AsyncSessionLocal = None


async def init_mysql(log=None):
    """Инициализация MySQL (проверка подключения и создание engine).

    log — app.state.log from lifespan. If None — silent.
    """
    global engine, AsyncSessionLocal

    try:
        # Создаём engine ТОЛЬКО сейчас
        engine = create_async_engine(
            settings.DATABASE_URL,
            echo=settings.DEBUG,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True
        )

        AsyncSessionLocal = async_sessionmaker(
            engine,
            class_=AsyncSession,
            expire_on_commit=False
        )

        # Проверяем подключение
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))

        if log is not None:
            await log.log_info(target="mysql", message="MySQL connected")
        return True

    except Exception as e:
        error_msg = f"MySQL connection error: {e}"
        if log is not None:
            await log.log_error(target="mysql", message=error_msg)
        raise


async def get_db():
    """Генератор сессий для Dependency Injection"""
    if AsyncSessionLocal is None:
        raise RuntimeError("MySQL не инициализирован. Вызовите init_mysql() сначала.")

    async with AsyncSessionLocal() as session:
        yield session


async def close_mysql(log=None):
    """Закрытие соединения с MySQL.

    log — app.state.log from lifespan. If None — silent.
    """
    global engine, AsyncSessionLocal

    if engine is not None:
        try:
            await engine.dispose()
            if log is not None:
                await log.log_info(target="mysql", message="MySQL disconnected")
        except Exception as e:
            if log is not None:
                await log.log_error(target="mysql", message=f"close error: {e}")
        finally:
            engine = None
            AsyncSessionLocal = None
    # engine is None → nothing to close, stay silent.