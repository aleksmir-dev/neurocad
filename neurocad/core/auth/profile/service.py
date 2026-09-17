# app/core/auth/profile/service.py

from typing import Optional, Dict, Any

from ..service import CoreAuthService


class CoreAuthProfileService:
    """Сервис для работы с профилем пользователя"""

    @staticmethod
    async def get_profile(user_id: int, log=None) -> Optional[Dict[str, Any]]:
        """Получение профиля пользователя"""
        if log:
            await log.log_info(target="auth", message=f"get_profile called for user_id: {user_id}")
        return await CoreAuthService.get_user_by_id(user_id, log=log)

    @staticmethod
    async def update_profile(
        user_id: int,
        name: Optional[str] = None,
        email: Optional[str] = None,
        log=None
    ) -> Dict[str, Any]:
        """
        Обновление профиля пользователя
        
        Returns:
            Dict с ключами:
            - success: bool
            - message: str
            - data: dict с обновлёнными данными (при успехе)
        """
        if log:
            await log.log_info(target="auth", message=f"update_profile called for user_id: {user_id}")

        # Проверяем email на уникальность, если он указан
        if email:
            existing = await CoreAuthService.find_user_by_login_or_email(email, log=log)
            if existing and existing["id"] != user_id:
                if log:
                    await log.log_warning(target="auth", message=f"Email {email} already exists for another user")
                return {
                    "success": False,
                    "message": "Пользователь с таким email уже существует"
                }

        # Обновляем данные
        update_data = {}
        if name is not None:
            update_data["name"] = name
        if email is not None:
            update_data["email"] = email

        if not update_data:
            return {
                "success": False,
                "message": "Нет данных для обновления"
            }

        user = await CoreAuthService.update_user(user_id, log=log, **update_data)

        if not user:
            return {
                "success": False,
                "message": "Ошибка при обновлении профиля"
            }

        if log:
            await log.log_info(target="auth", message=f"Profile updated for user_id: {user_id}")
        return {
            "success": True,
            "message": "Профиль успешно обновлён",
            "data": {
                "id": user["id"],
                "login": user["login"],
                "name": user["name"],
                "email": user["email"],
                "is_superadmin": user["is_superadmin"],
                "is_active": user["is_active"],
                "last_seen": user.get("last_seen"),
                "created_at": user.get("created_at")
            }
        }