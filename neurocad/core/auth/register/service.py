# app/core/auth/register/service.py

from datetime import datetime
from typing import Optional, Dict, Any

from sqlalchemy import select

from ...models.base import User, Module, Nav
from ..service import CoreAuthService, serialize_datetime
from ..validators import (
    validate_login,
    normalize_login,
    slugify_login,
)
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
        Регистрация нового пользователя.

        Порядок проверок:
          1. Формат логина (длина >= 8, разрешённые символы).
          2. Логин уже занят (точное совпадение в users.login).
          3. Slug уже занят (другой логин даёт тот же поддомен).
          4. Email уже занят.
          5. Пароли совпадают, длина пароля >= 8.
          6. Создание пользователя + auto-create nav.

        Returns:
            Dict с ключами:
            - success: bool
            - message: str
            - data: dict с данными пользователя (при успехе)
        """
        if log:
            await log.log_info(target="auth", message=f"register_user called for login: {login}")

        # ---- 1. Формат логина ----
        err = validate_login(login)
        if err:
            if log:
                await log.log_warning(target="auth", message=f"Invalid login {login!r}: {err}")
            return {
                "success": False,
                "message": err
            }

        normalized_login = normalize_login(login)
        slug = slugify_login(normalized_login)

        # ---- 2. Логин занят ----
        if await CoreAuthService.is_login_taken(normalized_login, log=log):
            if log:
                await log.log_warning(target="auth", message=f"Login {normalized_login} already exists")
            return {
                "success": False,
                "message": "Этот логин уже занят"
            }

        # ---- 3. Slug занят (другой логин → тот же поддомен) ----
        if await CoreAuthService.is_slug_taken(slug, log=log):
            if log:
                await log.log_warning(
                    target="auth",
                    message=f"Slug {slug!r} for login {normalized_login!r} already used"
                )
            return {
                "success": False,
                "message": "Этот логин уже занят"
            }

        # ---- 4. Email занят ----
        if email:
            existing_email = await CoreAuthService.find_user_by_login_or_email(email, log=log)
            if existing_email:
                if log:
                    await log.log_warning(target="auth", message=f"Email {email} already exists")
                return {
                    "success": False,
                    "message": "Пользователь с таким email уже существует"
                }

        # ---- 5. Пароли ----
        if password != password_confirm:
            return {
                "success": False,
                "message": "Пароли не совпадают"
            }

        if len(password) < 8:
            return {
                "success": False,
                "message": "Пароль должен содержать минимум 8 символов"
            }

        # ---- 6. Создание пользователя ----
        user = await CoreAuthService.create_user(
            login=normalized_login,
            password=password,
            name=name or normalized_login,
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