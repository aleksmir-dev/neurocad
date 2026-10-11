# neurocad/core/models/placement_stat.py

"""
PlacementStat — статистика размещения по дням.

Одна запись = один день одного размещения. Счётчики
инкрементируются при хите через /api/track/hit.

Отчёты:
  - за день  — WHERE date = ...
  - за месяц — SUM(...) GROUP BY ... WHERE date BETWEEN ...
  - за год   — то же, шире диапазон.
"""

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, DateTime, ForeignKey, Index
from datetime import datetime as dt
from datetime import date as date_type
from .base import Base


class PlacementStat(Base):
    __tablename__ = "placement_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    placement_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("placements.id"),
        nullable=False,
    )
    date: Mapped[date_type] = mapped_column(
        DateTime,  # SQLite хранит как TEXT/ISO
        nullable=False,
    )

    shows: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    target_actions: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)
    updated_at: Mapped[dt] = mapped_column(
        DateTime, default=dt.now, onupdate=dt.now
    )

    __table_args__ = (
        Index('idx_stat_placement_date', 'placement_id', 'date', unique=True),
        Index('idx_stat_date', 'date'),
    )