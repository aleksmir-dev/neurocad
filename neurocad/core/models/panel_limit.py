# app/core/models/panel_limit.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, Index, UniqueConstraint
from datetime import datetime as dt
from typing import Optional
from .base import Base


class PanelLimit(Base):
    """Threshold limits for panel subsystem metrics.

    Defines two thresholds — warning and error — for a single
    metric of a single subsystem. Two thresholds split the value
    range into three states:

        "ok"      — value below warning (or above, see direction)
        "warning" — value between warning and error
        "error"   — value beyond error

    Direction is inferred from the thresholds themselves:
      - warning < error  → "higher is worse" (disk, RAM, age);
      - warning > error  → "higher is better" (active keys).
    No explicit direction column — the pair of values carries it.

    One row per (subsystem, metric) pair — enforced by a unique
    constraint. The set of pairs is fixed: the panel code knows
    about a fixed list of subsystems, each reporting one or more
    metrics.
    """
    __tablename__ = "panel_limits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Subsystem identifier. Matches the name used by the panel
    # code, e.g. "backups", "disk", "ram", "llm", "tokens",
    # "publish", "db", "users", "scheduler".
    subsystem: Mapped[str] = mapped_column(String(64), nullable=False)

    # Metric identifier within the subsystem, e.g. "age_hours",
    # "percent", "ping_ms", "daily_millions". The panel code knows
    # how to interpret each metric.
    metric: Mapped[str] = mapped_column(String(64), nullable=False)

    # Two thresholds. The metric value is compared against them
    # to pick a status:
    #   warning < error: value < warning → ok; value >= error → error;
    #                    otherwise → warning.
    #   warning > error: value >= warning → ok; value <= error → error;
    #                    otherwise → warning.
    warning: Mapped[float] = mapped_column(Float, nullable=False)
    error: Mapped[float] = mapped_column(Float, nullable=False)

    # Per-check timeout, in seconds. If a check does not finish
    # within this time, the subsystem is reported as "error" with
    # detail "timeout". Keeps one slow check from blocking the
    # whole panel.
    #
    # server_default is a STRING on purpose: SQLAlchemy would
    # otherwise wrap a scalar `default=3.0` into a TextClause
    # server_default, which Alembic's autogenerate cannot render
    # (AttributeError: 'TextClause' object has no attribute '_copy').
    # Explicit string server_default follows the same pattern as
    # Page.sort_order in the rest of the project.
    timeout: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=3.0,
        server_default="3.0",
    )

    updated_at: Mapped[dt] = mapped_column(DateTime, default=dt.now, onupdate=dt.now)

    # Who last changed this limit. NULL if changed by a background
    # process (not by a user). ondelete='SET NULL' — if the user is
    # deleted, the audit reference is nulled, the limit stays.
    updated_by: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True,
    )

    __table_args__ = (
        UniqueConstraint('subsystem', 'metric', name='uq_panel_limit_sub_met'),
        Index('idx_panel_limits_subsystem', 'subsystem'),
    )