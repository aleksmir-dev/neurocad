# neurocad/core/engine/lib/base/profile/balance/service.py

"""
Balance service.

Reads a single row from the `balance` table by user_id.

No cache: the row is read on every get() — SQLite is fast, and
the balance is updated by other subsystems (page generation, LLM
tokens), so caching would introduce stale data with no upside.

If the row is missing (user registered but no balance yet) — a
zeroed default is returned, so the client always has a full shape.

Logging: callers pass `log=app.state.log`. If `log` is None — silent.

Namespace: CoreEngineLibBaseProfileBalance*
"""

from typing import Optional

from sqlalchemy import select

from neurocad.core.models.balance import Balance
from neurocad.utils.sqlite import get_db_sqlite
from .schema import (
    CoreEngineLibBaseProfileBalanceData,
    TARIF_LABELS,
)


class CoreEngineLibBaseProfileBalanceService:
    """Read the current user's balance row."""

    # ========================================
    # LOG HELPER
    # ========================================

    @staticmethod
    def _log(log, level: str, message: str) -> None:
        """Write through app.state.log if available, else silently."""
        if log is None:
            return
        fn = getattr(log, f"log_{level}_sync", None)
        if fn is None:
            return
        try:
            fn(target="balance", message=message)
        except Exception:
            pass

    # ========================================
    # PUBLIC
    # ========================================

    @classmethod
    async def get_for_user(
        cls,
        user_id: int,
        log=None,
    ) -> CoreEngineLibBaseProfileBalanceData:
        """
        Return the balance for `user_id`.

        If the row does not exist — returns a zeroed default so the
        client always receives a full, well-typed shape.
        """
        row = await cls._load_row(user_id)

        if row is None:
            cls._log(log, "info", f"No balance row for user {user_id} — returning default")
            return CoreEngineLibBaseProfileBalanceData(
                user_id=user_id,
                tarif=0,
                tarif_label=TARIF_LABELS.get(0, "Free"),
            )

        return CoreEngineLibBaseProfileBalanceData(
            user_id=row.user_id,
            tarif=row.tarif or 0,
            tarif_label=TARIF_LABELS.get(row.tarif or 0, "Free"),
            day=row.day,
            gen=row.gen or 0,
            tokens=row.tokens or 0,
            sum=row.sum or 0,
            mb=row.mb or 0,
            pages=row.pages or 0,
            price=row.price or 0,
            refer_id=row.refer_id,
            limit_genday=row.limit_genday or 0,
            limit_genmon=row.limit_genmon or 0,
            limit_mb=row.limit_mb or 0,
            limit_pages=row.limit_pages or 0,
            limit_tokens=row.limit_tokens or 0,
            acc_at=row.acc_at,
            updated_at=row.updated_at,
        )

    # ========================================
    # INTERNAL — DB
    # ========================================

    @staticmethod
    async def _load_row(user_id: int) -> Optional[Balance]:
        """Load the balance row for `user_id` (respecting is_delete)."""
        async for session in get_db_sqlite():
            stmt = select(Balance).where(
                Balance.user_id == user_id,
                Balance.is_delete.is_(False),
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none()
        return None