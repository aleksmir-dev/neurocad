# app/core/engine/lib/route.py

from fastapi import APIRouter
from .nav.route import router as nav_router
from .pages.route import router as pages_router
from .word.route import router as word_router

router = APIRouter(prefix="/lib", tags=["core/engine/lib"])

router.include_router(nav_router)
router.include_router(pages_router)
router.include_router(word_router)