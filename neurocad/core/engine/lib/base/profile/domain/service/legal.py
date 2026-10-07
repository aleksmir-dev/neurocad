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
                           modal/legal/rules.md);
  - load_home_context()  — read the user's home page (title,
                           description, visible text) as context
                           for the generate_legal agent.

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

import re
from typing import Optional, Literal

from sqlalchemy import select

from neurocad.core.models.user import User
from neurocad.utils.sqlite import get_db_sqlite

from ..public import read_default


# ============================================
# HTML STRIPPING (for legal generation)
# ============================================

def _strip_html(html: str, max_len: int = 3000) -> str:
    """
    Convert HTML to plain text and trim to max_len characters.

    This is a cheap strip — not a full HTML parser. It removes
    <script>, <style>, then tags, then collapses whitespace. Good
    enough to give the LLM a feeling for what the page is about.

    Trims at max_len to keep the prompt small.

    Not used for public rendering — that goes through markdown-it-py
    on the output side. This is only for extracting the "visible
    text" of a page to feed into a prompt.
    """
    if not html:
        return ""

    s = html

    # Drop script / style content entirely.
    s = re.sub(r"<script\b[^>]*>.*?</script>", " ", s, flags=re.DOTALL | re.IGNORECASE)
    s = re.sub(r"<style\b[^>]*>.*?</style>", " ", s, flags=re.DOTALL | re.IGNORECASE)

    # Replace every tag with a space so words do not glue together.
    s = re.sub(r"<[^>]+>", " ", s)

    # Collapse whitespace.
    s = re.sub(r"\s+", " ", s).strip()

    if len(s) > max_len:
        s = s[:max_len].rstrip() + "…"

    return s


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

    # ========================================
    # GENERATE — home page context
    # ========================================

    @classmethod
    async def load_home_context(cls, user_id: int) -> Optional[dict]:
        """
        Load the user's home page context for legal generation.

        Resolution:
          1. users.home_page_id — if set and points to a live page
             of the user's first nav.
          2. First page of the user's first nav (ORDER BY datetime
             ASC, is_delete=0, is_active=1).
          3. None — the user has no pages at all.

        Returns a dict:
            {
              "owner_name":  <User.name or "">,
              "title":       <page.title or "">,
              "description": <page.description or "">,
              "text":        <strip_html(page.content)>,
            }
        or None if the user has no pages.

        HTML stripping is done here, not in the agent, so the agent
        stays focused on LLM interaction, not on parsing. The
        stripped text is trimmed to a reasonable size (see
        _strip_html) — the LLM does not need the whole page.
        """
        from neurocad.core.models.nav import Nav
        from neurocad.core.models.page import Page

        async for session in get_db_sqlite():
            # ---- 1. user ----
            u_stmt = select(User).where(
                User.id == user_id,
                User.is_delete.is_(False),
            )
            user = (await session.execute(u_stmt)).scalar_one_or_none()
            if user is None:
                return None

            owner_name = (user.name or "").strip()

            # ---- 2. first nav ----
            nav_stmt = (
                select(Nav)
                .where(
                    Nav.user_id == user_id,
                    Nav.is_delete.is_(False),
                )
                .order_by(Nav.id.asc())
                .limit(1)
            )
            nav = (await session.execute(nav_stmt)).scalar_one_or_none()
            if nav is None:
                return None

            page = None

            # ---- 3a. explicit home page ----
            if user.home_page_id:
                hp_stmt = select(Page).where(
                    Page.id == user.home_page_id,
                    Page.nav_id == nav.id,
                    Page.is_delete == 0,
                    Page.is_active == 1,
                )
                page = (await session.execute(hp_stmt)).scalar_one_or_none()

            # ---- 3b. fallback: first page by datetime ASC ----
            if page is None:
                fp_stmt = (
                    select(Page)
                    .where(
                        Page.nav_id == nav.id,
                        Page.is_delete == 0,
                        Page.is_active == 1,
                    )
                    .order_by(Page.datetime.asc(), Page.id.asc())
                    .limit(1)
                )
                page = (await session.execute(fp_stmt)).scalar_one_or_none()

            if page is None:
                return None

            return {
                "owner_name": owner_name,
                "title": (page.title or "").strip(),
                "description": (page.description or "").strip(),
                "text": _strip_html(page.content or ""),
            }

        return None