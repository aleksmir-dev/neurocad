# neurocad/core/engine/lib/base/profile/balance/tarif/service.py

"""
Tariff change service.

Reads the current user's balance, exposes the list of available
tariffs, and switches the user's tariff.

Rules on change:
    - limits (limit_*) are OVERWRITTEN with TARIF_PRESETS[new_tarif];
    - balances (gen, tokens, sum, mb, pages) are NOT touched;
    - price of the new tariff is debited from `sum` (always);
    - `day` is set to today's day of month (new billing anchor);
    - `acc_at` is reset to today (new accrual anchor);
    - `updated_at` is refreshed.

If `sum` is not enough to cover the new tariff's price — the change
is rejected with a structured error; the client shows a
"top up balance" modal with the SBP QR (if uploaded) or SBP URL.

0 in any limit_* means "no limit" (see Balance model docstring),
EXCEPT limit_tokens where 0 means "no LLM access".

Tariff codes:
    3 — trial  (1-day trial, same limits as llm; NOT selectable by user)
    0 — free
    1 — pro
    2 — llm

The list is returned in the fixed order [3, 0, 1, 2] (see
TARIF_ORDER in schema.py) — trial first, then free, pro, llm.

QR:
    The SBP QR image is stored by the balance admin as
    media/<admin_nav_id>/qr.png. It is a SINGLE QR for the whole
    project (all users pay to the same recipient — the project owner).
    Its public URL is returned in the `sbp_qr` field of GET /list,
    so the tarif modal can show it when funds are insufficient.

Namespace: CoreEngineLibBaseProfileBalanceTarif*
"""

from datetime import date, datetime
from typing import Optional

from sqlalchemy import select

from neurocad.config import settings
from neurocad.core.models.balance import Balance
from neurocad.core.models.nav import Nav
from neurocad.core.models.user import User
from neurocad.utils.sqlite import get_db_sqlite
from neurocad.core.engine.lib.balance.qr.service import (
    CoreEngineLibBalanceQrService,
)
from .schema import (
    TARIF_PRICES,
    TARIF_LABELS,
    TARIF_DESCRIPTIONS,
    TARIF_ORDER,
    CoreEngineLibBaseProfileBalanceTarifItem,
    CoreEngineLibBaseProfileBalanceTarifListResponse,
)


# ============================================
# ADMIN USER ID
# ============================================
#
# The SBP QR is a single resource for the whole project: it lives
# in media/<admin_nav_id>/qr.png and is uploaded by the admin
# (user_id = 1, created by ensure_superadmin in utils/sqlite.py).
#
# When resolving the QR for ANY user (admin or regular), we always
# look at the ADMIN's nav, not the current user's nav — because
# all payments go to the same recipient.

ADMIN_USER_ID = 1


# ============================================
# TARIF PRESETS — limits per tariff
# ============================================
#
# 0 in limit_genday / limit_genmon / limit_mb / limit_pages means
# "no limit". For limit_tokens, 0 means "no LLM access".
#
# limit_mb is in MEGABYTES (100 = 100 MB, 1024 = 1 GB).
#
# Generations accrual:
#   limit_genday — how much `gen` grows each day.
#   limit_genmon — how much `gen` grows once a month (on `day`).
#
# Trial (3) uses the same limits as llm — the only difference is
# the lifetime: 1 day, after which the lazy reset switches the
# user to free.

TARIF_PRESETS = {
    3: {  # trial — same as llm, 1 day
        "limit_genday": 0,
        "limit_genmon": 0,
        "limit_mb": 1024,
        "limit_pages": 0,
        "limit_tokens": 2_000_000,
    },
    0: {  # free
        "limit_genday": 0,          # no daily accrual
        "limit_genmon": 1,          # +1 per month
        "limit_mb": 100,            # 100 MB
        "limit_pages": 1,           # 1 article
        "limit_tokens": 0,          # LLM not available
    },
    1: {  # pro
        "limit_genday": 1,          # +1 daily
        "limit_genmon": 0,          # no monthly accrual
        "limit_mb": 1024,           # 1 GB
        "limit_pages": 0,           # unlimited
        "limit_tokens": 1_000_000,  # 1M tokens per month
    },
    2: {  # llm
        "limit_genday": 0,
        "limit_genmon": 0,
        "limit_mb": 1024,
        "limit_pages": 0,
        "limit_tokens": 2_000_000,  # 2M tokens per month
    },
}


