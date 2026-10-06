# neurocad/core/engine/lib/base/profile/domain/service/robots.py

"""
robots.txt storage for the domain service.

Provides:

  - ROBOTS_OPEN   — robots.txt body that opens the domain to all;
  - ROBOTS_CLOSED — robots.txt body that closes the domain to all;
  - set_robots()  — save users.robots_2 or users.robots_3.

Two fields on User, one per host the user owns:

  - robots_2 — robots.txt for the custom second-level domain
               (users.domain);
  - robots_3 — robots.txt for the free third-level subdomain
               (<login>.<APP_DOMAIN>).

The text is stored verbatim, including an empty string. The
backend does NOT parse or validate robots.txt syntax — that is
the frontend's job (presets, hints). "User cleared the textarea"
and "user never opened the modal" are distinct states, so NULL
is not the same as "".

Defaults (must match utils/routes.py and schema.py):

  - ROBOTS_OPEN   — the domain is open to all robots;
  - ROBOTS_CLOSED — the domain is closed to all robots.

NULL in the DB is substituted with ROBOTS_CLOSED when the payload
is built (see get_for_user in facade.py), so the frontend always
gets a non-empty textarea to open.

Namespace: CoreEngineLibBaseProfileDomain*
"""

from typing import Optional, Literal

from sqlalchemy import select

from neurocad.core.models.user import User
from neurocad.utils.sqlite import get_db_sqlite

from ..schema import DEFAULT_ROBOTS_CLOSED


# ============================================
# ROBOTS.TXT DEFAULTS
# ============================================

#: robots.txt body that opens the domain to all robots.
ROBOTS_OPEN = "User-agent: *\nDisallow:\n"

#: robots.txt body that closes the domain to all robots.
#: Must match DEFAULT_ROBOTS_CLOSED in schema.py and ROBOTS_CLOSED
#: in utils/routes.py.
ROBOTS_CLOSED = DEFAULT_ROBOTS_CLOSED


class RobotsMixin:
    """Save robots.txt for the custom domain or the free subdomain."""

    @classmethod
    async def set_robots(
        cls,
        user_id: int,
        which: Literal["2", "3"],
        text: str,
        log=None,
    ) -> Optional[str]:
        """
        Save `users.robots_2` (custom domain) or `users.robots_3`
        (free subdomain).

        `which` selects the target field:

          - "2" → users.robots_2;
          - "3" → users.robots_3.

        Anything else returns None.

        Returns the stored text on success, or None if the user does
        not exist / is deleted / `which` is invalid. The text is
        stored verbatim — the frontend is responsible for its content,
        the backend does not parse or validate robots.txt syntax.

        Empty string is stored as-is. `get_for_user` treats NULL and
        empty as "not set" and substitutes ROBOTS_CLOSED, but the
        saved value itself is preserved so that "user cleared the
        textarea" and "user never opened the modal" stay distinct.
        """
        if which not in ("2", "3"):
            return None

        field = "robots_2" if which == "2" else "robots_3"

        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.id == user_id,
                User.is_delete.is_(False),
            )
            user = (await session.execute(stmt)).scalar_one_or_none()
            if user is None:
                return None

            setattr(user, field, text)
            await session.commit()
            cls._log(
                log, "info",
                f"user {user_id}: {field} updated ({len(text)} bytes)",
            )
            return text

        return None