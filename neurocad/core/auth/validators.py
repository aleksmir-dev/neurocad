# app/core/auth/validators.py

"""
Login validators.

A login must:
  - be at least 8 characters long;
  - consist of a-z, 0-9, '-' and '_';
  - start with a letter.

The 8-char minimum doubles as a reserved-names rule: every system
host (www, api, dev, admin, static, server, ...) and every short
brandable word (studio, market, design, coffee, ...) is 7 chars or
shorter, so it can never collide with a user subdomain. No separate
reserved list is needed.

Storage format: the login is always saved in lower case. Two logins
that differ only by case ("User1" / "user1") are the same login.

Subdomain form: the login is slugified (lowercase, a-z0-9-, '_'
turned into '-') to build <slug>.neurocad.ru. Slug collisions
between different logins ("andrey_k" / "andrey-k") are checked
separately in the registration flow.
"""

import re
from typing import Optional


LOGIN_MIN_LENGTH = 8
LOGIN_MAX_LENGTH = 64

#: a-z, 0-9, '-' and '_', starting with a letter.
_LOGIN_RE = re.compile(r"^[a-z][a-z0-9_-]*$")


def normalize_login(login: str) -> str:
    """Lower-case and trim a raw login string."""
    return (login or "").strip().lower()


def validate_login(login: str) -> Optional[str]:
    """
    Return None if the login is valid, or a Russian error message
    if not. Never raises.
    """
    s = normalize_login(login)

    if not s:
        return "Введите логин"

    if len(s) < LOGIN_MIN_LENGTH:
        return (
            f"Логин должен быть не короче {LOGIN_MIN_LENGTH} символов — "
            "короткие имена зарезервированы системой"
        )

    if len(s) > LOGIN_MAX_LENGTH:
        return f"Логин должен быть не длиннее {LOGIN_MAX_LENGTH} символов"

    if not _LOGIN_RE.match(s):
        return "Логин может содержать только латиницу, цифры, дефис и подчёркивание"

    return None


def slugify_login(login: str) -> str:
    """
    Same slugification the domain service uses to build
    <slug>.neurocad.ru. Keep the two in sync.

    - lower-case;
    - '_' becomes '-';
    - everything else that is not a-z / 0-9 / '-' is dropped;
    - leading/trailing '-' is trimmed.
    """
    s = normalize_login(login)
    s = s.replace("_", "-")
    s = re.sub(r"[^a-z0-9-]+", "-", s)
    s = s.strip("-")
    return s or "user"