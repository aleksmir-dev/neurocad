# neurocad/utils/lifespan.py

from fastapi import FastAPI
from contextlib import asynccontextmanager

from ..utils.log import Log
from ..utils.mysql import init_mysql, close_mysql
from ..utils.sqlite import init_sqlite, close_sqlite
from ..config import settings


def get_lifespan():
    """Возвращает lifespan контекстный менеджер."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Управление жизненным циклом приложения."""

        # Логгер
        app.state.log = Log()

        # Лог запуска
        await app.state.log.log_info(
            target="startup",
            message=f"Запуск приложения на порту {settings.APP_PORT}",
        )

        # MySQL — только если задан DATABASE_URL
        if settings.DATABASE_URL:
            await init_mysql(app.state.log)
        else:
            await app.state.log.log_info(
                target="startup",
                message="MySQL отключён (DATABASE_URL пуст)",
            )

        # SQLite — всегда
        await init_sqlite(app.state.log)

        # Контекст приложения
        yield

        # Shutdown MySQL — только если был подключён
        if settings.DATABASE_URL:
            await close_mysql()

        # Shutdown SQLite
        await close_sqlite()

        # Лог остановки
        await app.state.log.log_info(
            target="shutdown",
            message="Остановка приложения",
        )

        # Shutdown логгера
        await app.state.log.shutdown()

    return lifespan