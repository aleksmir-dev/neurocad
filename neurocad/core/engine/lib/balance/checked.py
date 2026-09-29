# neurocad/core/engine/lib/balance/checked.py

"""
BalanceChecked — lazy balance checks for one user.

Single entry point for every operation that touches a user's
Balance: LLM requests, logo generation, page creation, media
upload, public page rendering, and admin-triggered cleanup.

All checks are LAZY: no scheduler, no background workers — the
state is recalculated on the next request from the user (or from
the admin, for admin-scoped operations like stale-account cleanup).

Rules (see TARIF_PRESETS in tarif/service.py):

    free   (0) — LLM not available, limit_pages=1, limit_mb=100
    pro    (1) — LLM available, limit_pages=0, limit_mb=1024,
                 limit_tokens=1M, gen+1/day
    llm    (2) — LLM available, limit_pages=0, limit_mb=1024,
                 limit_tokens=2M, no gen accrual
    trial  (3) — same as llm, expires after 1 day → free

Lazy day-change steps (in order), see reset_if_needed():
    1. Trial expiry  — tarif==3 and day passed → switch to free.
    2. Daily accrual — gen += limit_genday × days_passed.
    3. Monthly accrual — gen += limit_genmon × billing_hits.
    4. Billing-day   — tokens = limit_tokens, sum -= price,
                       downgrade tariff if sum < price.
    5. Update acc_at.

Cleanup (admin-triggered, lazy):
    Free users whose acc_at is older than FREE_TTL_DAYS get
    soft-deleted (User, Nav, Page, Balance → is_delete=1) and
    their media/<nav_id>/ folder is removed from disk.

Namespace: CoreEngineLibBalanceChecked
"""

from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func, select

from neurocad.core.models.balance import Balance
from neurocad.core.models.nav import Nav
from neurocad.core.models.page import Page
from neurocad.core.models.user import User
from neurocad.utils.sqlite import get_db_sqlite

from neurocad.core.engine.lib.base.profile.balance.tarif.service import (
    TARIF_PRESETS,
    TARIF_PRICES,
)


# ============================================
# CONSTANTS
# ============================================

MSK = ZoneInfo("Europe/Moscow")

#: Tariff code for the 1-day trial (see TARIF_PRESETS).
TARIF_TRIAL = 3

#: Tariff code for free — must match TARIF_PRESETS[0].
TARIF_FREE = 0

#: Tariff code for pro — must match TARIF_PRESETS[1].
TARIF_PRO = 1

#: Tariff code for llm — must match TARIF_PRESETS[2].
TARIF_LLM = 2

#: How long a free user can keep their data before cleanup.
FREE_TTL_DAYS = 30


# ============================================
# SERVICE
# ============================================

