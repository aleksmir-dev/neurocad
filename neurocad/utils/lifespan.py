# neurocad/utils/lifespan.py

from fastapi import FastAPI
from contextlib import asynccontextmanager

from ..utils.log import Log
from ..utils.mysql import init_mysql, close_mysql
from ..utils.sqlite import init_sqlite, close_sqlite
from ..utils.paths import ensure_workdirs
from ..config import settings


def get_lifespan():
    """Return lifespan context manager."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Application lifecycle manager."""

        # Ensure working directories and files exist
        ensure_workdirs()

        # Logger
        app.state.log = Log()

        # Startup log
        await app.state.log.log_info(
            target="startup",
            message=f"Starting application on port {settings.APP_PORT}",
        )

        # MySQL — only if DATABASE_URL is set
        if settings.DATABASE_URL:
            await init_mysql(app.state.log)
        else:
            await app.state.log.log_info(
                target="startup",
                message="MySQL disabled (DATABASE_URL is empty)",
            )

        # SQLite — always.
        # Includes: migrations, superadmin, modules registration.
        await init_sqlite(app.state.log)

        yield

        # Shutdown MySQL — only if connected
        if settings.DATABASE_URL:
            await close_mysql()

        # Shutdown SQLite
        await close_sqlite()

        # Shutdown log
        await app.state.log.log_info(
            target="shutdown",
            message="Stopping application",
        )

        # Shutdown logger
        await app.state.log.shutdown()

    return lifespan