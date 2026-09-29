# neurocad/core/engine/lib/balance/qr/service.py

"""
QR-code service (admin balance, superadmin-only).

Manages a single PNG file — the SBP QR code — inside the nav's
media folder:

    media/<nav_id>/qr.png

Public URL:
    /media/<nav_id>/qr.png

The file is used by the "недостаточно средств" modal (tarif change)
so users can scan the QR and pay via SBP.

Validation:
    - only PNG (magic bytes 89 50 4E 47 0D 0A 1A 0A)
    - max size (see schema.MAX_UPLOAD_BYTES)

Storage helpers reused from BaseAssets paths — media/<nav_id>/ is
the same folder used by the media library; the QR lives there as a
well-known filename.

Namespace: CoreEngineLibBalanceQr*
"""

import os
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile

from .schema import (
    QR_FILENAME,
    PNG_MAGIC,
    MAX_UPLOAD_BYTES,
    CoreEngineLibBalanceQrStatusResponse,
    CoreEngineLibBalanceQrUploadResponse,
    CoreEngineLibBalanceQrDeleteResponse,
)


# ============================================
# PATHS
# ============================================

# Media root — relative to cwd, same as BaseAssets.
MEDIA_ROOT = Path("media")


class CoreEngineLibBalanceQrService:
    """SBP QR file: media/<nav_id>/qr.png."""

    # ----------------------------------------
    # LOG
    # ----------------------------------------

    @staticmethod
    def _log(log, level: str, message: str) -> None:
        if log is None:
            return
        fn = getattr(log, f"log_{level}_sync", None)
        if fn is None:
            return
        try:
            fn(target="balance-qr", message=message)
        except Exception:
            pass

    # ----------------------------------------
    # PATHS
    # ----------------------------------------

    @staticmethod
    def _nav_dir(nav_id: int) -> Path:
        """Return media/<nav_id>/ (creates it if missing)."""
        media_dir = MEDIA_ROOT / str(nav_id)
        media_dir.mkdir(parents=True, exist_ok=True)
        return media_dir

    @staticmethod
    def _qr_path(nav_id: int) -> Path:
        """Full path to media/<nav_id>/qr.png (without creating dirs)."""
        return MEDIA_ROOT / str(nav_id) / QR_FILENAME

    @staticmethod
    def _qr_url(nav_id: int) -> str:
        """Public URL of the QR for the given nav."""
        return f"/media/{nav_id}/{QR_FILENAME}"

    # ----------------------------------------
    # STATUS
    # ----------------------------------------

    @classmethod
    async def get_status(cls, nav_id: int) -> CoreEngineLibBalanceQrStatusResponse:
        """
        Check whether the QR exists for this nav, and return its URL.
        """
        path = cls._qr_path(nav_id)
        exists = path.is_file()

        return CoreEngineLibBalanceQrStatusResponse(
            success=True,
            exists=exists,
            url=cls._qr_url(nav_id) if exists else None,
            nav_id=nav_id,
        )

    # ----------------------------------------
    # UPLOAD
    # ----------------------------------------

    @classmethod
    async def save_qr(
        cls,
        nav_id: int,
        file: UploadFile,
        log=None,
    ) -> CoreEngineLibBalanceQrUploadResponse:
        """
        Validate and save the uploaded PNG as media/<nav_id>/qr.png.

        Validation:
          - content must be non-empty
          - size <= MAX_UPLOAD_BYTES
          - first 8 bytes must match the PNG magic number

        On error — raises HTTPException(400) with a Russian message.

        Any previous qr.png in the same folder is overwritten.
        """
        # --- 1. Content type check (fast fail) ---
        content_type = (file.content_type or "").lower()
        if content_type and content_type != "image/png":
            raise HTTPException(
                status_code=400,
                detail="Только PNG. Конвертируйте файл перед загрузкой.",
            )

        # --- 2. Read the whole file (2 MB limit is small) ---
        try:
            data = await file.read()
        except Exception as e:
            cls._log(log, "error", f"read failed: {e}")
            raise HTTPException(status_code=400, detail="Не удалось прочитать файл")

        if not data:
            raise HTTPException(status_code=400, detail="Пустой файл")

        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Файл слишком большой "
                    f"(максимум {MAX_UPLOAD_BYTES // 1024 // 1024} МБ)"
                ),
            )

        # --- 3. Magic bytes check ---
        if not data.startswith(PNG_MAGIC):
            raise HTTPException(
                status_code=400,
                detail="Файл не является PNG (проверьте формат)",
            )

        # --- 4. Write to media/<nav_id>/qr.png ---
        nav_dir = cls._nav_dir(nav_id)
        qr_path = nav_dir / QR_FILENAME

        try:
            with open(qr_path, "wb") as f:
                f.write(data)
        except Exception as e:
            cls._log(log, "error", f"write failed: {e}")
            raise HTTPException(status_code=500, detail="Не удалось сохранить файл")

        cls._log(
            log, "info",
            f"QR saved for nav_id={nav_id}, {len(data)} bytes → {qr_path}",
        )

        return CoreEngineLibBalanceQrUploadResponse(
            success=True,
            url=cls._qr_url(nav_id),
            nav_id=nav_id,
        )

    # ----------------------------------------
    # DELETE
    # ----------------------------------------

    @classmethod
    async def delete_qr(
        cls,
        nav_id: int,
        log=None,
    ) -> CoreEngineLibBalanceQrDeleteResponse:
        """
        Delete media/<nav_id>/qr.png if it exists.

        Idempotent: deleting a non-existent QR is not an error —
        `deleted=False` in the response.
        """
        path = cls._qr_path(nav_id)

        if not path.is_file():
            cls._log(log, "info", f"QR delete: nothing to delete for nav_id={nav_id}")
            return CoreEngineLibBalanceQrDeleteResponse(
                success=True,
                deleted=False,
                nav_id=nav_id,
            )

        try:
            os.unlink(path)
        except Exception as e:
            cls._log(log, "error", f"delete failed: {e}")
            raise HTTPException(status_code=500, detail="Не удалось удалить файл")

        cls._log(log, "info", f"QR deleted for nav_id={nav_id}")

        return CoreEngineLibBalanceQrDeleteResponse(
            success=True,
            deleted=True,
            nav_id=nav_id,
        )