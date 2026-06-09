# app/utils/lifespan.py

from fastapi import FastAPI
from contextlib import asynccontextmanager
from ..utils.log import Log
from ..utils.mysql import init_mysql, close_mysql
# from ..utils.database import init_mysql, close_mysql
from ..utils.sqlite import init_sqlite, close_sqlite
from ..config import settings


def get_lifespan():
    """Возвращает lifespan контекстный менеджер"""
    
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Управление жизненным циклом приложения"""
        
        # Создание объекта логгера
        app.state.log = Log()
        
        # Лог запуска приложения
        await app.state.log.log_info(target="startup", message=f"Запуск приложения на порту {settings.APP_PORT}")
        
        # Инициализация баз данных
        await init_mysql(app.state.log)
        await init_sqlite(app.state.log)        
        
        # Контекст приложения
        yield
        
        # Закрытие соединения с базами данных
        await close_mysql()
        await close_sqlite()
        
        # Лог остановки
        await app.state.log.log_info(target="shutdown", message="Остановка приложения")
        
        # Shutdown для корректного завершения работы асинхронных логгеров
        await app.state.log.shutdown()
    
    return lifespan
