# neurocad/core/engine/lib/base/route.py

"""
Base component routes.

Aggregates routers of all base sub-modules:
    assets — media library (list, upload, delete)
    setup  — application settings (LLM, ...)

Included by lib/route.py with prefix "/base".
Final URLs (with parent prefixes /core/engine/lib/base):
    GET    /core/engine/lib/base/assets
    POST   /core/engine/lib/base/assets/upload
    DELETE /core/engine/lib/base/assets/{filename}
    GET    /core/engine/lib/base/setup/llm
    PUT    /core/engine/lib/base/setup/llm

Each sub-module router carries its own prefix (e.g. "/assets", "/setup").
This aggregator adds only "/base" — so the full path is:
    /core/engine/lib (from lib/route.py)
  + /base            (this router)
  + /<submodule>     (sub-module router)
  + /<endpoint>
"""

from fastapi import APIRouter

from .assets.route import router as assets_router
from .setup.route import router as setup_router


router = APIRouter(prefix="/base", tags=["core/engine/lib/base"])

# Mount sub-module routers.
#
# Each sub-module owns its own prefix — this aggregator does NOT add
# per-submodule prefixes, to avoid double segments like
# /base/assets/assets. Final paths:
#
#   /core/engine/lib + /base + /assets/...  → media library
#   /core/engine/lib + /base + /setup/llm   → LLM settings
#
router.include_router(assets_router)
router.include_router(setup_router)