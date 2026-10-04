# app/core/auth/register/schema.py

from pydantic import BaseModel, Field, EmailStr
from typing import Optional


class CoreAuthRegisterRequestSchema(BaseModel):
    """
    Registration request.

    Login: at least 8 characters, starts with a letter, contains
    only latin letters, digits, hyphen and underscore. The length
    minimum doubles as a reserved-names rule — every system host
    (www, api, dev, admin, ...) is 7 characters or shorter, so it
    can never be taken by a user.

    Short logins (demo, docs, wiki) are intentionally unavailable
    through this schema. Technical accounts with a short login are
    created only from the shell — via `neurocad create-user`, which
    calls register_user() directly and bypasses Pydantic validation.
    """
    login: str = Field(
        ...,
        min_length=8,
        max_length=64,
        pattern=r"^[a-zA-Z][a-zA-Z0-9_-]*$",
        description="Login: latin letters, digits, hyphen, underscore; 8+ characters",
    )
    password: str = Field(
        ...,
        min_length=8,
        description="Password (min 8 characters)",
    )
    password_confirm: str = Field(
        ...,
        min_length=8,
        description="Password confirmation",
    )
    name: Optional[str] = Field(
        None,
        max_length=200,
        description="Full name",
    )
    email: Optional[EmailStr] = Field(
        None,
        description="Email",
    )