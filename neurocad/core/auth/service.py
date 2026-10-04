# app/core/auth/service.py

from sqlalchemy import select, or_
from datetime import datetime
from typing import Optional, Dict, Any

from ...utils.sqlite import get_db_sqlite
from ...utils.hash import get_hash_string
from ..models.base import User


def shorten_name(full_name: str) -> str:
    """Convert 'Иванов Иван Иванович' to 'Иванов И.И.'."""
    if not full_name:
        return full_name

    parts = full_name.strip().split()
    if len(parts) >= 2:
        surname = parts[0]
        initials = ''.join([f"{part[0]}." for part in parts[1:]])
        return f"{surname} {initials}"
    return full_name


def serialize_datetime(value):
    """Convert a datetime to an ISO string."""
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def serialize_user(user) -> Dict[str, Any]:
    """Serialize a User object into a dict, converting datetimes."""
    return {
        "id": user.id,
        "login": user.login,
        "name": user.name,
        "email": user.email,
        "password": user.password,
        "is_superadmin": user.is_superadmin,
        "is_active": user.is_active,
        "is_delete": user.is_delete,
        "last_seen": serialize_datetime(user.last_seen),
        "created_at": serialize_datetime(user.created_at),
        "domain": getattr(user, "domain", None),
    }


class CoreAuthService:
    """Shared helpers for working with users."""

    # ============================================
    # READ
    # ============================================

    @staticmethod
    async def get_user_by_id(user_id: int, log=None) -> Optional[Dict[str, Any]]:
        """Fetch a user by id."""
        if log:
            await log.log_info(target="auth", message=f"get_user_by_id: user_id={user_id}")

        async for session in get_db_sqlite():
            stmt = select(User).where(User.id == user_id, User.is_delete == False)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()

            if user is None:
                if log:
                    await log.log_warning(target="auth", message=f"User {user_id} not found")
                return None

            return serialize_user(user)

    @staticmethod
    async def find_user_by_login_or_email(value: str, log=None) -> Optional[Dict[str, Any]]:
        """Find a user by login or by email."""
        if log:
            await log.log_info(target="auth", message=f"find_user_by_login_or_email: {value}")

        async for session in get_db_sqlite():
            stmt = select(User).where(
                or_(User.login == value, User.email == value),
                User.is_delete == False
            )
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()

            if user is None:
                return None

            return serialize_user(user)

    # ============================================
    # LOGIN / SLUG AVAILABILITY
    # ============================================

    @staticmethod
    async def is_login_taken(login: str, log=None) -> bool:
        """
        True if a user with this login already exists (lower-cased).

        Comparison is done on the normalized login, so "User1" and
        "user1" collide. is_delete=True users are ignored — a login
        released by an admin is free again.
        """
        from .validators import normalize_login

        normalized = normalize_login(login)
        if not normalized:
            return False

        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.login == normalized,
                User.is_delete == False,
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none() is not None
        return False

    @staticmethod
    async def is_slug_taken(slug: str, log=None) -> bool:
        """
        True if any existing user login slugifies to this slug.

        Two logins with different spellings can produce the same
        slug (e.g. "andrey_k" and "andrey-k"). Since the subdomain
        is built from the slug, only one of them can be registered.
        """
        from .validators import slugify_login

        s = (slug or "").strip()
        if not s:
            return False

        async for session in get_db_sqlite():
            stmt = select(User.login).where(User.is_delete == False)
            result = await session.execute(stmt)
            for (login,) in result.all():
                if slugify_login(login) == s:
                    return True
        return False

    # ============================================
    # UPDATE
    # ============================================

    @staticmethod
    async def update_user(user_id: int, log=None, **kwargs) -> Optional[Dict[str, Any]]:
        """Update user fields."""
        if log:
            await log.log_info(target="auth", message=f"update_user: user_id={user_id}, fields={list(kwargs.keys())}")

        async for session in get_db_sqlite():
            stmt = select(User).where(User.id == user_id)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()

            if user is None:
                if log:
                    await log.log_warning(target="auth", message=f"User {user_id} not found")
                return None

            for key, value in kwargs.items():
                if hasattr(user, key) and value is not None:
                    setattr(user, key, value)

            await session.commit()
            await session.refresh(user)

            if log:
                await log.log_info(target="auth", message=f"User {user_id} updated")
            return serialize_user(user)

    # ============================================
    # CREATE
    # ============================================

    @staticmethod
    async def create_user(login: str, password: str, name: Optional[str] = None,
                          email: Optional[str] = None, is_superadmin: bool = False,
                          log=None) -> Optional[Dict[str, Any]]:
        """Create a new user."""
        if log:
            await log.log_info(target="auth", message=f"create_user: login={login}")

        hashed_password = get_hash_string(password)

        async for session in get_db_sqlite():
            # Check whether the user already exists.
            stmt = select(User).where(User.login == login)
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()

            if existing:
                if log:
                    await log.log_warning(target="auth", message=f"User {login} already exists")
                return None

            new_user = User(
                login=login,
                password=hashed_password,
                name=name or login,
                email=email,
                is_superadmin=is_superadmin,
                is_active=True,
                is_delete=False,
                created_at=datetime.now()
            )
            session.add(new_user)
            await session.commit()
            await session.refresh(new_user)

            if log:
                await log.log_info(target="auth", message=f"User {login} created with id={new_user.id}")
            return serialize_user(new_user)