# neurocad/core/engine/lib/word/media.py

"""
Media assets for a nav — list and upload.

Each nav instance owns its own media folder: media/<nav_id>/.
Assets are isolated per nav, not per module. This matches the data
model: a nav is the object that owns pages, and media belongs to
the object too.

Two operations:

    - list_assets(nav_id)         — scan media/<nav_id>/ for images
                                    and return them as { src, name, type }.
    - upload_assets(files, nav_id) — save uploaded files, return URLs.

Naming rules on upload:

    - favicon.ico, robots.txt, sitemap.xml are SPECIAL_NAMES and
      are kept as-is (overwritten on every upload, which is what
      you want for those three).
    - All other files get a random 8-hex suffix before the
      extension, to avoid collisions.

Both SPECIAL_NAMES and MEDIA_URL live in word/constants.py. This
module is the only place that actually uses SPECIAL_NAMES — the
import in service.py is a re-export for backward compatibility.

Namespace: CoreEngineLibWordMedia*
"""

import os
import re
import uuid
from pathlib import Path
from typing import List, Dict

from fastapi import UploadFile

from .constants import MEDIA_URL, SPECIAL_NAMES


# ============================================
# PUBLIC API
# ============================================

async def list_assets(nav_id: int) -> List[Dict[str, str]]:
    """
    Get list of all images from media/<nav_id>/.

    Returns list of dicts: { src, name, type }.

    Only image extensions are returned: .jpg, .jpeg, .png, .gif,
    .svg, .webp. Everything else on disk is skipped.
    """
    media_dir = Path("media") / str(nav_id)
    media_dir.mkdir(parents=True, exist_ok=True)

    assets: List[Dict[str, str]] = []

    for filepath in sorted(media_dir.rglob('*')):
        if not filepath.is_file():
            continue

        ext = filepath.suffix.lower()
        if ext not in ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp']:
            continue

        rel = filepath.relative_to(media_dir).as_posix()

        assets.append({
            "src": f"{MEDIA_URL}/{nav_id}/{rel}",
            "name": filepath.name,
            "type": "image",
        })

    return assets


async def upload_assets(
    files: List[UploadFile],
    nav_id: int,
) -> List[str]:
    """
    Save uploaded files to media/<nav_id>/.

    Special names (favicon.ico, robots.txt, sitemap.xml) — kept as-is.
    Other files — get a random 8-hex suffix.

    Files are written in 64 KB chunks to avoid loading large media
    into memory.

    Returns list of URLs of uploaded files.
    """
    media_dir = Path("media") / str(nav_id)
    media_dir.mkdir(parents=True, exist_ok=True)

    uploaded_urls: List[str] = []

    for uploaded_file in files:
        original_name = uploaded_file.filename or "file"
        clean_name = re.sub(r'[^a-zA-Z0-9_.\-]', '_', original_name)

        if clean_name in SPECIAL_NAMES:
            final_name = clean_name
        else:
            name, ext = os.path.splitext(clean_name)
            suffix = uuid.uuid4().hex[:8]
            final_name = f"{name}_{suffix}{ext}"

        save_path = media_dir / final_name

        with open(save_path, "wb") as buffer:
            while True:
                chunk = await uploaded_file.read(1024 * 64)
                if not chunk:
                    break
                buffer.write(chunk)

        await uploaded_file.close()

        uploaded_urls.append(f"{MEDIA_URL}/{nav_id}/{final_name}")

    return uploaded_urls