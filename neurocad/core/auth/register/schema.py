# app/core/auth/register/schema.py

from pydantic import BaseModel, Field, EmailStr
from typing import Optional


class CoreAuthRegisterRequestSchema(BaseModel):
    """
    Запрос на регистрацию.

    Логин: от 8 символов, начинается с буквы, содержит только
    латиницу, цифры, дефис и подчёркивание. Ограничение длины
    одновременно резервирует все системные имена (www, api, dev,
    admin, ...) — они короче 8 символов и не могут быть заняты
    пользователем.
    """
    login: str = Field(
        ...,
        min_length=8,
        max_length=64,
        pattern=r"^[a-zA-Z][a-zA-Z0-9_-]*$",
        description="Логин: латиница, цифры, дефис, подчёркивание; от 8 символов",
    )
    password: str = Field(
        ...,
        min_length=8,
        description="Пароль (минимум 8 символов)",
    )
    password_confirm: str = Field(
        ...,
        min_length=8,
        description="Подтверждение пароля",
    )
    name: Optional[str] = Field(
        None,
        max_length=200,
        description="Полное имя",
    )
    email: Optional[EmailStr] = Field(
        None,
        description="Email",
    )