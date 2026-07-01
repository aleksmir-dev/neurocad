# app/core/auth/schema.py

from pydantic import BaseModel
from typing import Optional

class UserLogin(BaseModel):
    """Модель для входа"""
    login: str
    password: str

class Token(BaseModel):
    """Модель токена"""
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    """Модель пользователя (безопасный вывод)"""
    id: int
    login: str
    sign: Optional[str] = None
    is_delete: bool = False
