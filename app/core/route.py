# app/core/route.py

from fastapi import APIRouter
from .auth.route import router as auth_router
from .main.route import router as main_router

router = APIRouter(prefix="/core", tags=["core"])

router.include_router(auth_router)
router.include_router(main_router) 
    




