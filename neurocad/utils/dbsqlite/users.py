# neurocad/utils/dbsqlite/users.py

"""
Default user bootstrap for SQLite.

Creates the superadmin and the test user on startup. Both are
idempotent: if the user already exists, nothing is created (the
superadmin is promoted if needed).

Used by utils/sqlite.py → init_sqlite().
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.models.base import User
from ...utils.hash import get_hash_string
from ...utils.log import Log
from ...config import settings


async def ensure_user(
    session: AsyncSession,
    login: str,
    password: str,
    name: str,
    is_superadmin: bool = False,
    log: Log | None = None,
) -> User:
    """
    Check whether a user with this login exists.
    If not — create it. If yes — promote to superadmin if needed.
    """
    stmt = select(User).where(User.login == login)
    result = await session.execute(stmt)
    existing_user = result.scalar_one_or_none()

    if existing_user:
        if is_superadmin and not existing_user.is_superadmin:
            existing_user.is_superadmin = True
            await session.commit()
            if log:
                log.log_info_sync(
                    target="sqlite-users",
                    message=f"Пользователь '{login}' повышен до суперадмина",
                )
        else:
            if log:
                log.log_info_sync(
                    target="sqlite-users",
                    message=f"Пользователь уже существует: {login}",
                )
        return existing_user

    # Create new user
    hashed_password = get_hash_string(password)
    new_user = User(
        login=login,
        password=hashed_password,
        name=name,
        is_superadmin=is_superadmin,
        is_active=True,
        is_delete=False,
    )
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    if log:
        log.log_info_sync(
            target="sqlite-users",
            message=f"Создан пользователь: {login} (суперадмин={is_superadmin})",
        )

    return new_user


async def ensure_default_users(session: AsyncSession, log: Log | None = None) -> None:
    """
    Ensure the admin and test users exist.

    Both logins and passwords are taken from settings (config.py /
    .env). Defaults are "admin"/"admin" and "test"/"test".
    """
    # 1. Superadmin
    await ensure_user(
        session,
        login=settings.SUPERADMIN_LOGIN,
        password=settings.SUPERADMIN_PASSWORD,
        name="Админ",
        is_superadmin=True,
        log=log,
    )

    # 2. Test user (regular, not superadmin)
    await ensure_user(
        session,
        login=settings.TEST_LOGIN,
        password=settings.TEST_PASSWORD,
        name="Тестовый пользователь",
        is_superadmin=False,
        log=log,
    )