# app/core/auth/dependencies.py

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from ...config import settings
from .service import CoreAuthService

security = HTTPBearer(auto_error=False)


class CoreAuthDependencies:
    """Зависимости для авторизации"""

    @staticmethod
    def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
        """Создание JWT токена"""
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode.update({"exp": expire})
        return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

    @staticmethod
    def get_token_from_request(request: Request) -> Optional[str]:
        """Получает токен из заголовка Authorization или из cookie"""
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            return auth_header[7:]
        
        token = request.cookies.get("access_token")
        if token:
            return token
        
        return None

    @staticmethod
    async def get_current_user(
        request: Request,
        credentials: HTTPAuthorizationCredentials = Depends(security)
    ) -> Dict[str, Any]:
        """
        Обязательная авторизация
        
        Возвращает данные пользователя или выбрасывает 401 ошибку с JSON
        """
        token = CoreAuthDependencies.get_token_from_request(request)
        
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "success": False,
                    "message": "Требуется авторизация"
                },
                headers={"WWW-Authenticate": "Bearer"}
            )
        
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            user_id: int = payload.get("sub")
            if user_id is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={
                        "success": False,
                        "message": "Недействительный токен"
                    },
                    headers={"WWW-Authenticate": "Bearer"}
                )
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "success": False,
                    "message": "Недействительный токен"
                },
                headers={"WWW-Authenticate": "Bearer"}
            )
        
        log = request.app.state.log if hasattr(request.app.state, 'log') else None
        user = await CoreAuthService.get_user_by_id(int(user_id), log=log)
        
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "success": False,
                    "message": "Пользователь не найден"
                },
                headers={"WWW-Authenticate": "Bearer"}
            )
        
        return user

    @staticmethod
    async def get_current_user_optional(
        request: Request,
        credentials: HTTPAuthorizationCredentials = Depends(security)
    ) -> Optional[Dict[str, Any]]:
        """
        Опциональная авторизация
        
        Возвращает данные пользователя или None если не авторизован
        """
        token = CoreAuthDependencies.get_token_from_request(request)
        
        if not token:
            return None
        
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            user_id: int = payload.get("sub")
            if user_id is None:
                return None
        except JWTError:
            return None
        
        log = request.app.state.log if hasattr(request.app.state, 'log') else None
        user = await CoreAuthService.get_user_by_id(int(user_id), log=log)
        return user


# Для обратной совместимости с существующим кодом
create_access_token = CoreAuthDependencies.create_access_token
get_token_from_request = CoreAuthDependencies.get_token_from_request
get_current_user = CoreAuthDependencies.get_current_user
get_current_user_optional = CoreAuthDependencies.get_current_user_optional