# app/core/models/panel_task_hist.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Index
from datetime import datetime as dt
from typing import Optional
from .base import Base


class PanelTaskHist(Base):
    """Audit log for panel task changes.

    Records changes to cron expression and the active flag — the
    task configuration. Runtime state (last_run_at / next_run_at)
    is not logged here; it is not configuration.
    """
    __tablename__ = "panel_tasks_hist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    task_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey('panel_tasks.id', ondelete='CASCADE'),
        nullable=False,
    )

    old_cron: Mapped[str] = mapped_column(String(128), nullable=False)
    new_cron: Mapped[str] = mapped_column(String(128), nullable=False)
    old_active: Mapped[bool] = mapped_column(Boolean, nullable=False)
    new_active: Mapped[bool] = mapped_column(Boolean, nullable=False)

    changed_by: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True,
    )
    changed_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)

    __table_args__ = (
        Index('idx_panel_tasks_hist_task_id', 'task_id'),
        Index('idx_panel_tasks_hist_changed_at', 'changed_at'),
    )