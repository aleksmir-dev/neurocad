# app/core/auth/restore/service.py

from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from sqlalchemy import select

from ...models.base import User
from ...models.base import PasswordReset
from ..service import CoreAuthService
from ..dependencies import CoreAuthDependencies
from ....utils.sqlite import get_db_sqlite
from ....utils.hash import get_hash_string


class CoreAuthRestoreService:
    """Сервис для восстановления пароля"""

    @staticmethod
    async def create_reset_token(login_or_email: str, log=None) -> Dict[str, Any]:
        """
        Создание токена для сброса пароля
        
        Returns:
            Dict с ключами:
            - success: bool
            - message: str
            - data: dict с токеном (при успехе)
        """
        if log:
            await log.log_info(target="auth", message=f"create_reset_token called for: {login_or_email}")

        # Находим пользователя
        user = await CoreAuthService.find_user_by_login_or_email(login_or_email, log=log)
        if not user:
            # Не раскрываем информацию о существовании пользователя
            if log:
                await log.log_info(target="auth", message=f"User not found for: {login_or_email}")
            return {
                "success": True,
                "message": "Если пользователь найден, инструкция отправлена на email"
            }

        # Создаём JWT токен для сброса
        reset_token = CoreAuthDependencies.create_access_token(
            data={"sub": str(user["id"]), "reset": True},
            expires_delta=timedelta(minutes=15)
        )

        # Сохраняем токен в БД
        await CoreAuthRestoreService._save_reset_token(user["id"], reset_token, log=log)

        if log:
            await log.log_info(target="auth", message=f"Reset token created for user_id: {user['id']}")
        
        # В реальном проекте здесь отправка email
        # А пока возвращаем токен для отладки
        return {
            "success": True,
            "message": "Инструкция отправлена на email",
            "data": {
                "token": reset_token  # В продакшене убрать!
            }
        }

    @staticmethod
    async def _save_reset_token(user_id: int, token: str, log=None) -> None:
        """Сохранение токена сброса пароля"""
        async for session in get_db_sqlite():
            # Удаляем старые токены для этого пользователя
            stmt = select(PasswordReset).where(PasswordReset.user_id == user_id)
            result = await session.execute(stmt)
            old_tokens = result.scalars().all()
            for t in old_tokens:
                await session.delete(t)
            
            # Создаём новый
            reset = PasswordReset(
                user_id=user_id,
                token=token,
                created_at=datetime.now()
            )
            session.add(reset)
            await session.commit()
            if log:
                await log.log_info(target="auth", message=f"Reset token saved for user_id: {user_id}")

    @staticmethod
    async def _verify_reset_token(token: str, log=None) -> Optional[int]:
        """Проверка токена сброса пароля"""
        async for session in get_db_sqlite():
            stmt = select(PasswordReset).where(PasswordReset.token == token)
            result = await session.execute(stmt)
            reset = result.scalar_one_or_none()
            
            if not reset:
                if log:
                    await log.log_warning(target="auth", message=f"Reset token not found: {token[:10]}...")
                return None
            
            # Проверяем срок действия (15 минут)
            if datetime.now() - reset.created_at > timedelta(minutes=15):
                if log:
                    await log.log_warning(target="auth", message=f"Reset token expired: {token[:10]}...")
                await session.delete(reset)
                await session.commit()
                return None
            
            return reset.user_id

    @staticmethod
    async def _invalidate_reset_token(token: str, log=None) -> None:
        """Удаление использованного токена"""
        async for session in get_db_sqlite():
            stmt = select(PasswordReset).where(PasswordReset.token == token)
            result = await session.execute(stmt)
            reset = result.scalar_one_or_none()
            if reset:
                await session.delete(reset)
                await session.commit()
                if log:
                    await log.log_info(target="auth", message=f"Reset token invalidated: {token[:10]}...")

    @staticmethod
    async def confirm_reset_password(
        token: str,
        new_password: str,
        new_password_confirm: str,
        log=None
    ) -> Dict[str, Any]:
        """
        Подтверждение сброса пароля
        
        Returns:
            Dict с ключами:
            - success: bool
            - message: str
        """
        if log:
            await log.log_info(target="auth", message="confirm_reset_password called")

        # Проверяем пароль
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

        # Проверяем токен
        user_id = await CoreAuthRestoreService._verify_reset_token(token, log=log)
        if not user_id:
            return {
                "success": False,
                "message": "Ссылка недействительна или истекла"
            }

        # Обновляем пароль
        hashed_password = get_hash_string(new_password)
        result = await CoreAuthService.update_user(user_id, log=log, password=hashed_password)

        if not result:
            return {
                "success": False,
                "message": "Ошибка при обновлении пароля"
            }

        # Удаляем использованный токен
        await CoreAuthRestoreService._invalidate_reset_token(token, log=log)

        if log:
            await log.log_info(target="auth", message=f"Password reset confirmed for user_id: {user_id}")
        return {
            "success": True,
            "message": "Пароль успешно изменён"
        }