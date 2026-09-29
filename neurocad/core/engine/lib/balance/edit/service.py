# neurocad/core/engine/lib/balance/edit/service.py

"""
Balance edit service (admin, superadmin-only).

Thin wrapper around CoreEngineLibBalanceService:

    get_for_edit(user_id, log) → one row (defaults if no Balance)
    save(user_id, data, log)   → upsert (create-or-update)

All the heavy lifting (LEFT JOIN, defaults, commit, refresh) lives
in the root service — this module exists only to keep the edit
endpoint isolated and easy to evolve later (e.g. add validation,
audit logging, or a different default set for freshly-created rows).

Namespace: CoreEngineLibBalanceEdit*
"""

from typing import Optional

from ..service import CoreEngineLibBalanceService
from ..schema import CoreEngineLibBalanceListItem


class CoreEngineLibBalanceEditService:
    """Edit-modal operations for a single Balance row."""

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
            fn(target="balance-admin-edit", message=message)
        except Exception:
            pass

    # ========================================
    # GET
    # ========================================

    @classmethod
    async def get_for_edit(
        cls,
        user_id: int,
        log=None,
    ) -> Optional[CoreEngineLibBalanceListItem]:
        """
        Return one user's balance for the edit form.

        Defaults are applied if the user has no Balance row yet
        (has_balance=False, all numeric fields = 0).

        None if the user does not exist at all.
        """
        item = await CoreEngineLibBalanceService.get_one(
            user_id=user_id,
            log=log,
        )

        if item is None:
            cls._log(log, "warning", f"get_for_edit: user {user_id} not found")
            return None

        cls._log(
            log, "info",
            f"get_for_edit: user {user_id}, has_balance={item.has_balance}"
        )
        return item

    # ========================================
    # SAVE
    # ========================================

    @classmethod
    async def save(
        cls,
        user_id: int,
        data: dict,
        log=None,
    ) -> Optional[CoreEngineLibBalanceListItem]:
        """
        Upsert the Balance row for user_id.

        `data` is a plain dict (validated by edit/schema.py).
        Missing/None fields keep the current value on update, or
        fall back to model defaults on create.

        None if the user does not exist.
        """
        item = await CoreEngineLibBalanceService.upsert(
            user_id=user_id,
            data=data,
            log=log,
        )

        if item is None:
            cls._log(log, "warning", f"save: user {user_id} not found")
            return None

        cls._log(
            log, "info",
            f"save: user {user_id}, tarif={item.tarif}, sum={item.sum}"
        )
        return item