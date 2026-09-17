# app/core/auth/restore/schema.py

from pydantic import BaseModel, Field, EmailStr


class CoreAuthRestoreRequestSchema(BaseModel):
    """Запрос на восстановление пароля"""
    login_or_email: str = Field(..., min_length=1, max_length=100, description="Логин или email")


class CoreAuthRestoreConfirmRequestSchema(BaseModel):
    """Запрос на подтверждение восстановления пароля"""
    token: str = Field(..., min_length=1, description="Токен сброса пароля")
    new_password: str = Field(..., min_length=6, description="Новый пароль (минимум 6 символов)")
    new_password_confirm: str = Field(..., min_length=6, description="Подтверждение нового пароля")