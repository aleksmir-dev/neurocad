# neurocad/core/models/run.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, Index
from datetime import datetime as dt
from typing import Optional
from .base import Base


class Run(Base):
    """
    One multi-step LLM generation run.

    Lifecycle:
      pending   → created, nothing started
      planning  → step 1 (plan) is running
      filling   → step 2 (fill) is running
      effects   → step 3 (effects) is running
      done      → finished successfully, final_html is set
      cancelled → user pressed Stop
      failed    → error during any step, `error` is set

    Every step writes its result to the corresponding column, so the
    run can be resumed or inspected even if the WebSocket connection
    dropped. This also makes the state visible to all uvicorn workers,
    since it lives in the shared SQLite database.
    """
    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Which page this run belongs to
    page_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("pages.id"),
        nullable=False,
    )

    # Who started it (superadmin)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )

    # Lifecycle
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="pending",
    )
    step: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Input
    user_message: Mapped[str] = mapped_column(Text, nullable=False)
    block_catalog: Mapped[Optional[str]] = mapped_column(Text)  # JSON

    # Intermediate results
    plan: Mapped[Optional[str]] = mapped_column(Text)           # JSON
    filled: Mapped[Optional[str]] = mapped_column(Text)         # JSON
    effects: Mapped[Optional[str]] = mapped_column(Text)        # JSON

    # Final result
    final_html: Mapped[Optional[str]] = mapped_column(Text)
    message: Mapped[Optional[str]] = mapped_column(Text)
    error: Mapped[Optional[str]] = mapped_column(Text)

    # Audit
    created_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)
    updated_at: Mapped[dt] = mapped_column(
        DateTime, default=dt.now, onupdate=dt.now
    )

    __table_args__ = (
        Index('idx_runs_page_id', 'page_id'),
        Index('idx_runs_user_id', 'user_id'),
        Index('idx_runs_status', 'status'),
        Index('idx_runs_page_status', 'page_id', 'status'),
    )