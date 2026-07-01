# app/core/auth/dependencies.py

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from datetime import datetime, timedelta
from urllib.parse import urlencode
from ...config import settings
from .service import AuthService

security = HTTPBearer(auto_error=False)


def create_access_token(data: dict) -> str:
    """Создание JWT токена"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def get_token_from_request(request: Request) -> str | None:
    """Получает токен из заголовка Authorization или из cookie"""
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:]
    
    token = request.cookies.get("access_token")
    if token:
        return token
    
    return None


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Обязательная авторизация с редиректом на логин"""
    token = get_token_from_request(request)
    
    if not token:
        redirect_url = str(request.url)
        login_url = f"/core/auth/login?{urlencode({'redirect': redirect_url})}"  # ← исправлено
        raise HTTPException(
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
            detail="Not authenticated",
            headers={"Location": login_url}
        )
    
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            redirect_url = str(request.url)
            login_url = f"/core/auth/login?{urlencode({'redirect': redirect_url})}"  # ← исправлено
            raise HTTPException(
                status_code=status.HTTP_307_TEMPORARY_REDIRECT,
                detail="Invalid token",
                headers={"Location": login_url}
            )
    except JWTError:
        redirect_url = str(request.url)
        login_url = f"/core/auth/login?{urlencode({'redirect': redirect_url})}"  # ← исправлено
        raise HTTPException(
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
            detail="Invalid token",
            headers={"Location": login_url}
        )
    
    user = await AuthService.get_user_by_id(int(user_id))
    if user is None:
        redirect_url = str(request.url)
        login_url = f"/core/auth/login?{urlencode({'redirect': redirect_url})}"  # ← исправлено
        raise HTTPException(
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
            detail="User not found",
            headers={"Location": login_url}
        )
    
    return user


async def get_current_user_optional(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Опциональная авторизация"""
    token = get_token_from_request(request)
    
    if not token:
        return None
    
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None
    
    user = await AuthService.get_user_by_id(int(user_id))
    return user
