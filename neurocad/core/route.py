# app/core/route.py

from fastapi import APIRouter
from .auth.route import router as auth_router
from .engine.route import router as engine_router  # <-- подключение engine

router = APIRouter(prefix="/core", tags=["core"])

router.include_router(auth_router)
router.include_router(engine_router)  