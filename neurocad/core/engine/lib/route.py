# core/engine/lib/route.py

from fastapi import APIRouter
from .nav.route import router as nav_router
from .pages.route import router as pages_router
from .word.route import router as word_router
from .base.route import router as base_router
from .balance.route import router as balance_router
from .creatives.route import router as creatives_router
from .backup.route import router as backup_router
from .botinv.route import router as botinv_router
from .llm.route import router as llm_router

router = APIRouter(prefix="/lib", tags=["core/engine/lib"])

router.include_router(nav_router)
router.include_router(pages_router)
router.include_router(word_router)
router.include_router(base_router)
router.include_router(balance_router)
router.include_router(creatives_router)
router.include_router(backup_router)
router.include_router(botinv_router)
router.include_router(llm_router)