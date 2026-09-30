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

    # Root — redirect to the module resolved by Host (via `domain`
    # in the module's JSON). Fallback to APP_MAIN_PAGE / default.
    @app.get("/")
    async def root(request: Request):
        """
        Root — redirect to /core/engine/<module>.

        The module is resolved from the Host header: any module JSON
        under `app/` with matching `domain` wins. If no module matches
        the Host, we fall back to settings.APP_MAIN_PAGE, then to
        /core/engine/default.

        Set APP_MAIN_PAGE in .env to override the fallback.
        """
        from neurocad.core.engine.route import _resolve_module_by_host

        host_module = _resolve_module_by_host(request.headers.get("host"))

        if host_module:
            return RedirectResponse(url=f"/core/engine/{host_module}")

        main_url = settings.APP_MAIN_PAGE
        if not main_url or main_url == "/":
            main_url = "/core/engine/default"
        return RedirectResponse(url=main_url)