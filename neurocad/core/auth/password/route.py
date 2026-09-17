# app/core/auth/password/route.py

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from .schema import CoreAuthPasswordChangeRequestSchema
from .service import CoreAuthPasswordService
from ..dependencies import CoreAuthDependencies

router = APIRouter(prefix="/password", tags=["core/auth/password"])


@router.post("/change")
async def change_password(
    request: Request,
    password_data: CoreAuthPasswordChangeRequestSchema,
    current_user: dict = Depends(CoreAuthDependencies.get_current_user)
) -> JSONResponse:
    """
    Смена пароля пользователя
    
    Требует авторизации
    """
    log = request.app.state.log if hasattr(request.app.state, 'log') else None
    
    result = await CoreAuthPasswordService.change_password(
        user_id=current_user["id"],
        current_password=password_data.current_password,
        new_password=password_data.new_password,
        new_password_confirm=password_data.new_password_confirm,
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