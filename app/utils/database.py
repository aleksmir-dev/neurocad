# app/utils/mysql.py

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text
from ..config import settings

# Переменные будут инициализированы только при вызове init_mysql()
engine = None
AsyncSessionLocal = None


async def init_mysql(log=None):
    """Инициализация MySQL (проверка подключения и создание engine)"""
    global engine, AsyncSessionLocal
    
    # Проверяем, нужно ли подключаться
    '''
    if not settings.has_mysql:
        msg = "MySQL не настроен (DATABASE_URL отсутствует или не MySQL)"
        if log:
            await log.log_info(target="mysql", message=msg)
        else:
            print(f"ℹ️ {msg}")
        return False
    '''
    
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
        
        if log:
            await log.log_info(target="mysql", message="Подключение к MySQL успешно")
        else:
            print("✅ MySQL connected")
        return True
        
    except Exception as e:
        error_msg = f"Ошибка подключения к MySQL: {e}"
        if log:
            await log.log_error(target="mysql", message=error_msg)
        else:
            print(f"❌ {error_msg}")
        raise


async def get_db():
    """Генератор сессий для Dependency Injection"""
    if AsyncSessionLocal is None:
        raise RuntimeError("MySQL не инициализирован. Вызовите init_mysql() сначала.")
    
    async with AsyncSessionLocal() as session:
        yield session


async def close_mysql():
    """Закрытие соединения с MySQL"""
    global engine, AsyncSessionLocal
    
    if engine is not None:
        try:
            await engine.dispose()
            print("✅ MySQL disconnected")
        except Exception as e:
            print(f"❌ Error closing MySQL: {e}")
        finally:
            engine = None
            AsyncSessionLocal = None
    else:
        print("ℹ️ MySQL не был инициализирован, закрывать нечего")