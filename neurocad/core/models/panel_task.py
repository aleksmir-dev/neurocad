# app/core/models/panel_task.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Index, Text
from datetime import datetime as dt
from typing import Optional
from .base import Base


class PanelTask(Base):
    """Cron-managed task for the admin panel.

    The actual crontab is regenerated whenever a task is changed
    (from the panel UI). The task itself is invoked by cron via
    curl, and the DB row is updated by the endpoint the task hits
    — cron does not know about the DB.

    The `url` field points to the internal endpoint that performs
    the work, e.g. "/services/panel/metrics".
    """
    __tablename__ = "panel_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Machine-readable name, e.g. "metrics_hourly". Unique — used
    # by the panel code to identify the task.
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)

    # Human-readable title, shown in the panel UI.
    title: Mapped[str] = mapped_column(String(128), nullable=False)

    # Internal endpoint the task hits, e.g. "/services/panel/metrics".
    # Stored in the DB, not hard-coded, so a new task can be added
    # without a code change.
    url: Mapped[str] = mapped_column(String(255), nullable=False)

    # Whether the task is currently enabled. Disabled tasks are
    # left in the DB (so their history and settings survive) but
    # are not written to the crontab.
    #
    # server_default is a STRING on purpose — same reason as in
    # PanelLimit.timeout: a scalar `default=True` would be wrapped
    # by SQLAlchemy into a TextClause server_default, which
    # Alembic's autogenerate cannot render. Boolean in SQLite is
    # stored as 0/1, so "1" means True.
    active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="1",
    )

    # Standard cron expression, e.g. "0 * * * *" for hourly.
    # Parsed and validated by croniter before being written to the
    # crontab. Minimum interval — one minute.
    cron: Mapped[str] = mapped_column(String(128), nullable=False)

    # Runtime state. Written by the task itself, not by cron.
    last_run_at: Mapped[Optional[dt]] = mapped_column(DateTime, nullable=True)
    last_status: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)  # "success" / "failed"
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    next_run_at: Mapped[Optional[dt]] = mapped_column(DateTime, nullable=True)

    updated_at: Mapped[dt] = mapped_column(DateTime, default=dt.now, onupdate=dt.now)

    updated_by: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True,
    )

    __table_args__ = (
        Index('idx_panel_tasks_name', 'name'),
        Index('idx_panel_tasks_active', 'active'),
    )