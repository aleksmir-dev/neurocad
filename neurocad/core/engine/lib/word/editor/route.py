# neurocad/core/engine/lib/word/editor/route.py

"""
Editor sub-router for the Word component.

Namespace: CoreEngineLibWordEditorRoute

Mounted from word/route.py with no extra prefix — the parent router
already carries prefix="/word", and this router adds "/editor".
Final paths (after word router's prefix):
  /core/engine/lib/word/editor/...

Currently mounted here:
  /core/engine/lib/word/editor/effects/...   — effects editor API
  /core/engine/lib/word/editor/images/...    — images editor API

New editor sub-APIs (toolbar, history, templates, ...) go here.
"""

from fastapi import APIRouter

from .effects.route import router as effects_router
from .images.route import router as images_router


router = APIRouter(
    prefix="/editor",
    tags=["core/engine/lib/word/editor"],
)

# Effects editor API
router.include_router(effects_router)

# Images editor API
router.include_router(images_router)