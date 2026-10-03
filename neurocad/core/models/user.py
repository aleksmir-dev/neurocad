# app/core/models/user.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Index
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

    # Главная страница пользователя.
    #
    # Используется, когда пользователь заходит на свой поддомен
    # (<login>.<APP_DOMAIN>) или на свой кастомный домен БЕЗ пути —
    # например, https://testuser3.neurocad-dev.ru/ .
    # В этом случае middleware резолвит этот id и редиректит на
    # публичную страницу (/page/<nav_id>/<date>/<time>).
    #
    # NULL — главная не задана. Тогда показывается первая страница
    # nav'а по datetime ASC; если и её нет — редирект на
    # /core/engine/pages (каталог статей).
    #
    # ondelete='SET NULL' — если страницу удалят, поле обнулится
    # само, пользователь не останется с висящей ссылкой.
    home_page_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey('pages.id', ondelete='SET NULL'),
        nullable=True,
    )

    __table_args__ = (
        Index('idx_users_login', 'login'),
        Index('idx_users_is_delete', 'is_delete'),
    )