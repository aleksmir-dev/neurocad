# neurocad/core/engine/lib/balance/paid/service.py

"""
Balance paid service (admin, superadmin-only).

Thin wrapper around CoreEngineLibBalanceService:

    paid(user_id, amount, log) → sum += amount (creates row if missing)

All the heavy lifting (create-if-missing, commit, refresh, logging)
lives in the root service — this module exists only to keep the paid
endpoint isolated and easy to evolve later (e.g. add payment audit,
integration with an external provider, referral bonuses).

Namespace: CoreEngineLibBalancePaid*
"""

from typing import Optional

from ..service import CoreEngineLibBalanceService
from ..schema import CoreEngineLibBalanceListItem


class CoreEngineLibBalancePaidService:
    """Paid-modal operations for a single Balance row."""

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
            fn(target="balance-admin-paid", message=message)
        except Exception:
            pass

    # ========================================
    # PAID
    # ========================================

    @classmethod
    async def paid(
        cls,
        user_id: int,
        amount: int,
        log=None,
    ) -> Optional[CoreEngineLibBalanceListItem]:
        """
        Add `amount` to the user's `sum`.

        Creates the Balance row if missing (zeroed, with sum = amount).
        Returns the updated row, or None if the user does not exist.
        """
        cls._log(
            log, "info",
            f"paid: user {user_id}, amount += {amount}"
        )

        item = await CoreEngineLibBalanceService.topup(
            user_id=user_id,
            amount=amount,
            log=log,
        )

        if item is None:
            cls._log(log, "warning", f"paid: user {user_id} not found")
            return None

        cls._log(
            log, "info",
            f"paid: user {user_id}, new sum = {item.sum}"
        )
        return item