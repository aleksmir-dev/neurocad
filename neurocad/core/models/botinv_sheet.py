# neurocad/core/models/botinv_sheet.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Date, Integer, DateTime, ForeignKey, Index
from datetime import datetime as dt, date
from typing import Optional
from .base import Base


class BotInvSheet(Base):
    """
    Inventory sheet (ведомость).

    One sheet = one Excel upload. Immutable after import.
    Bot works with the active sheet for a given nav_id.
    """
    __tablename__ = "botinv_sheets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    nav_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("nav.id"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    batch_date: Mapped[date] = mapped_column(Date, nullable=False)
    source_file: Mapped[Optional[str]] = mapped_column(String(255))

    is_active: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_delete: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    items_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    marked_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[dt] = mapped_column(DateTime, nullable=False, default=dt.now)
    updated_at: Mapped[dt] = mapped_column(
        DateTime, nullable=False, default=dt.now, onupdate=dt.now
    )

    __table_args__ = (
        Index('idx_botinv_sheets_nav_id', 'nav_id'),
        Index('idx_botinv_sheets_is_active', 'is_active'),
        Index('idx_botinv_sheets_is_delete', 'is_delete'),
    )