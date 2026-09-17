# app/core/auth/password/service.py

from typing import Dict, Any

from sqlalchemy import select

from ...models.base import User
from ..service import CoreAuthService
from ....utils.sqlite import get_db_sqlite
from ....utils.hash import get_hash_string


class CoreAuthPasswordService:
    """Сервис для работы с паролями"""

    @staticmethod
    async def change_password(
        user_id: int,
        current_password: str,
        new_password: str,
        new_password_confirm: str,
        log=None
    ) -> Dict[str, Any]:
        """
        Смена пароля пользователя
        
        Returns:
            Dict с ключами:
            - success: bool
            - message: str
        """
        if log:
            await log.log_info(target="auth", message=f"change_password called for user_id: {user_id}")

        # Проверяем, существует ли пользователь
        user = await CoreAuthService.get_user_by_id(user_id, log=log)
        if not user:
            return {
                "success": False,
                "message": "Пользователь не найден"
            }

        # Проверяем текущий пароль
        hashed_current = get_hash_string(current_password)
        if user["password"] != hashed_current:
            if log:
                await log.log_warning(target="auth", message=f"Invalid current password for user_id: {user_id}")
            return {
                "success": False,
                "message": "Неверный текущий пароль"
            }

        # Проверяем новый пароль
        if new_password != new_password_confirm:
            return {
                "success": False,
                "message": "Пароли не совпадают"
            }

        if len(new_password) < 6:
            return {
                "success": False,
                "message": "Пароль должен содержать минимум 6 символов"
            }

        # Обновляем пароль
        hashed_new = get_hash_string(new_password)
        result = await CoreAuthService.update_user(user_id, log=log, password=hashed_new)

        if not result:
            return {
                "success": False,
                "message": "Ошибка при обновлении пароля"
            }

        if log:
            await log.log_info(target="auth", message=f"Password changed for user_id: {user_id}")
        return {
            "success": True,
            "message": "Пароль успешно изменён"
        }