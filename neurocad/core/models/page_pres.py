# neurocad/core/models/page_pres.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, DateTime, Index
from datetime import datetime as dt
from typing import Optional
from .base import Base


class PagePres(Base):
    """
    Global preset (page template).

    Used in LLM editor (left panel) — a library of ready-made templates.
    Not tied to a specific page.
    """
    __tablename__ = "page_pres"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)

    # HTML of preset (current state)
    html: Mapped[Optional[str]] = mapped_column(Text)

    # CSS of preset (current state)
    css: Mapped[Optional[str]] = mapped_column(Text)

    # Path to PNG preview relative to media/
    # e.g. "presets/1.png"
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(500))

    is_delete: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)
    updated_at: Mapped[dt] = mapped_column(DateTime, default=dt.now, onupdate=dt.now)

    __table_args__ = (
        Index('idx_page_pres_is_delete', 'is_delete'),
        Index('idx_page_pres_created_at', 'created_at'),
    )