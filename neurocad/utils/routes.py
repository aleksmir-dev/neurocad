# neurocad/utils/routes.py

from fastapi import FastAPI
from fastapi.responses import RedirectResponse

from neurocad.core.route import router as core_router
from neurocad.config import settings


def setup_routes(app: FastAPI) -> None:
    """Подключение всех роутеров приложения."""

    # Роутеры ядра
    app.include_router(core_router)

    # Корневой маршрут
    @app.get("/")
    async def root():
        """
        Редирект на главную страницу.

        По умолчанию — /core/engine/app.
        Если в настройках задан APP_MAIN_PAGE — используется он.
        """
        main_url = settings.APP_MAIN_PAGE

        # Если не задано или корень — берём дефолт
        if not main_url or main_url == "/":
            main_url = "/core/engine/default"

        return RedirectResponse(url=main_url)