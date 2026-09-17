# app/core/auth/profile/schema.py

from pydantic import BaseModel, Field, EmailStr
from typing import Optional


class CoreAuthProfileUpdateRequestSchema(BaseModel):
    """Запрос на обновление профиля"""
    name: Optional[str] = Field(None, max_length=200, description="Полное имя")
    email: Optional[EmailStr] = Field(None, description="Email")