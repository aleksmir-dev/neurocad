# neurocad/core/models/page_pres.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, DateTime, Index
from datetime import datetime as dt
from typing import Optional
from .base import Base


class PagePres(Base):
    """
    Глобальный пресет (шаблон страницы).

    Используется в LLM-редакторе (левая панель) — библиотека готовых
    шаблонов. Не привязан к конкретной странице.
    """
    __tablename__ = "page_pres"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)

    # HTML пресета (текущее состояние)
    html: Mapped[Optional[str]] = mapped_column(Text)

    # Путь к PNG-превью относительно media/
    # например: "presets/1.png"
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(500))

    is_delete: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)
    updated_at: Mapped[dt] = mapped_column(DateTime, default=dt.now, onupdate=dt.now)

    __table_args__ = (
        Index('idx_page_pres_is_delete', 'is_delete'),
        Index('idx_page_pres_created_at', 'created_at'),
    )