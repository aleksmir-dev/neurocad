# app/core/models/user.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Index, Text
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

    # robots.txt для домена 3 уровня (<login>.<APP_DOMAIN>).
    #
    # NULL — пользователь никогда не открывал модалку robots.txt
    # для поддомена. В этом случае /robots.txt на поддомене
    # отдаёт ROBOTS_CLOSED (закрыто от всех) — дефолт для новых
    # пользователей.
    #
    # Автоматически управляется в service.py:
    #   - add_custom   → robots_3 = ROBOTS_CLOSED (поддомен закрыт,
    #                    пока активен кастомный домен);
    #   - remove_custom → robots_3 = ROBOTS_OPEN (поддомен снова
    #                     открыт после отключения кастомного).
    #
    # Text, а не String(N): содержимое robots.txt может быть
    # длинным (Allow/Disallow/Crawl-delay/Sitemap на много строк),
    # ограничения по длине здесь ставить не нужно.
    robots_3: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # robots.txt для домена 2 уровня (кастомного).
    #
    # NULL — пользователь никогда не открывал модалку robots.txt
    # для кастомного домена. В этом случае /robots.txt на
    # кастомном домене отдаёт ROBOTS_CLOSED (закрыто от всех).
    #
    # Редактируется пользователем через модальное окно в
    # Профиль → Домены → «Редактировать robots.txt». Значение
    # сохраняется в БД вербатим (включая пустую строку) — бэкенд
    # не парсит и не валидирует синтаксис robots.txt.
    #
    # При подключении кастомного домена (add_custom) это поле
    # инициализируется ROBOTS_OPEN, если было NULL. При отключении
    # (remove_custom) не трогается — текст сохраняется на случай
    # повторного подключения.
    robots_2: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index('idx_users_login', 'login'),
        Index('idx_users_is_delete', 'is_delete'),
    )