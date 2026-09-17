# app/core/auth/register/service.py

from datetime import datetime
from typing import Optional, Dict, Any

from sqlalchemy import select

from ...models.base import User
from ..service import CoreAuthService, serialize_datetime
from ....utils.sqlite import get_db_sqlite
from ....utils.hash import get_hash_string


class CoreAuthRegisterService:
    """Сервис для регистрации пользователей"""

    @staticmethod
    async def register_user(
        login: str,
        password: str,
        password_confirm: str,
        name: Optional[str] = None,
        email: Optional[str] = None,
        log=None
    ) -> Dict[str, Any]:
        """
        Регистрация нового пользователя
        
        Returns:
            Dict с ключами:
            - success: bool
            - message: str
            - data: dict с данными пользователя (при успехе)
        """
        if log:
            await log.log_info(target="auth", message=f"register_user called for login: {login}")

        # Проверяем, существует ли пользователь
        existing = await CoreAuthService.find_user_by_login_or_email(login, log=log)
        if existing:
            if log:
                await log.log_warning(target="auth", message=f"User {login} already exists")
            return {
                "success": False,
                "message": "Пользователь с таким логином уже существует"
            }

        # Проверяем email, если указан
        if email:
            existing_email = await CoreAuthService.find_user_by_login_or_email(email, log=log)
            if existing_email:
                if log:
                    await log.log_warning(target="auth", message=f"Email {email} already exists")
                return {
                    "success": False,
                    "message": "Пользователь с таким email уже существует"
                }

        # Проверяем пароль
        if password != password_confirm:
            return {
                "success": False,
                "message": "Пароли не совпадают"
            }

        if len(password) < 6:
            return {
                "success": False,
                "message": "Пароль должен содержать минимум 6 символов"
            }

        # Создаём пользователя
        user = await CoreAuthService.create_user(
            login=login,
            password=password,
            name=name or login,
            email=email,
            is_superadmin=False,
            log=log
        )

        if not user:
            return {
                "success": False,
                "message": "Ошибка при создании пользователя"
            }

        if log:
            await log.log_info(target="auth", message=f"User {login} registered successfully with id={user['id']}")
        
        return {
            "success": True,
            "message": "Регистрация успешна",
            "data": {
                "id": user["id"],
                "login": user["login"],
                "name": user["name"],
                "email": user["email"],
                "is_superadmin": user["is_superadmin"],
                "created_at": user["created_at"]  # Уже строка из serialize_user
            }
        }