# app/core/auth/login/service.py

from datetime import datetime
from typing import Optional, Dict, Any

from sqlalchemy import select

from ..service import CoreAuthService, serialize_user
from ...models.base import User
from ....utils.sqlite import get_db_sqlite
from ....utils.hash import get_hash_string


class CoreAuthLoginService:
    """Сервис для аутентификации и входа"""

    @staticmethod
    async def authenticate_user(login: str, hashed_password: str, log=None) -> Optional[Dict[str, Any]]:
        """Аутентификация пользователя по логину и хэшу пароля"""
        if log:
            await log.log_info(target="auth", message=f"authenticate_user called for login: {login}")

        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.login == login,
                User.is_delete == False
            )
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()

            if user is None:
                if log:
                    await log.log_warning(target="auth", message=f"User not found for login: {login}")
                return None

            if user.password != hashed_password:
                if log:
                    await log.log_warning(target="auth", message=f"Invalid password for login: {login}")
                return None

            if log:
                await log.log_info(target="auth", message=f"User authenticated: id={user.id}, login={user.login}")

            # Обновляем время последнего визита
            user.last_seen = datetime.now()
            await session.commit()
            await session.refresh(user)

            return serialize_user(user)

    @staticmethod
    async def login(login: str, password: str, log=None) -> Optional[Dict[str, Any]]:
        """Вход с автоматическим хэшированием пароля"""
        if log:
            await log.log_info(target="auth", message=f"login called for: {login}")
        hashed_password = get_hash_string(password)
        return await CoreAuthLoginService.authenticate_user(login, hashed_password, log=log)

    @staticmethod
    async def update_last_seen(user_id: int, log=None) -> None:
        """Обновление времени последнего визита"""
        async for session in get_db_sqlite():
            stmt = select(User).where(User.id == user_id)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()

            if user:
                user.last_seen = datetime.now()
                await session.commit()
                if log:
                    await log.log_info(target="auth", message=f"Updated last_seen for user {user_id}")