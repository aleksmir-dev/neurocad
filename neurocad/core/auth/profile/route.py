# app/core/auth/profile/route.py

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from .schema import CoreAuthProfileUpdateRequestSchema
from .service import CoreAuthProfileService
from ..dependencies import CoreAuthDependencies

router = APIRouter(prefix="/profile", tags=["core/auth/profile"])


@router.get("")
async def get_profile(
    request: Request,
    current_user: dict = Depends(CoreAuthDependencies.get_current_user)
) -> JSONResponse:
    """
    Получение профиля текущего пользователя
    
    Требует авторизации
    """
    log = request.app.state.log if hasattr(request.app.state, 'log') else None
    
    profile = await CoreAuthProfileService.get_profile(current_user["id"], log=log)
    
    if not profile:
        return JSONResponse(
            status_code=404,
            content={
                "success": False,
                "message": "Пользователь не найден"
            }
        )
    
    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "data": {
                "user": {
                    "id": profile["id"],
                    "login": profile["login"],
                    "name": profile["name"],
                    "email": profile["email"],
                    "is_superadmin": profile["is_superadmin"],
                    "is_active": profile["is_active"],
                    "last_seen": profile.get("last_seen"),
                    "created_at": profile.get("created_at")
                }
            }
        }
    )


@router.put("")
async def update_profile(
    request: Request,
    profile_data: CoreAuthProfileUpdateRequestSchema,
    current_user: dict = Depends(CoreAuthDependencies.get_current_user)
) -> JSONResponse:
    """
    Обновление профиля текущего пользователя
    
    Требует авторизации
    """
    log = request.app.state.log if hasattr(request.app.state, 'log') else None
    
    result = await CoreAuthProfileService.update_profile(
        user_id=current_user["id"],
        name=profile_data.name,
        email=profile_data.email,
        log=log
    )
    
    if not result["success"]:
        return JSONResponse(
            status_code=400,
            content=result
        )
    
    return JSONResponse(
        status_code=200,
        content=result
    )