class BalanceChecked:
    """Lazy balance checks and lazy day-change for a single user."""

    # ========================================
    # LOG
    # ========================================

    @staticmethod
    def _log(log, level: str, message: str) -> None:
        if log is None:
            return
        fn = getattr(log, f"log_{level}_sync", None)
        if fn is None:
            return
        try:
            fn(target="balance-checked", message=message)
        except Exception:
            pass

    # ========================================
    # TODAY (MSK)
    # ========================================

    @staticmethod
    def _today() -> date:
        """Today's date in Europe/Moscow."""
        return datetime.now(MSK).date()

    # ========================================
    # LOAD
    # ========================================

    @staticmethod
    async def _load_balance(user_id: int) -> Optional[Balance]:
        """Load the user's Balance row (is_delete=0)."""
        async for session in get_db_sqlite():
            stmt = select(Balance).where(
                Balance.user_id == user_id,
                Balance.is_delete.is_(False),
            )
            return (await session.execute(stmt)).scalar_one_or_none()
        return None

    # ========================================
    # LAZY DAY-CHANGE
    # ========================================

    @classmethod
    async def reset_if_needed(cls, user_id: int, log=None) -> Optional[Balance]:
        """
        Apply lazy accruals and billing to the user's Balance.

        Steps (in order):
          1. Trial expiry  — tarif==3 and day passed → switch to free.
          2. Daily accrual — gen += limit_genday × days_passed.
          3. Monthly accrual — gen += limit_genmon × billing_hits.
          4. Billing-day   — tokens = limit_tokens, sum -= price,
                             downgrade tariff if sum < price.
          5. Update acc_at.

        Returns the (fresh) Balance, or None if the user has no row.
        """
        async for session in get_db_sqlite():
            stmt = select(Balance).where(
                Balance.user_id == user_id,
                Balance.is_delete.is_(False),
            )
            bal = (await session.execute(stmt)).scalar_one_or_none()
            if bal is None:
                return None

            today = cls._today()
            changed = False

            # ---- 1. Trial expiry ----
            if bal.tarif == TARIF_TRIAL:
                started = bal.acc_at or today
                if (today - started).days >= 1:
                    cls._log(log, "info", f"user {user_id}: trial expired → free")
                    cls._apply_tarif(bal, TARIF_FREE)
                    bal.day = today.day
                    bal.acc_at = today
                    changed = True

            # ---- 2. Daily accrual ----
            if bal.limit_genday > 0 and bal.acc_at is not None:
                days = (today - bal.acc_at).days
                if days > 0:
                    bal.gen += days * bal.limit_genday
                    changed = True

            # ---- 3. Monthly accrual ----
            if bal.limit_genmon > 0 and bal.day and bal.acc_at is not None:
                n = cls._months_between(bal.acc_at, today, bal.day)
                if n > 0:
                    bal.gen += n * bal.limit_genmon
                    changed = True

            # ---- 4. Billing-day ----
            if bal.day and bal.acc_at is not None:
                n = cls._months_between(bal.acc_at, today, bal.day)
                if n > 0:
                    # Reset tokens (if the tariff has a token cap).
                    if bal.limit_tokens > 0:
                        bal.tokens = bal.limit_tokens

                    # Charge the tariff price for each missed month.
                    for _ in range(n):
                        price = TARIF_PRICES.get(bal.tarif, 0)
                        if price == 0:
                            break
                        if bal.sum >= price:
                            bal.sum -= price
                        else:
                            cls._apply_tarif(bal, cls._downgrade(bal.tarif))
                            # After downgrade, price may be 0 — stop.
                            if TARIF_PRICES.get(bal.tarif, 0) == 0:
                                break
                    changed = True

            # ---- 5. acc_at ----
            if bal.acc_at != today:
                bal.acc_at = today
                changed = True

            if changed:
                bal.updated_at = datetime.now()
                await session.commit()
                await session.refresh(bal)

            return bal

        return None

    # ========================================
    # LIMIT CHECKS
    # ========================================

    @classmethod
    async def llm_allowed(cls, user_id: int, log=None):
        """
        Check if the user may send an LLM request (chat).

        Returns (Balance, error_code):
          error_code — None | 'no_balance' | 'llm_not_available'
                       | 'tokens_exhausted'.
        """
        bal = await cls.reset_if_needed(user_id, log=log)
        if bal is None:
            return None, "no_balance"

        # Free — LLM not available.
        if bal.tarif == TARIF_FREE:
            return bal, "llm_not_available"

        # Any tariff with a token cap — must have tokens.
        if bal.limit_tokens > 0 and bal.tokens <= 0:
            return bal, "tokens_exhausted"

        return bal, None

    @classmethod
    async def logo_allowed(cls, user_id: int, log=None):
        """
        Logo generation (chat or image).

        On pro: gen AND tokens are consumed.
        On llm: tokens only.
        On free: blocked (LLM not available).

        Returns (Balance, error_code):
          error_code — None | 'no_balance' | 'llm_not_available'
                       | 'tokens_exhausted' | 'gen_exhausted'.
        """
        bal, err = await cls.llm_allowed(user_id, log=log)
        if err:
            return bal, err

        # pro — also check gen.
        if bal.tarif == TARIF_PRO and bal.gen <= 0:
            return bal, "gen_exhausted"

        return bal, None

    @classmethod
    async def page_allowed(cls, user_id: int, log=None):
        """
        Check if the user may create a new page.

        `pages` is counted on the fly (see _count_pages).

        Returns (Balance, error_code, current_pages):
          error_code — None | 'no_balance' | 'pages_exhausted'.
        """
        bal = await cls.reset_if_needed(user_id, log=log)
        if bal is None:
            return None, "no_balance", 0

        current = await cls._count_pages(user_id)

        if bal.limit_pages > 0 and current >= bal.limit_pages:
            return bal, "pages_exhausted", current

        return bal, None, current

    @classmethod
    async def media_allowed(cls, user_id: int, extra_mb: int, log=None):
        """
        Check if the user may upload extra_mb more megabytes.

        Returns (Balance, error_code):
          error_code — None | 'no_balance' | 'mb_exhausted'.
        """
        bal = await cls.reset_if_needed(user_id, log=log)
        if bal is None:
            return None, "no_balance"

        if bal.limit_mb > 0 and bal.mb + extra_mb > bal.limit_mb:
            return bal, "mb_exhausted"

        return bal, None

    # ========================================
    # PUBLIC PAGE RENDER CHECK
    # ========================================

    @classmethod
    async def page_renderable(cls, user_id: int, log=None) -> bool:
        """
        Whether the user's pages may be publicly rendered.

        Free with more pages than limit_pages → False (guest sees
        "Страница недоступна", HTTP 200).
        Trial / pro / llm → True.
        """
        bal = await cls._load_balance(user_id)
        if bal is None:
            return False

        if bal.tarif == TARIF_TRIAL:
            return True

        if bal.tarif == TARIF_FREE:
            if bal.limit_pages > 0:
                current = await cls._count_pages(user_id)
                if current > bal.limit_pages:
                    return False

        return True

    # ========================================
    # CLEANUP (admin-only, lazy)
    # ========================================

    @classmethod
    async def cleanup_stale(cls, log=None) -> int:
        """
        Soft-delete free users whose acc_at is older than
        FREE_TTL_DAYS.

        Called when the superadmin opens the admin balance page.

        Rules:
          - tarif == free (0)
          - acc_at < today - FREE_TTL_DAYS
          - User / Nav / Page / Balance → is_delete = 1
          - media/<nav_id>/ → removed from disk

        Returns the number of affected users.
        """
        today = cls._today()
        cutoff = today - timedelta(days=FREE_TTL_DAYS)
        affected = 0

        async for session in get_db_sqlite():
            stmt = select(Balance).where(
                Balance.tarif == TARIF_FREE,
                Balance.is_delete.is_(False),
                Balance.acc_at.isnot(None),
                Balance.acc_at < cutoff,
            )
            rows = (await session.execute(stmt)).scalars().all()

            for bal in rows:
                user_id = bal.user_id

                # Soft-delete user
                user_stmt = select(User).where(User.id == user_id)
                user = (await session.execute(user_stmt)).scalar_one_or_none()
                if user:
                    user.is_delete = True

                # Soft-delete navs + pages + drop media folders
                nav_stmt = select(Nav).where(Nav.user_id == user_id)
                navs = (await session.execute(nav_stmt)).scalars().all()
                for nav in navs:
                    nav.is_delete = True

                    pg_stmt = select(Page).where(Page.nav_id == nav.id)
                    pages = (await session.execute(pg_stmt)).scalars().all()
                    for pg in pages:
                        pg.is_delete = 1

                    cls._delete_media_folder(nav.id, log=log)

                # Soft-delete balance
                bal.is_delete = True

                affected += 1
                cls._log(log, "info", f"cleanup: user {user_id} soft-deleted")

            if affected:
                await session.commit()

        return affected

    # ========================================
    # INTERNAL — ACCRUAL HELPERS
    # ========================================

    @staticmethod
    def _apply_tarif(bal: Balance, new_tarif: int) -> None:
        """
        Overwrite limits for a new tariff. Balances (gen, tokens,
        sum, mb, pages) are NOT touched.
        """
        presets = TARIF_PRESETS.get(new_tarif, {})
        bal.tarif = new_tarif
        bal.limit_genday = presets.get("limit_genday", 0)
        bal.limit_genmon = presets.get("limit_genmon", 0)
        bal.limit_mb     = presets.get("limit_mb", 0)
        bal.limit_pages  = presets.get("limit_pages", 0)
        bal.limit_tokens = presets.get("limit_tokens", 0)

    @staticmethod
    def _downgrade(tarif: int) -> int:
        """llm → pro → free. trial / free → free."""
        if tarif == TARIF_LLM:
            return TARIF_PRO
        if tarif == TARIF_PRO:
            return TARIF_FREE
        return TARIF_FREE

    @staticmethod
    def _months_between(from_date: date, to_date: date, day_of_month: int) -> int:
        """
        Number of times the billing-day (day_of_month) fired in
        the interval (from_date, to_date].

        If a target month is shorter than day_of_month
        (e.g. 31 in February), the last day of that month is used.
        """
        if from_date >= to_date:
            return 0

        count = 0
        y, m = from_date.year, from_date.month

        while True:
            m += 1
            if m > 12:
                m = 1
                y += 1

            # Last day of (y, m)
            if m == 12:
                last = 31
            else:
                next_month = date(y, m + 1, 1)
                last = (next_month - timedelta(days=1)).day

            billing_day = min(day_of_month, last)
            billing = date(y, m, billing_day)

            if billing > to_date:
                break
            if billing > from_date:
                count += 1

        return count

    # ========================================
    # INTERNAL — DB HELPERS
    # ========================================

    @staticmethod
    async def _count_pages(user_id: int) -> int:
        """
        Count non-deleted pages across all of the user's non-deleted
        navs. Lazy — computed on every call.
        """
        async for session in get_db_sqlite():
            stmt = (
                select(func.count(Page.id))
                .join(Nav, Nav.id == Page.nav_id)
                .where(
                    Nav.user_id == user_id,
                    Nav.is_delete.is_(False),
                    Page.is_delete == 0,
                )
            )
            result = await session.execute(stmt)
            return int(result.scalar_one() or 0)
        return 0

    @staticmethod
    def _delete_media_folder(nav_id: int, log=None) -> None:
        """Remove media/<nav_id>/ from disk. Non-fatal on error."""
        import shutil
        from pathlib import Path

        path = Path("media") / str(nav_id)
        if not path.is_dir():
            return
        try:
            shutil.rmtree(path)
            BalanceChecked._log(log, "info", f"media removed: {path}")
        except Exception as e:
            BalanceChecked._log(log, "warning", f"media remove failed: {e}")