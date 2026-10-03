# neurocad/core/engine/lib/base/profile/domain/checked.py

"""
Lazy cleanup for custom-domain certificates.

Called from the admin balance page (same place as
BalanceChecked.cleanup_stale) — no scheduler, no background workers.

When a user removes their custom domain, a row is written to
`domains` with:
    disabled_at  = now
    delete_after = now + DOMAIN_GRACE_DAYS

If the user re-attaches the domain within the grace period, the
deletion is cancelled (delete_after is reset to NULL). The row is
kept for history.

If the grace period expires without re-attachment, on the next admin
visit this module physically removes the Caddy certificate directory
and stamps deleted_at.

Rules (all must hold):
  - delete_after IS NOT NULL
  - delete_after <= now
  - deleted_at IS NULL
  - name NOT in PROTECTED_DOMAINS / suffixes
  - name NOT still present in users.domain (sync safety check)

Rows are NEVER deleted — deleted_at is the terminal marker.

Namespace: CoreEngineLibBaseProfileDomain*
"""

import shutil
from datetime import datetime
from pathlib import Path

from sqlalchemy import select

from neurocad.core.models.domain import Domain
from neurocad.core.models.user import User
from neurocad.utils.sqlite import get_db_sqlite
from .service import is_protected_domain


# Caddy stores certificates under
#   <data-dir>/certificates/acme-v02.api.letsencrypt.org-directory/<domain>/
# The exact prefix depends on how Caddy was started. We keep it as a
# module-level constant so there is exactly one place to change it.
CADDY_CERT_DIR = Path(
    "/root/.local/share/caddy/certificates/"
    "acme-v02.api.letsencrypt.org-directory"
)


class CoreEngineLibBaseProfileDomainChecked:
    """Lazy, admin-triggered cleanup of expired domain certificates."""

    # ========================================
    # PUBLIC
    # ========================================

    @classmethod
    async def cleanup_stale(cls, log=None) -> int:
        """
        Physically remove Caddy certificates for domains whose
        grace period expired.

        Returns the number of certificates actually removed (or
        already absent). Rows are NEVER deleted — only stamped with
        deleted_at, so the full history stays in `domains`.

        Idempotent. Safe to call on every admin page load.
        """
        now = datetime.utcnow()
        removed = 0
        cancelled = 0

        async for session in get_db_sqlite():
            stmt = select(Domain).where(
                Domain.delete_after.isnot(None),
                Domain.delete_after <= now,
                Domain.deleted_at.is_(None),
            )
            rows = (await session.execute(stmt)).scalars().all()

            for row in rows:
                # 1. Protected — cancel, never touch the cert.
                if is_protected_domain(row.name):
                    cls._log(
                        log, "warning",
                        f"cleanup protected, cancelling: {row.name}",
                    )
                    row.delete_after = None
                    cancelled += 1
                    continue

                # 2. Still in users.domain — sync glitch, cancel.
                user_stmt = select(User).where(
                    User.domain == row.name,
                    User.is_delete.is_(False),
                )
                user = (await session.execute(user_stmt)).scalar_one_or_none()
                if user is not None:
                    cls._log(
                        log, "warning",
                        f"cleanup cancel: {row.name} still in users.domain "
                        f"(user_id={user.id}, login={user.login})",
                    )
                    row.delete_after = None
                    cancelled += 1
                    continue

                # 3. Build the list of candidate dirs to remove.
                #    Caddy may have stored the cert under `name` and/or
                #    under the `www.`-variant. We remove the exact match,
                #    plus the www-variant — but only if the www-variant
                #    is not itself in users.domain (someone else may own it).
                candidates = [row.name]
                www_variant = (
                    row.name[4:] if row.name.startswith("www.") else "www." + row.name
                )
                if not await cls._is_domain_in_use(www_variant):
                    candidates.append(www_variant)
                else:
                    cls._log(
                        log, "info",
                        f"cleanup keeps {www_variant}: still in users.domain",
                    )

                # 4. Remove each candidate that exists.
                removed_any = False
                failed = False
                for cand in candidates:
                    try:
                        cert_dir = cls._safe_cert_dir(cand)
                    except ValueError as e:
                        cls._log(log, "warning", f"cleanup path error: {e}")
                        continue

                    if not cert_dir.exists():
                        continue

                    try:
                        shutil.rmtree(cert_dir)
                        cls._log(log, "info", f"cleanup removed cert: {cand}")
                        removed_any = True
                    except Exception as e:
                        cls._log(
                            log, "warning",
                            f"cleanup remove failed {cand}: {e}",
                        )
                        failed = True
                        break

                if failed:
                    # Do not stamp deleted_at — retry on the next admin visit.
                    continue

                if not removed_any:
                    cls._log(
                        log, "info",
                        f"cleanup cert dir absent, marking deleted: {row.name}",
                    )

                row.deleted_at = now
                removed += 1

            if rows:
                await session.commit()

        if removed or cancelled:
            cls._log(
                log, "info",
                f"domain cleanup: {removed} removed, {cancelled} cancelled",
            )

        return removed

    # ========================================
    # INTERNAL
    # ========================================

    @staticmethod
    async def _is_domain_in_use(name: str) -> bool:
        """True if `name` is present in users.domain (non-deleted)."""
        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.domain == name,
                User.is_delete.is_(False),
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none() is not None
        return False

    @staticmethod
    def _safe_cert_dir(name: str) -> Path:
        """
        Resolve the certificate directory for `name` and make sure
        it stays inside CADDY_CERT_DIR. Guards against path
        traversal (e.g. name="../../etc").
        """
        base = CADDY_CERT_DIR.resolve()
        candidate = (CADDY_CERT_DIR / name).resolve()
        if not str(candidate).startswith(str(base) + "/"):
            raise ValueError(f"path escapes CADDY_CERT_DIR: {name!r}")
        return candidate

    @staticmethod
    def _log(log, level: str, message: str) -> None:
        if log is None:
            return
        fn = getattr(log, f"log_{level}_sync", None)
        if fn is None:
            return
        try:
            fn(target="domain", message=message)
        except Exception:
            pass