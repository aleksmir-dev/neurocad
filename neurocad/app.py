# neurocad/app.py

"""NeuroCad — фабрика FastAPI-приложения."""

from fastapi import FastAPI

from .config import settings as default_settings


class NeuroCad:
    """NeuroCad — фабрика FastAPI-приложения."""

    def __init__(self, config=None, **kwargs):
        self.config = config or default_settings

        # Логгер
        from .utils.log import Log
        self.log = Log(log_dir=str(self.config.LOG_PATH))

        # Lifespan — инициализация БД, shutdown
        from .utils.lifespan import get_lifespan

        self.app = FastAPI(
            title=getattr(self.config, "APP_TITLE", None) or "NeuroCad",
            debug=getattr(self.config, "DEBUG", True),
            lifespan=get_lifespan(),
        )

        self._setup_cors()
        self._setup_static()
        self._setup_routes()
        self._setup_middleware()

    def __getattr__(self, name):
        return getattr(self.app, name)

    async def __call__(self, scope, receive, send):
        await self.app(scope, receive, send)

    def _setup_cors(self):
        from .utils.cors import setup_cors
        setup_cors(self.app)

    def _setup_static(self):
        from .utils.static import setup_static
        setup_static(self.app, log=self.log)

    def _setup_routes(self):
        from .utils.routes import setup_routes
        setup_routes(self.app)

    def _setup_middleware(self):
        from .core.auth.middleware.auth import CoreAuthMiddlewareAuth
        self.app.add_middleware(CoreAuthMiddlewareAuth)