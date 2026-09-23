# neurocad/core/engine/lib/base/route.py

"""
Base component routes.

Aggregates routers of all base sub-modules:
    assets — media library (list, upload, delete)

Included by lib/route.py with prefix "/base".
Final URLs (with the parent prefix /core/engine/lib):
    GET    /core/engine/lib/base/assets
    POST   /core/engine/lib/base/assets/upload
    DELETE /core/engine/lib/base/assets/{filename}
"""

from fastapi import APIRouter

from .assets.route import router as assets_router


router = APIRouter(prefix="/base", tags=["core/engine/lib/base"])

# Mount sub-module routers.
# Note: assets router has its own prefix "/base/assets" internally —
# so the full path is /core/engine/lib + /base + /assets.
# To avoid double "base", the assets router uses prefix="/base/assets",
# and this router uses prefix="/base" for future sub-modules.
#
# Result: full path = /core/engine/lib + /base/assets + endpoint
router.include_router(assets_router)