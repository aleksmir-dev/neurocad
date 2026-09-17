# app/core/auth/service.py

from sqlalchemy import select, or_
from datetime import datetime
from typing import Optional, Dict, Any

from ...utils.sqlite import get_db_sqlite
from ...utils.hash import get_hash_string
from ..models.base import User


def shorten_name(full_name: str) -> str:
    """Преобразует 'Иванов Иван Иванович' в 'Иванов И.И.'"""
    if not full_name:
        return full_name
    
    parts = full_name.strip().split()
    if len(parts) >= 2:
        surname = parts[0]
        initials = ''.join([f"{part[0]}." for part in parts[1:]])
        return f"{surname} {initials}"
    return full_name


def serialize_datetime(value):
    """Преобразует datetime в строку ISO format"""
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def serialize_user(user) -> Dict[str, Any]:
    """Сериализует объект User в dict с преобразованием datetime"""
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
        "created_at": serialize_datetime(user.created_at)
    }


class CoreAuthService:
    """Общие методы для работы с пользователями"""
    
    @staticmethod
    async def get_user_by_id(user_id: int, log=None) -> Optional[Dict[str, Any]]:
        """Получение пользователя по ID"""
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
        """Поиск пользователя по логину или email"""
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
    
    @staticmethod
    async def update_user(user_id: int, log=None, **kwargs) -> Optional[Dict[str, Any]]:
        """Обновление данных пользователя"""
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
    
    @staticmethod
    async def create_user(login: str, password: str, name: Optional[str] = None, 
                          email: Optional[str] = None, is_superadmin: bool = False,
                          log=None) -> Optional[Dict[str, Any]]:
        """Создание нового пользователя"""
        if log:
            await log.log_info(target="auth", message=f"create_user: login={login}")
        
        hashed_password = get_hash_string(password)
        
        async for session in get_db_sqlite():
            # Проверяем существование
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