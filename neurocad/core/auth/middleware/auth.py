# app/core/auth/middleware/auth.py

from fastapi import FastAPI, Request
from starlette.types import ASGIApp, Scope, Receive, Send


class CoreAuthMiddlewareAuth:
    """
    Pure ASGI middleware.

    Adds `request.state.user` / `request.state.is_authenticated` for HTTP.
    WebSocket connections are passed through untouched — WS auth is done
    inside the WS endpoint itself (via cookies).
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):

        # --- WebSocket: пропускаем без HTTP-логики ---
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # --- HTTP: наша логика ---
        from ..dependencies import CoreAuthDependencies

        request = Request(scope, receive=receive)
        user = await CoreAuthDependencies.get_current_user_optional(request)
        scope.setdefault("state", {})
        scope["state"]["user"] = user
        scope["state"]["is_authenticated"] = user is not None

        await self.app(scope, receive, send)


def setup_auth_middleware(app: FastAPI):
    app.add_middleware(CoreAuthMiddlewareAuth)