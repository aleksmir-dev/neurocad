# neurocad/utils/routes.py

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse

from neurocad.core.route import router as core_router
from neurocad.core.engine.lib.pages.public.route import router as pages_public_router
from neurocad.config import settings


def setup_routes(app: FastAPI) -> None:
    """Register all application routes."""

    # Core routes — /core/*
    app.include_router(core_router)

    # Public pages — /pages/*
    app.include_router(pages_public_router)

    # Root — redirect to APP_MAIN_PAGE
    @app.get("/")
    async def root():
        """
        Root — redirect to APP_MAIN_PAGE.

        Default: /core/engine/default (admin).
        Set APP_MAIN_PAGE in .env to change.
        """
        main_url = settings.APP_MAIN_PAGE
        if not main_url or main_url == "/":
            main_url = "/core/engine/default"
        return RedirectResponse(url=main_url)
    
 