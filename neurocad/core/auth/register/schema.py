# app/core/auth/register/schema.py

from pydantic import BaseModel, Field, EmailStr
from typing import Optional


class CoreAuthRegisterRequestSchema(BaseModel):
    """Запрос на регистрацию"""
    login: str = Field(..., min_length=3, max_length=100, description="Логин")
    password: str = Field(..., min_length=6, description="Пароль (минимум 6 символов)")
    password_confirm: str = Field(..., min_length=6, description="Подтверждение пароля")
    name: Optional[str] = Field(None, max_length=200, description="Полное имя")
    email: Optional[EmailStr] = Field(None, description="Email")