# app/core/models/backup_run.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, DateTime, Index, Text
from datetime import datetime as dt
from typing import Optional
from .base import Base


class BackupRun(Base):
    """One backup run recorded by backup.sh.

    Each invocation of backup.sh (hourly / daily / weekly / monthly /
    yearly) posts its result here via POST /panel/backup/report.
    The panel reads the most recent successful run per level to
    decide whether backups are healthy.

    Rows are NOT a system backup themselves — they are audit records
    about backup runs.
    """
    __tablename__ = "backup_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Which backup level this run belongs to:
    #   "hourly" / "daily" / "weekly" / "monthly" / "yearly"
    level: Mapped[str] = mapped_column(String(16), nullable=False)

    # "success" / "failed"
    status: Mapped[str] = mapped_column(String(16), nullable=False)

    started_at: Mapped[dt] = mapped_column(DateTime, nullable=False)
    finished_at: Mapped[Optional[dt]] = mapped_column(DateTime, nullable=True)

    # Archive size in bytes. NULL for failed runs.
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Error message for failed runs. NULL for successful ones.
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index('idx_backup_runs_level_finished', 'level', 'finished_at'),
        Index('idx_backup_runs_status', 'status'),
    )