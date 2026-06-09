# app/core/node/index/route.py

from typing import Optional
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from ..auth.dependencies import get_current_user
from ....utils.templates import templates
from .cards.route import router as cards_router
from .permissions.route import router as permissions_router
from .modules.route import router as modules_router

router = APIRouter(prefix="/index", tags=["core/node/index"])
router.include_router(cards_router)
router.include_router(permissions_router)
router.include_router(modules_router)


@router.get("/", response_class=HTMLResponse)
async def index(
    request: Request,
    section: int = 1,
    current_user: dict = Depends(get_current_user)  
):
    is_authenticated = current_user is not None
    username = current_user.get('sign') if is_authenticated else None
    is_superadmin = current_user.get('is_superadmin', False) if current_user else False
    print(f'======================= {is_superadmin}')
    return templates.TemplateResponse("core/node/index/index.html", {
        "request": request,
        "is_authenticated": is_authenticated,
        "username": username,
        "user": current_user,
        "section": section,
        "is_superadmin": is_superadmin
    })