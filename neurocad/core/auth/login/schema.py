# app/core/auth/login/schema.py

from pydantic import BaseModel, Field


class CoreAuthLoginRequestSchema(BaseModel):
    """Запрос на вход"""
    login: str = Field(..., min_length=1, max_length=100, description="Логин или email")
    password: str = Field(..., min_length=1, description="Пароль")