# neurocad/core/engine/lib/base/profile/domain/service/legal.py

"""
Legal texts (policy / rules) storage for the domain service.

Provides:

  - set_legal()          — save users.policy or users.rules;
  - get_legal_for_user() — read both fields for a user id;
  - get_legal_for_host() — resolve a Host header to a user and
                           return that user's policy / rules;
  - get_defaults()       — read both default markdown files from
                           disk (modal/legal/policy.md and
                           modal/legal/rules.md).

Every user owns their own policy and rules texts, because every
user runs their own site on their own subdomain (or custom
domain). neurocad.ru is no exception: the platform's root domain
is bound to the superadmin as a regular user, and their policy /
rules live in the same columns as everyone else's.

The texts are stored in markdown. The public endpoints /policy
and /rules (see public.py) render them to HTML on the fly, with
the same default files as a fallback when the field is empty.

Nothing here touches the schema — the field names are "policy"
and "rules" on User, and `which` in the public API accepts
exactly those two strings.

Namespace: CoreEngineLibBaseProfileDomain*
"""

from typing import Optional, Literal

from sqlalchemy import select

from neurocad.core.models.user import User
from neurocad.utils.sqlite import get_db_sqlite

from ..public import read_default


class LegalMixin:
    """Save and read the user's policy / rules markdown texts."""

    # ========================================
    # WRITE
    # ========================================

    @classmethod
    async def set_legal(
        cls,
        user_id: int,
        which: Literal["policy", "rules"],
        text: str,
        log=None,
    ) -> Optional[str]:
        """
        Save users.policy (which="policy") or users.rules
        (which="rules").

        Returns the stored text on success, or None if the user
        does not exist / is deleted / `which` is invalid.

        The text is stored verbatim, including an empty string.
        Empty string and NULL are distinct states: "" means the
        user cleared the field on purpose, NULL means they never
        touched it.
        """
        if which not in ("policy", "rules"):
            return None

        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.id == user_id,
                User.is_delete.is_(False),
            )
            user = (await session.execute(stmt)).scalar_one_or_none()
            if user is None:
                return None

            setattr(user, which, text)
            await session.commit()
            cls._log(
                log, "info",
                f"user {user_id}: {which} updated ({len(text)} bytes)",
            )
            return text

        return None

    # ========================================
    # READ — by user id
    # ========================================

    @classmethod
    async def get_legal_for_user(cls, user_id: int) -> dict:
        """
        Read both fields for a user id.

        Returns a dict:
            {"policy": str | None, "rules": str | None}

        Both values are None if the user does not exist or is
        soft-deleted. Callers that need to distinguish "no such
        user" from "user has no texts" should check user existence
        separately; the public routes treat both cases as 404.
        """
        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.id == user_id,
                User.is_delete.is_(False),
            )
            user = (await session.execute(stmt)).scalar_one_or_none()
            if user is None:
                return {"policy": None, "rules": None}
            return {
                "policy": user.policy,
                "rules": user.rules,
            }

        return {"policy": None, "rules": None}

    # ========================================
    # READ — by Host header
    # ========================================

    @classmethod
    async def get_legal_for_host(cls, host: str) -> Optional[dict]:
        """
        Resolve a Host header to a user and return their policy /
        rules.

        Resolution order (same as /robots.txt, see utils/routes.py):

          1. Host is a user subdomain (<login>.<APP_DOMAIN>):
                testuser3.neurocad.ru → "testuser3" → user
          2. Host is a user custom domain (users.domain):
                atou.ru → owner's login → user
          3. Anything else:
                None (caller returns 404)

        Returns {"policy": str | None, "rules": str | None}, or
        None if the host does not belong to any user.
        """
        from neurocad.utils.hosts import (
            slug_from_host,
            login_from_custom_domain,
            _user_id_by_login,
        )

        user_id: Optional[int] = None

        # ---- Step 1: user subdomain ----
        slug = slug_from_host(host)
        if slug:
            user_id = await _user_id_by_login(slug)

        # ---- Step 2: user custom domain ----
        if user_id is None:
            login = await login_from_custom_domain(host)
            if login:
                user_id = await _user_id_by_login(login)

        if user_id is None:
            return None

        return await cls.get_legal_for_user(user_id)

    # ========================================
    # READ — defaults
    # ========================================

    @staticmethod
    def get_defaults() -> dict:
        """
        Read both default markdown texts from disk.

        Returns:
            {"policy": str, "rules": str}

        The files live at ./modal/legal/policy.md and
        ./modal/legal/rules.md. The {date} placeholder in each file
        is substituted with today's ISO date, matching what the
        public /policy and /rules endpoints serve when the field
        is empty.

        Never raises: a missing or unreadable file yields a short
        inline fallback (see public.read_default).
        """
        return {
            "policy": read_default("policy"),
            "rules": read_default("rules"),
        }