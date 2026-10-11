# neurocad/core/models/placement.py

"""
Placement — размещение креатива на конкретной странице.

Креатив — один, страниц — много. Каждое размещение — отдельная
строка. Живёт постоянно, пока не удалено; не надо
переразмещать каждый месяц.

date_start / date_end — опциональные даты начала и конца
показа. Если не нужны — можно не заполнять (NULL).
"""

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, DateTime, ForeignKey, Index
from datetime import datetime as dt
from typing import Optional
from .base import Base


class Placement(Base):
    __tablename__ = "placements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    creative_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("creatives.id"),
        nullable=False,
    )
    page_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("pages.id"),
        nullable=False,
    )

    date_start: Mapped[Optional[dt]] = mapped_column(
        DateTime, nullable=True
    )
    date_end: Mapped[Optional[dt]] = mapped_column(
        DateTime, nullable=True
    )

    is_active: Mapped[int] = mapped_column(Integer, default=1)
    is_delete: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)
    updated_at: Mapped[dt] = mapped_column(
        DateTime, default=dt.now, onupdate=dt.now
    )

    __table_args__ = (
        Index('idx_placements_creative_id', 'creative_id'),
        Index('idx_placements_page_id', 'page_id'),
        Index('idx_placements_is_delete', 'is_delete'),
    )