# app/core/auth/middleware/auth.py

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from ..dependencies import CoreAuthDependencies


class CoreAuthMiddlewareAuth(BaseHTTPMiddleware):
    """Middleware для добавления пользователя в request.state"""
    
    async def dispatch(self, request: Request, call_next):
        # Получаем пользователя
        user = await CoreAuthDependencies.get_current_user_optional(request)
        
        # Сохраняем в request.state
        request.state.user = user
        request.state.is_authenticated = user is not None
        
        response = await call_next(request)
        return response


def setup_auth_middleware(app: FastAPI):
    """Функция для подключения middleware к приложению"""
    app.add_middleware(CoreAuthMiddlewareAuth)