class CoreEngineLibBaseProfileBalanceTarifService:
    """List tariffs + switch the current user's tariff."""

    # ========================================
    # LOG HELPER
    # ========================================

    @staticmethod
    def _log(log, level: str, message: str) -> None:
        if log is None:
            return
        fn = getattr(log, f"log_{level}_sync", None)
        if fn is None:
            return
        try:
            fn(target="balance-tarif", message=message)
        except Exception:
            pass

    # ========================================
    # SBP URL (env)
    # ========================================

    @staticmethod
    def _get_sbp_url() -> Optional[str]:
        """
        External payment URL for the "not enough funds" case.
        Read from settings (SBER_SBP_URL). None if not configured.

        This is a fallback for when no QR image is uploaded — a
        plain link the client can open.
        """
        return getattr(settings, "SBER_SBP_URL", None) or None

    # ========================================
    # NAV RESOLUTION
    # ========================================

    @staticmethod
    async def _resolve_nav_id(user_id: int) -> Optional[int]:
        """
        First nav of the given user (ORDER BY id ASC, is_delete=0).

        Used only to find where the QR lives — media/<nav_id>/qr.png.
        The QR belongs to the ADMIN's nav, not the current user's.

        Returns None if the user has no nav at all.
        """
        async for session in get_db_sqlite():
            stmt = (
                select(Nav)
                .where(Nav.user_id == user_id, Nav.is_delete.is_(False))
                .order_by(Nav.id.asc())
                .limit(1)
            )
            nav = (await session.execute(stmt)).scalar_one_or_none()
            return nav.id if nav else None

        return None

    # ========================================
    # SBP QR (uploaded image)
    # ========================================

    @classmethod
    async def _get_sbp_qr(cls, user_id: int) -> Optional[str]:
        """
        Public URL of the SBP QR.

        QR is ONE for the whole project: it is uploaded by the
        admin (user_id=1) via the balance admin page and lives at
        media/<admin_nav_id>/qr.png.

        All users see the same QR — they pay to the same recipient
        (the project owner). So we resolve the ADMIN's nav, not the
        current user's.

        The `user_id` argument is kept for signature compatibility
        but is NOT used — every user gets the admin's QR.
        """
        # Always admin — QR is a single project-wide resource.
        nav_id = await cls._resolve_nav_id(ADMIN_USER_ID)
        if not nav_id:
            cls._log(
                None, "warning",
                f"no nav for admin (user_id={ADMIN_USER_ID})",
            )
            return None

        status = await CoreEngineLibBalanceQrService.get_status(nav_id)
        return status.url if status.exists else None

    # ========================================
    # LIST
    # ========================================

    @classmethod
    async def get_list(
        cls,
        user_id: int,
        log=None,
    ) -> Optional[CoreEngineLibBaseProfileBalanceTarifListResponse]:
        """
        Build the tariff list for the modal.

        Includes the user's current tariff and `sum`, plus:
          - `sbp_url` — external SBP link from env (may be None);
          - `sbp_qr`  — public URL of the uploaded QR image (may be None).

        The list is returned in TARIF_ORDER (trial, free, pro, llm).

        Returns None if the user does not exist.
        """
        async for session in get_db_sqlite():
            user_stmt = select(User).where(User.id == user_id)
            user = (await session.execute(user_stmt)).scalar_one_or_none()
            if not user:
                return None

            bal_stmt = select(Balance).where(
                Balance.user_id == user_id,
                Balance.is_delete.is_(False),
            )
            bal = (await session.execute(bal_stmt)).scalar_one_or_none()

            current_tarif = (bal.tarif if bal else 0) or 0
            current_sum = (bal.sum if bal else 0) or 0

            tarifs = [
                CoreEngineLibBaseProfileBalanceTarifItem(
                    tarif=code,
                    label=TARIF_LABELS[code],
                    description=TARIF_DESCRIPTIONS[code],
                    price=TARIF_PRICES[code],
                    **TARIF_PRESETS[code],
                )
                for code in TARIF_ORDER
                if code in TARIF_PRESETS
            ]

            sbp_qr = await cls._get_sbp_qr(user_id)

            cls._log(
                log, "info",
                f"get_list: user {user_id}, sbp_qr={'yes' if sbp_qr else 'no'}",
            )

            return CoreEngineLibBaseProfileBalanceTarifListResponse(
                success=True,
                tarifs=tarifs,
                current_tarif=current_tarif,
                sum=current_sum,
                sbp_url=cls._get_sbp_url(),
                sbp_qr=sbp_qr,
            )

        return None

    # ========================================
    # CHANGE
    # ========================================

    @classmethod
    async def change_tarif(
        cls,
        user_id: int,
        new_tarif: int,
        log=None,
    ):
        """
        Switch the user's tariff.

        The user may only pick free (0), pro (1), or llm (2).
        Trial (3) is granted automatically on registration and is
        rejected here as an invalid choice.

        Returns:
            (item, error_code)
            item       — CoreEngineLibBaseProfileBalanceData-like dict
                         on success (the updated balance row);
                         None on error.
            error_code — None on success;
                         "not_found"        — user does not exist;
                         "insufficient_funds"— sum < price of new tariff;
                         "invalid_tarif"    — unknown or non-selectable code.

        On success:
            - sum -= price (for free price is 0 — nothing debited);
            - limit_* ← TARIF_PRESETS[new_tarif];
            - tarif ← new_tarif;
            - day ← today's day of month (new billing anchor);
            - acc_at ← today (new accrual anchor);
            - updated_at ← now.
        """
        # Trial (3) is NOT selectable by the user.
        if new_tarif == 3 or new_tarif not in TARIF_PRESETS:
            cls._log(log, "warning", f"invalid tariff: {new_tarif}")
            return None, "invalid_tarif"

        price = TARIF_PRICES.get(new_tarif, 0)
        presets = TARIF_PRESETS[new_tarif]

        async for session in get_db_sqlite():
            user_stmt = select(User).where(User.id == user_id)
            user = (await session.execute(user_stmt)).scalar_one_or_none()
            if not user:
                cls._log(log, "warning", f"user {user_id} not found")
                return None, "not_found"

            bal_stmt = select(Balance).where(
                Balance.user_id == user_id,
                Balance.is_delete.is_(False),
            )
            bal = (await session.execute(bal_stmt)).scalar_one_or_none()

            if bal is None:
                bal = Balance(user_id=user_id, tarif=0, sum=0)
                session.add(bal)
                await session.flush()

            current_sum = bal.sum or 0
            if current_sum < price:
                cls._log(
                    log, "info",
                    f"user {user_id}: insufficient funds "
                    f"(sum={current_sum}, price={price})"
                )
                return None, "insufficient_funds"

            now = datetime.now()
            today = now.date()

            # ==== Debit the price of the NEW tariff ====
            bal.sum = current_sum - price

            # ==== Overwrite limits ====
            bal.limit_genday = presets["limit_genday"]
            bal.limit_genmon = presets["limit_genmon"]
            bal.limit_mb     = presets["limit_mb"]
            bal.limit_pages  = presets["limit_pages"]
            bal.limit_tokens = presets["limit_tokens"]

            # ==== Tariff + anchors ====
            bal.tarif = new_tarif
            bal.day = today.day             # billing anchor
            bal.acc_at = today              # accrual anchor

            # ==== Refresh timestamp ====
            bal.updated_at = now

            # NOTE: balances (gen, tokens, sum, mb, pages)
            # are intentionally NOT touched — they accumulate.

            await session.commit()
            await session.refresh(bal)

            cls._log(
                log, "info",
                f"user {user_id}: tariff {new_tarif}, price {price}, "
                f"new sum {bal.sum}, day={bal.day}, acc_at={bal.acc_at}"
            )

            return cls._serialize_balance(bal), None

        return None, "not_found"

    # ========================================
    # SERIALIZE
    # ========================================

    @staticmethod
    def _serialize_balance(bal: Balance) -> dict:
        """
        Serialize a Balance row the same way profile/balance does,
        so the client can reuse its rendering code.

        Dates/datetimes → ISO strings (JSON-safe).
        """
        return {
            "user_id": bal.user_id,
            "tarif": bal.tarif or 0,
            "tarif_label": TARIF_LABELS.get(bal.tarif or 0, "Free"),
            "day": bal.day,
            "gen": bal.gen or 0,
            "tokens": bal.tokens or 0,
            "sum": bal.sum or 0,
            "mb": bal.mb or 0,
            "pages": bal.pages or 0,
            "price": bal.price or 0,
            "refer_id": bal.refer_id,
            "limit_genday": bal.limit_genday or 0,
            "limit_genmon": bal.limit_genmon or 0,
            "limit_mb": bal.limit_mb or 0,
            "limit_pages": bal.limit_pages or 0,
            "limit_tokens": bal.limit_tokens or 0,
            "acc_at": bal.acc_at.isoformat() if bal.acc_at else None,
            "updated_at": bal.updated_at.isoformat() if bal.updated_at else None,
        }