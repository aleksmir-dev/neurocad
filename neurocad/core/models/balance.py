# neurocad/core/models/balance.py

"""
Balance — per-user limits, balances and tariff state.

One row per user. Holds:
    - the user's current tariff (free / pro / llm);
    - the billing day of the month (1–31);
    - remaining balances (tokens, generations, money, storage, pages);
    - the corresponding limits (per day / per month / total);
    - the referrer (refer_id) who brought the user.

Values are integers; the tariff is stored as a small integer:
    0 — free
    1 — pro
    2 — llm

Storage (`mb` / `limit_mb`) is in MEGABYTES, not gigabytes.
The name is explicit so nobody has to guess: 100 = 100 MB,
1024 = 1 GB. UI formats it for display.

Generations (`gen`):
    A single accumulated counter. It grows by `limit_genday` every
    day and by `limit_genmon` once a month (on `balance.day`).
    There is NO separate daily/monthly balance — one field, two
    accrual rates.

    Example:
        pro:  limit_genday=1, limit_genmon=0  → +1 daily
        free: limit_genday=0, limit_genmon=1  → +1 monthly
        llm:  limit_genday=0, limit_genmon=0  → never grows (LLM
              generations are unlimited via tokens)

Accrual anchor (`acc_at`):
    Date of the last lazy reset for this user. Used by the lazy
    "day change": on each request we compare today against `acc_at`
    and top up `gen` / `tokens` accordingly. Updated on:
      - daily accrual   (any tariff with limit_genday > 0),
      - monthly accrual (any tariff with limit_genmon > 0),
      - tariff change   (always reset to today).

Billing day (`day`):
    The day of the month when the user last changed their tariff.
    All monthly accruals (limit_genmon, limit_tokens) are anchored
    to this day. If `day` = 31 and the target month is shorter,
    the last day of that month is used (28/29 Feb, 30 Apr, ...).

Convention — "0 means unlimited":
    For every limit_* field, 0 means "no limit" — the guard
    never blocks on it. A positive value is the actual cap.

    EXCEPT `limit_tokens`: 0 means "LLM is not available"
    (used on the free tariff). For pro / llm it is a positive cap.

`is_delete` is a Boolean: SQLAlchemy stores it in SQLite as INTEGER
(0 = false, 1 = true), same as everywhere else in this project.
"""

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import (
    Integer,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
)
from datetime import datetime, date
from typing import Optional
from .base import Base


class Balance(Base):
    __tablename__ = "balance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Owner of this balance row.
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Current tariff: 0 — free, 1 — pro, 2 — llm.
    tarif: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Billing day of the month (1–31) — the day the user last
    # changed their tariff. Anchors all monthly accruals.
    day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # ===== REMAINING BALANCES =====

    # Accumulated generations. Grows by limit_genday (daily) and
    # limit_genmon (monthly, on `day`). Spent by LLM generations
    # on free / pro. On llm — unlimited (see limit_tokens).
    gen: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Remaining LLM tokens.
    tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Remaining money on the account.
    sum: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Storage used, in megabytes. Updated on upload / delete of media.
    mb: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Number of pages (articles) created by the user.
    pages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ===== TARIFF PRICE =====

    # Tariff price.
    price: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ===== REFERRAL =====

    # ID of the referrer (the user who invited this one).
    refer_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ===== LIMITS =====
    #
    # 0 means "no limit" for every field below — except limit_tokens,
    # where 0 means "LLM not available" (free tariff).

    # Generation accrual rates.
    #   limit_genday — how much `gen` grows each day.
    #   limit_genmon — how much `gen` grows each month (on `day`).
    limit_genday: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    limit_genmon: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Storage limit, in megabytes.
    limit_mb: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Total page-creation limit.
    limit_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # LLM token limit per month.
    #   0        — LLM not available (free tariff).
    #   > 0      — cap; tokens are reset to this on `day`.
    limit_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ===== ACCRUAL ANCHOR =====
    #
    # Date of the last lazy reset. Used by the lazy "day change":
    # on each request we compare today against `acc_at` and top up
    # `gen` / `tokens` accordingly.
    #
    # Updated on:
    #   - daily accrual   (any tariff with limit_genday > 0),
    #   - monthly accrual (any tariff with limit_genmon > 0),
    #   - tariff change   (always reset to today).
    #
    # null — the user has never been through the lazy reset.
    acc_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # ===== HOUSEKEEPING =====

    # Soft delete flag. SQLAlchemy maps Boolean to INTEGER in SQLite:
    # False → 0, True → 1.
    is_delete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now,
        onupdate=datetime.now,
        nullable=True,
    )

    __table_args__ = (
        Index("idx_balance_user_id", "user_id"),
        Index("idx_balance_refer_id", "refer_id"),
        Index("idx_balance_tarif", "tarif"),
        Index("idx_balance_is_delete", "is_delete"),
    )