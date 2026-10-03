# neurocad/core/engine/lib/balance/service.py

"""
Balance service (admin, superadmin-only).

Reads the balance table and joins it with users, so the admin
page shows every registered user — even those without a Balance
row yet (LEFT JOIN, zeroed defaults).

Public API:
    get_list(log)              — all users + their balance (or defaults)
    get_one(user_id, log)      — one row (for edit.js), defaults if missing
    upsert(user_id, data, log) — create or update a Balance row
    topup(user_id, amount, log)— sum += amount (creates if missing)

Lazy cleanup:
    get_list() also triggers BalanceChecked.cleanup_stale() — a lazy,
    admin-triggered cleanup of free users whose data has outlived
    FREE_TTL_DAYS. Soft-deletes User/Nav/Page/Balance and removes
    media/<nav_id>/ from disk.

    Also triggers CoreEngineLibBaseProfileDomainChecked.cleanup_stale()
    — a lazy cleanup of custom-domain Caddy certificates whose grace
    period (DOMAIN_GRACE_DAYS) has expired.

Logging:
    Callers pass `log=app.state.log`. If `log` is None — silent.

Namespace: CoreEngineLibBalance*
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import select

from neurocad.core.models.balance import Balance
from neurocad.core.models.user import User
from neurocad.utils.sqlite import get_db_sqlite
from neurocad.core.engine.lib.balance.checked import BalanceChecked
from .schema import (
    CoreEngineLibBalanceListItem,
    tarif_label,
)


class CoreEngineLibBalanceService:
    """Admin balance operations."""

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
            fn(target="balance-admin", message=message)
        except Exception:
            pass

    # ========================================
    # LIST
    # ========================================

    @classmethod
    async def get_list(cls, log=None):
        """
        Return all users + their balance.

        LEFT JOIN: users without a Balance row get zeroed defaults
        and has_balance=False — so the admin can spot them and
        create the row via edit.

        Also triggers lazy cleanup (see BalanceChecked.cleanup_stale).
        The cleanup runs once per admin page load — idempotent, no
        scheduler.
        """
        # ---- Lazy cleanup of expired free users ----
        try:
            affected = await BalanceChecked.cleanup_stale(log=log)
            if affected:
                cls._log(log, "info", f"cleanup: {affected} stale user(s) removed")
        except Exception as e:
            cls._log(log, "warning", f"cleanup failed: {e}")

        # ---- Lazy cleanup of expired domain certificates ----
        try:
            from neurocad.core.engine.lib.base.profile.domain.checked import (
                CoreEngineLibBaseProfileDomainChecked,
            )
            removed = await CoreEngineLibBaseProfileDomainChecked.cleanup_stale(log=log)
            if removed:
                cls._log(log, "info", f"cleanup: {removed} domain cert(s) removed")
        except Exception as e:
            cls._log(log, "warning", f"domain cleanup failed: {e}")

        # ---- Build the list ----
        items = []

        async for session in get_db_sqlite():
            # LEFT JOIN users → balance. is_delete фильтруется
            # на стороне balance: soft-deleted строка показывается
            # как «нет баланса».
            stmt = (
                select(User, Balance)
                .outerjoin(
                    Balance,
                    (Balance.user_id == User.id)
                    & (Balance.is_delete.is_(False)),
                )
                .where(User.is_delete.is_(False))
                .order_by(User.id.asc())
            )

            result = await session.execute(stmt)
            rows = result.all()

            for user, bal in rows:
                items.append(cls._build_item(user, bal))

            break  # one session is enough

        cls._log(log, "info", f"get_list: {len(items)} rows")
        return items

    # ========================================
    # ONE
    # ========================================

    @classmethod
    async def get_one(cls, user_id: int, log=None) -> Optional[CoreEngineLibBalanceListItem]:
        """
        Return one user's balance (defaults if no Balance row).

        None if the user does not exist at all.
        """
        async for session in get_db_sqlite():
            user_stmt = select(User).where(
                User.id == user_id,
                User.is_delete.is_(False),
            )
            user = (await session.execute(user_stmt)).scalar_one_or_none()
            if not user:
                return None

            bal_stmt = select(Balance).where(
                Balance.user_id == user_id,
                Balance.is_delete.is_(False),
            )
            bal = (await session.execute(bal_stmt)).scalar_one_or_none()

            return cls._build_item(user, bal)

        return None

    # ========================================
    # UPSERT (used by edit/)
    # ========================================

    @classmethod
    async def upsert(cls, user_id: int, data: dict, log=None):
        """
        Create or update a Balance row for user_id.

        `data` is a plain dict with Balance fields (already validated
        by edit/schema.py).

        On update:
          - `day`, `refer_id`, `acc_at` are nullable — None means "clear".
          - Everything else is non-null — None means "keep current".

        Returns the updated row as a CoreEngineLibBalanceListItem,
        or None if the user does not exist.
        """
        async for session in get_db_sqlite():
            user_stmt = select(User).where(
                User.id == user_id,
                User.is_delete.is_(False),
            )
            user = (await session.execute(user_stmt)).scalar_one_or_none()
            if not user:
                return None

            bal_stmt = select(Balance).where(
                Balance.user_id == user_id,
                Balance.is_delete.is_(False),
            )
            bal = (await session.execute(bal_stmt)).scalar_one_or_none()

            now = datetime.now()

            if bal is None:
                # Create — apply provided values, defaults for the rest.
                bal = Balance(
                    user_id=user_id,
                    tarif=data.get("tarif") or 0,
                    day=data.get("day"),
                    gen=data.get("gen") or 0,
                    tokens=data.get("tokens") or 0,
                    sum=data.get("sum") or 0,
                    mb=data.get("mb") or 0,
                    pages=data.get("pages") or 0,
                    price=data.get("price") or 0,
                    refer_id=data.get("refer_id"),
                    limit_genday=data.get("limit_genday") or 0,
                    limit_genmon=data.get("limit_genmon") or 0,
                    limit_mb=data.get("limit_mb") or 0,
                    limit_pages=data.get("limit_pages") or 0,
                    limit_tokens=data.get("limit_tokens") or 0,
                    acc_at=data.get("acc_at"),
                    is_delete=bool(data.get("is_delete") or False),
                    updated_at=now,
                )
                session.add(bal)
                cls._log(log, "info", f"upsert: created balance for user {user_id}")
            else:
                # Nullable fields — None means "clear".
                for key in ("day", "refer_id", "acc_at"):
                    if key in data:
                        setattr(bal, key, data[key])

                # Non-null fields — None means "keep current".
                for key in (
                    "tarif", "gen", "tokens",
                    "sum", "mb", "pages", "price",
                    "limit_genday", "limit_genmon", "limit_mb",
                    "limit_pages", "limit_tokens",
                ):
                    if key in data and data[key] is not None:
                        setattr(bal, key, data[key])

                # is_delete is allowed to be False (explicit un-delete).
                if "is_delete" in data:
                    bal.is_delete = bool(data["is_delete"])

                bal.updated_at = now

                cls._log(log, "info", f"upsert: updated balance for user {user_id}")

            await session.commit()
            await session.refresh(bal)

            return cls._build_item(user, bal)

        return None

    # ========================================
    # TOPUP (used by paid/)
    # ========================================

    @classmethod
    async def topup(cls, user_id: int, amount: int, log=None):
        """
        sum += amount for user_id.

        Creates a zeroed Balance row if missing. Returns the updated
        item, or None if the user does not exist.
        """
        async for session in get_db_sqlite():
            user_stmt = select(User).where(
                User.id == user_id,
                User.is_delete.is_(False),
            )
            user = (await session.execute(user_stmt)).scalar_one_or_none()
            if not user:
                return None

            bal_stmt = select(Balance).where(
                Balance.user_id == user_id,
                Balance.is_delete.is_(False),
            )
            bal = (await session.execute(bal_stmt)).scalar_one_or_none()

            now = datetime.now()

            if bal is None:
                bal = Balance(
                    user_id=user_id,
                    tarif=0,
                    sum=amount,
                    updated_at=now,
                )
                session.add(bal)
                cls._log(
                    log, "info",
                    f"topup: created balance for user {user_id}, sum=+{amount}"
                )
            else:
                bal.sum = (bal.sum or 0) + amount
                bal.updated_at = now
                cls._log(
                    log, "info",
                    f"topup: user {user_id}, sum += {amount} (new={bal.sum})"
                )

            await session.commit()
            await session.refresh(bal)

            return cls._build_item(user, bal)

        return None

    # ========================================
    # INTERNAL — BUILD ITEM
    # ========================================

    @staticmethod
    def _build_item(user: User, bal: Optional[Balance]) -> CoreEngineLibBalanceListItem:
        """
        Build a CoreEngineLibBalanceListItem from a User + (optional) Balance.

        If bal is None — all numeric fields default to 0, has_balance=False.
        """
        if bal is None:
            return CoreEngineLibBalanceListItem(
                user_id=user.id,
                login=user.login,
                name=user.name,
                is_superadmin=bool(getattr(user, "is_superadmin", False)),
                has_balance=False,
                tarif=0,
                tarif_label=tarif_label(0),
            )

        tarif = bal.tarif if bal.tarif is not None else 0

        return CoreEngineLibBalanceListItem(
            user_id=user.id,
            login=user.login,
            name=user.name,
            is_superadmin=bool(getattr(user, "is_superadmin", False)),
            has_balance=True,
            tarif=tarif,
            tarif_label=tarif_label(tarif),
            day=bal.day,
            gen=bal.gen or 0,
            tokens=bal.tokens or 0,
            sum=bal.sum or 0,
            mb=bal.mb or 0,
            pages=bal.pages or 0,
            price=bal.price or 0,
            refer_id=bal.refer_id,
            limit_genday=bal.limit_genday or 0,
            limit_genmon=bal.limit_genmon or 0,
            limit_mb=bal.limit_mb or 0,
            limit_pages=bal.limit_pages or 0,
            limit_tokens=bal.limit_tokens or 0,
            acc_at=bal.acc_at,
            is_delete=bool(bal.is_delete),
            updated_at=bal.updated_at,
        )