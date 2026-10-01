# app/core/models/user.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Boolean, DateTime, Index
from datetime import datetime as dt
from typing import Optional
from .base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    login: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    password: Mapped[str] = mapped_column(String(256), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(128))
    email: Mapped[Optional[str]] = mapped_column(String(128))
    is_superadmin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_delete: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen: Mapped[Optional[dt]] = mapped_column(DateTime)
    created_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)

    # Домен второго уровня, подключённый пользователем (example.com).
    # NULL — пользователь не подключал кастомный домен.
    # Значение — FQDN в нижнем регистре. Без unique и index —
    # проверка уникальности не нужна, домен принадлежит конкретному
    # человеку и проверяется через DNS.
    domain: Mapped[Optional[str]] = mapped_column(String(253), nullable=True)

    __table_args__ = (
        Index('idx_users_login', 'login'),
        Index('idx_users_is_delete', 'is_delete'),
    )