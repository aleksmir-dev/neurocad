# neurocad/core/models/botinv_item.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, Index, UniqueConstraint
from datetime import datetime as dt
from typing import Optional
from .base import Base


class BotInvItem(Base):
    """
    One inventory position (позиция ведомости).

    One row per unique inv_num within a sheet — uniqueness is
    enforced on the NORMALIZED number (inv_num_norm), not on the
    raw string. This means "ЧФ 0123" and "чф 0123" cannot both
    appear in the same sheet: they collapse to one row.

    inv_num      — the number exactly as it appeared in the Excel
                   file (with original case). This is what gets
                   displayed in the UI and in the exported file.
    inv_num_norm — inv_num.upper(). Used ONLY for lookups and for
                   the unique constraint. Never shown to the user.

    Why a separate column instead of UPPER() in the WHERE clause:
    SQLite's UPPER() is not indexable, so a lookup on
    `UPPER(inv_num) = UPPER(?)` would be a full table scan. With
    a dedicated indexed column the lookup is O(log n).

    room_before — "Кабинет до", from Excel, never changes.
    room_after  — "Кабинет после", first find, never changes afterwards.
    note        — cumulative free-form text (duplicates + finds).
    found       — 1 if the item has been found at least once.
    """
    __tablename__ = "botinv_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    sheet_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("botinv_sheets.id"),
        nullable=False,
    )

    # Raw number as it appeared in the file.
    inv_num: Mapped[str] = mapped_column(String(64), nullable=False)

    # Normalized (upper) — used for lookups and for uniqueness.
    # Never returned to the frontend.
    inv_num_norm: Mapped[str] = mapped_column(String(64), nullable=False)

    name: Mapped[str] = mapped_column(String(512), nullable=False)

    room_before: Mapped[Optional[str]] = mapped_column(String(64))
    room_after: Mapped[Optional[str]] = mapped_column(String(64))

    found: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    note: Mapped[Optional[str]] = mapped_column(Text)
    marked_at: Mapped[Optional[dt]] = mapped_column(DateTime)

    __table_args__ = (
        UniqueConstraint(
            "sheet_id", "inv_num_norm",
            name="uq_botinv_sheet_invnum_norm",
        ),
        Index('idx_botinv_items_sheet_id', 'sheet_id'),
        Index('idx_botinv_items_inv_num', 'inv_num'),
        Index('idx_botinv_items_inv_num_norm', 'inv_num_norm'),
        Index('idx_botinv_items_room_before', 'room_before'),
    )