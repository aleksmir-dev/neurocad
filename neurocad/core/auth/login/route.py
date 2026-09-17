# app/core/auth/login/route.py

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from datetime import timedelta
import time

from .schema import CoreAuthLoginRequestSchema
from .service import CoreAuthLoginService
from ..dependencies import CoreAuthDependencies
from ....config import settings

router = APIRouter(prefix="/login", tags=["core/auth/login"])

# Хранилище для rate limiting (в продакшене использовать Redis)
login_attempts = {}


@router.post("")
async def login(request: Request, login_data: CoreAuthLoginRequestSchema) -> JSONResponse:
    """
    Вход пользователя
    
    Возвращает JWT токен в HttpOnly cookie
    """
    log = request.app.state.log if hasattr(request.app.state, 'log') else None
    client_ip = request.client.host if request.client else "unknown"
    
    # Rate limiting
    now = time.time()
    if client_ip in login_attempts:
        login_attempts[client_ip] = [t for t in login_attempts[client_ip] if now - t < 3600]
        if len(login_attempts[client_ip]) >= 5:
            if log:
                await log.log_warning(target="auth", message=f"Rate limit exceeded for IP: {client_ip}")
            return JSONResponse(
                status_code=429,
                content={
                    "success": False,
                    "message": "Слишком много попыток. Попробуйте через час."
                }
            )
    
    # Аутентификация
    user = await CoreAuthLoginService.login(login_data.login, login_data.password, log=log)
    
    if not user:
        # Запоминаем неудачную попытку
        if client_ip not in login_attempts:
            login_attempts[client_ip] = []
        login_attempts[client_ip].append(time.time())
        
        if log:
            await log.log_warning(target="auth", message=f"Failed login attempt for: {login_data.login} from IP: {client_ip}")
        return JSONResponse(
            status_code=401,
            content={
                "success": False,
                "message": "Неверный логин или пароль"
            }
        )
    
    # Успешный вход - сбрасываем попытки
    if client_ip in login_attempts:
        login_attempts[client_ip] = []
    
    # Создаём JWT токен
    access_token = CoreAuthDependencies.create_access_token(data={"sub": str(user["id"])})
    
    # Создаём ответ с токеном в cookie
    response = JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": "Вход выполнен успешно",
            "data": {
                "user": {
                    "id": user["id"],
                    "login": user["login"],
                    "name": user["name"],
                    "email": user["email"],
                    "is_superadmin": user["is_superadmin"]
                }
            }
        }
    )
    
    # Устанавливаем HttpOnly cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,  # В продакшене установить True (HTTPS)
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    
    if log:
        await log.log_info(target="auth", message=f"User {user['login']} logged in successfully")
    return response


@router.post("/logout")
async def logout(request: Request) -> JSONResponse:
    """
    Выход пользователя
    
    Удаляет HttpOnly cookie с токеном
    """
    log = request.app.state.log if hasattr(request.app.state, 'log') else None
    
    response = JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": "Выход выполнен успешно"
        }
    )
    response.delete_cookie("access_token")
    
    if log:
        await log.log_info(target="auth", message="User logged out")
    return response