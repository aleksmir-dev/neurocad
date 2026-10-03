# neurocad/core/models/domain.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, DateTime, Index
from datetime import datetime
from typing import Optional
from .base import Base


class Domain(Base):
    """
    Scheduled-for-deletion custom domains.

    A row appears here when a user removes their custom domain
    (users.domain = None). If the user doesn't re-attach it within
    GRACE_DAYS, the lazy cleanup physically removes the Caddy
    certificate from disk.

    name is the primary key — a domain can only be in one state
    at a time: active (no row / delete_after=NULL) or scheduled
    (delete_after set).
    """
    __tablename__ = "domains"

    name: Mapped[str] = mapped_column(String(253), primary_key=True)

    # When the domain was removed.
    disabled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    # When it becomes eligible for physical deletion.
    delete_after: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # When the certificate was actually removed from disk.
    # NULL = not yet removed.
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("idx_domains_delete_after", "delete_after"),
    )