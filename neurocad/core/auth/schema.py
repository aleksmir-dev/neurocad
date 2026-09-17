# app/core/auth/schema.py

from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime


class CoreAuthUserOutSchema(BaseModel):
    """Безопасный вывод данных пользователя"""
    id: int
    login: str
    name: Optional[str] = None
    email: Optional[str] = None
    is_superadmin: bool = False
    is_active: bool = True
    created_at: Optional[datetime] = None
    last_seen: Optional[datetime] = None

    class Config:
        from_attributes = True


class CoreAuthMessageSchema(BaseModel):
    """Стандартный ответ с сообщением"""
    success: bool
    message: str
    data: Optional[dict] = None


class CoreAuthTokenResponseSchema(BaseModel):
    """Ответ с токеном (если понадобится)"""
    access_token: str
    token_type: str = "bearer"