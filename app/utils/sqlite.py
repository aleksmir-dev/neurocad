# app/utils/sqlite.py

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import AsyncAdaptedQueuePool
from sqlalchemy import text
from pathlib import Path

# База данных в папке base (на уровне с app)
BASE_DIR = Path(__file__).parent.parent.parent  # идём в корень проекта
SQLITE_DIR = BASE_DIR / "base"
SQLITE_PATH = SQLITE_DIR / "sqlite.db"

# Создаём папку base, если её нет
SQLITE_DIR.mkdir(parents=True, exist_ok=True)

# URL для SQLite
SQLITE_URL = f"sqlite+aiosqlite:///{SQLITE_PATH}"

# Движок с правильным асинхронным пулом
engine = create_async_engine(
    SQLITE_URL,
    echo=True,  # Для SQLite лучше видеть запросы
    poolclass=AsyncAdaptedQueuePool,  # Явно указываем асинхронный пул
    connect_args={
        "check_same_thread": False,  # Важно для асинхронного SQLite
        "timeout": 30,               # Таймаут ожидания блокировки БД
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
    """Инициализация SQLite (проверка подключения)"""
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        
        if log:
            await log.log_info(target="sqlite", message=f"Подключение к SQLite успешно: {SQLITE_PATH}")
        else:
            print(f"✅ SQLite connected: {SQLITE_PATH}")
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