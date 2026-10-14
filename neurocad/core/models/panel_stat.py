# app/core/models/panel_stat.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, DateTime, ForeignKey, Index, Text
from datetime import datetime as dt
from typing import Optional
from .base import Base


class PanelStat(Base):
    """Point-in-time metrics log for the admin panel.

    NOT a system backup. This is a log of panel subsystem statuses
    at a given moment, kept for audit and historical analysis.

    Rows are written:
      - once an hour by a cron-driven task (trigger="hourly");
      - when the user opens the panel (trigger="open");
      - when the user presses "Refresh" (trigger="refresh");
      - manually, from the UI, for debugging (trigger="manual").

    The `data` field stores both the subsystem statuses and the
    thresholds that were active at that moment — otherwise a later
    threshold change would make old rows unexplainable.
    """
    __tablename__ = "panel_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    taken_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)

    # "hourly" / "open" / "refresh" / "manual".
    # A string, not an enum: SQLite has no native enum, and adding
    # a new trigger type later should not require a migration.
    trigger: Mapped[str] = mapped_column(String(16), nullable=False)

    # Who triggered. NULL for "hourly" — no user did it, cron did.
    # ondelete='SET NULL' — the audit row survives user deletion.
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True,
    )

    # JSON: {"subsystems": [...], "thresholds": [...]}.
    # Text, not JSON type — SQLite has no native JSON column.
    data: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        Index('idx_panel_stats_taken_at', 'taken_at'),
        Index('idx_panel_stats_trigger', 'trigger'),
    )