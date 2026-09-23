# app/core/models/pages.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, DateTime, Index, ForeignKey
from datetime import datetime as dt
from typing import Optional
from .base import Base


class Page(Base):
    __tablename__ = "pages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Module this page belongs to.
    # Each module = a site (e.g. "aleksmir.ru", "site01.ru", "pages").
    # Index is defined in __table_args__ (idx_pages_mod_id).
    mod_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("modules.id"),
        nullable=False,
        default=1,
    )

    datetime: Mapped[dt] = mapped_column(DateTime, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    logo: Mapped[Optional[str]] = mapped_column(Text)

    # HTML for display
    content: Mapped[Optional[str]] = mapped_column(Text)

    # GrapesJS JSON for editor
    content_json: Mapped[Optional[str]] = mapped_column(Text)

    # ===== Template system =====
    # is_template = True → this page can be used as a base template
    #   by other pages (shown in "Наследовать от" dropdown).
    # template_id = None → standalone page (renders its own content).
    # template_id = <id> → inherits layout from that template page;
    #   its own `content` is inserted into the [data-slot="content"] slot.
    is_template: Mapped[int] = mapped_column(Integer, default=0)
    template_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("pages.id"),
        nullable=True,
        default=None,
    )

    is_active: Mapped[int] = mapped_column(Integer, default=1)
    is_delete: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)
    updated_at: Mapped[dt] = mapped_column(DateTime, default=dt.now, onupdate=dt.now)
    rss_yandex_id: Mapped[Optional[str]] = mapped_column(String(64), default=None)

    __table_args__ = (
        Index('idx_pages_mod_id', 'mod_id'),
        Index('idx_pages_mod_datetime', 'mod_id', 'datetime'),
        Index('idx_pages_datetime', 'datetime'),
        Index('idx_pages_is_delete', 'is_delete'),
        Index('idx_pages_is_active', 'is_active'),
        Index('idx_pages_rss_yandex_id', 'rss_yandex_id'),
        Index('idx_pages_is_template', 'is_template'),
        Index('idx_pages_template_id', 'template_id'),
    )