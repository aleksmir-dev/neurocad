# neurocad/core/engine/lib/balance/qr/schema.py

"""
QR-code schemas (admin balance, superadmin-only).

Pydantic models for the SBP QR upload/status endpoints:

    GET    /core/engine/lib/balance/qr/status   — есть ли QR, URL
    POST   /core/engine/lib/balance/qr/upload   — загрузить PNG
    DELETE /core/engine/lib/balance/qr          — удалить

Storage:
    media/<nav_id>/qr.png

The QR lives in the same media folder as the nav that owns the
balance page — for the admin, that is media/<nav_id>/ where nav_id
comes from ?nav_id=<id> (or the first nav of the current user).

The QR is a single file per nav. Only PNG is accepted (magic bytes
checked in the service).

Public URL:
    /media/<nav_id>/qr.png

Namespace: CoreEngineLibBalanceQr*
"""

from typing import Optional
from pydantic import BaseModel, Field


# ============================================
# CONSTANTS
# ============================================

# Fixed file name in the nav's media folder.
QR_FILENAME = "qr.png"

# PNG magic bytes — first 8 bytes of any PNG file.
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

# Max upload size — 2 MB is plenty for a QR code.
MAX_UPLOAD_BYTES = 2 * 1024 * 1024


# ============================================
# STATUS — GET /qr/status
# ============================================

class CoreEngineLibBalanceQrStatusResponse(BaseModel):
    """
    Response for GET /core/engine/lib/balance/qr/status.

    exists  — True if the QR file is present in media/<nav_id>/qr.png.
    url     — public URL of the QR (or None if it does not exist).
    nav_id  — the nav instance this QR belongs to.
    """

    success: bool = True
    exists: bool = False
    url: Optional[str] = None
    nav_id: int


# ============================================
# UPLOAD — POST /qr/upload
# ============================================

class CoreEngineLibBalanceQrUploadResponse(BaseModel):
    """
    Response for POST /core/engine/lib/balance/qr/upload.

    url     — public URL of the just-saved QR.
    nav_id  — the nav instance it belongs to.
    """

    success: bool = True
    url: str
    nav_id: int


# ============================================
# DELETE — DELETE /qr
# ============================================

class CoreEngineLibBalanceQrDeleteResponse(BaseModel):
    """
    Response for DELETE /core/engine/lib/balance/qr.

    deleted — True if the file existed and was removed,
              False if there was nothing to delete.
    """

    success: bool = True
    deleted: bool = False
    nav_id: int