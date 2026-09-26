# neurocad/utils/crypto.py

"""
Symmetric encryption helpers.

Generic Fernet wrapper — no knowledge of which fields are secret.
Callers decide what to encrypt.

If NEUROCAD_SECRET_KEY is missing or invalid, encrypt()/decrypt()
are no-ops (return input unchanged) and is_crypto_available()
returns False.

Not to be confused with app/utils/hash.py — that's one-way password
hashing, not reversible encryption.
"""

from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from neurocad.config import settings


_fernet: Optional[object] = None


def _get_fernet():
    """Return the cached Fernet instance, or None if crypto is disabled."""
    global _fernet

    if _fernet is not None:
        return _fernet if _fernet is not False else None

    key = getattr(settings, "NEUROCAD_SECRET_KEY", None)

    if not key:
        # No key — encryption disabled. Callers can check via
        # is_crypto_available() to warn the user.
        _fernet = False
        return None

    try:
        _fernet = Fernet(key.encode("utf-8") if isinstance(key, str) else key)
        return _fernet
    except Exception:
        # Invalid key — encryption disabled. Callers can check via
        # is_crypto_available().
        _fernet = False
        return None


def is_crypto_available() -> bool:
    """True if a valid NEUROCAD_SECRET_KEY is configured."""
    return _get_fernet() is not None


def encrypt(plaintext: Optional[str]) -> Optional[str]:
    """
    Encrypt a string with Fernet. Returns a base64 str.

    - None  → None
    - ''    → ''
    - If crypto is disabled → returns plaintext unchanged.
    - On any error → returns plaintext unchanged.
    """
    if plaintext is None:
        return None
    if plaintext == "":
        return ""

    f = _get_fernet()
    if f is None:
        return plaintext

    try:
        return f.encrypt(plaintext.encode("utf-8")).decode("ascii")
    except Exception:
        return plaintext


def decrypt(ciphertext: Optional[str]) -> Optional[str]:
    """
    Decrypt a Fernet token. Returns the original plaintext.

    - None  → None
    - ''    → ''
    - If crypto is disabled → returns input unchanged.
    - If the token is invalid → returns input unchanged
      (key rotated, or the value was stored as plaintext).

    Never raises.
    """
    if ciphertext is None:
        return None
    if ciphertext == "":
        return ""

    f = _get_fernet()
    if f is None:
        return ciphertext

    try:
        return f.decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken:
        # Key rotated, or the value was stored in plaintext.
        return ciphertext
    except Exception:
        return ciphertext