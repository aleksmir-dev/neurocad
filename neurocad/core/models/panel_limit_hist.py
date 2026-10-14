# app/core/models/panel_limit_hist.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, DateTime, ForeignKey, Index, Text
from datetime import datetime as dt
from typing import Optional
from .base import Base


class PanelLimitHist(Base):
    """Audit log for panel limit changes.

    One row per change. Old and new values are stored as JSON
    strings (not as separate columns per field) so that adding a
    new field to PanelLimit later does not require a migration
    here.

    Only configuration changes are logged — not runtime state.
    """
    __tablename__ = "panel_limits_hist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # The limit this record refers to. ondelete='CASCADE' — if the
    # limit is deleted, its history goes with it; a history row
    # without a limit is meaningless.
    limit_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey('panel_limits.id', ondelete='CASCADE'),
        nullable=False,
    )

    # Old and new values as JSON. Example:
    #   {"warning": 4.0, "error": 8.0, "timeout": 1.0}
    old_value: Mapped[str] = mapped_column(Text, nullable=False)
    new_value: Mapped[str] = mapped_column(Text, nullable=False)

    # Who changed. NULL if changed by a background process.
    # ondelete='SET NULL' — the audit record survives user deletion
    # (only the user reference is nulled).
    changed_by: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True,
    )

    changed_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)

    __table_args__ = (
        Index('idx_panel_limits_hist_limit_id', 'limit_id'),
        Index('idx_panel_limits_hist_changed_at', 'changed_at'),
    )