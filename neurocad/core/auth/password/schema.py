# app/core/auth/password/schema.py

from pydantic import BaseModel, Field


class CoreAuthPasswordChangeRequestSchema(BaseModel):
    """Запрос на смену пароля"""
    current_password: str = Field(..., min_length=1, description="Текущий пароль")
    new_password: str = Field(..., min_length=6, description="Новый пароль (минимум 6 символов)")
    new_password_confirm: str = Field(..., min_length=6, description="Подтверждение нового пароля")