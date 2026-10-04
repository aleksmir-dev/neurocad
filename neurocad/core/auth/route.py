# app/core/auth/route.py

from fastapi import APIRouter

from .login.route import router as login_router
from .register.route import router as register_router
from .password.route import router as password_router
from .restore.route import router as restore_router
from .profile.route import router as profile_router
from .impersonate.route import router as impersonate_router

router = APIRouter(prefix="/auth", tags=["auth"])

# Mount every sub-router.
router.include_router(login_router)
router.include_router(register_router)
router.include_router(password_router)
router.include_router(restore_router)
router.include_router(profile_router)
router.include_router(impersonate_router)