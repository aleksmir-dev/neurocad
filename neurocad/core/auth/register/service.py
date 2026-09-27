# app/core/auth/register/service.py

from datetime import datetime
from typing import Optional, Dict, Any

from sqlalchemy import select

from ...models.base import User, Module, Nav
from ..service import CoreAuthService, serialize_datetime
from ....utils.sqlite import get_db_sqlite
from ....utils.hash import get_hash_string
from ....config import settings


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

        # ===== Auto-create personal Nav for the new user =====
        #
        # When USER_AUTO_CREATE_NAV is True, every new user gets
        # their own "Каталог статей" nav entry pointing at the
        # built-in 'default' module. This is the object that owns
        # their pages; without it, the user would have no place
        # to create content.
        #
        # Non-fatal: if the nav cannot be created (e.g. module
        # missing), the user is still registered — we just log
        # a warning. Failing hard here would block registration
        # for a purely cosmetic reason.
        if getattr(settings, "USER_AUTO_CREATE_NAV", False):
            try:
                async for session in get_db_sqlite():
                    # Find the 'default' module by name (not by id —
                    # the id is an implementation detail and may differ
                    # between installations).
                    mod_stmt = select(Module).where(
                        Module.name == "default",
                        Module.is_delete == False,
                    )
                    default_mod = (await session.execute(mod_stmt)).scalar_one_or_none()

                    if default_mod is None:
                        if log:
                            await log.log_warning(
                                target="auth",
                                message=(
                                    "USER_AUTO_CREATE_NAV is on, but module "
                                    "'default' not found — nav not created"
                                ),
                            )
                    else:
                        nav = Nav(
                            user_id=user["id"],
                            parent_id=None,
                            card_type="link",
                            sort_order=1,
                            name="Каталог статей",
                            description=None,
                            icon=None,
                            module_id=default_mod.id,
                            is_delete=False,
                        )
                        session.add(nav)
                        await session.commit()

                        if log:
                            await log.log_info(
                                target="auth",
                                message=(
                                    f"Auto-created nav id={nav.id} "
                                    f"for user id={user['id']} "
                                    f"(module 'default', id={default_mod.id})"
                                ),
                            )
            except Exception as e:
                if log:
                    await log.log_warning(
                        target="auth",
                        message=f"Failed to auto-create nav for user {user['id']}: {e}",
                    )

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