# app/core/auth/restore/route.py

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .schema import CoreAuthRestoreRequestSchema, CoreAuthRestoreConfirmRequestSchema
from .service import CoreAuthRestoreService

router = APIRouter(prefix="/restore", tags=["core/auth/restore"])


@router.post("/request")
async def restore_request(request: Request, restore_data: CoreAuthRestoreRequestSchema) -> JSONResponse:
    """
    Запрос на восстановление пароля
    
    Отправляет инструкцию на email (в текущей реализации возвращает токен)
    """
    log = request.app.state.log if hasattr(request.app.state, 'log') else None
    
    result = await CoreAuthRestoreService.create_reset_token(
        login_or_email=restore_data.login_or_email,
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


@router.post("/confirm")
async def restore_confirm(request: Request, confirm_data: CoreAuthRestoreConfirmRequestSchema) -> JSONResponse:
    """
    Подтверждение восстановления пароля
    
    Устанавливает новый пароль по токену
    """
    log = request.app.state.log if hasattr(request.app.state, 'log') else None
    
    result = await CoreAuthRestoreService.confirm_reset_password(
        token=confirm_data.token,
        new_password=confirm_data.new_password,
        new_password_confirm=confirm_data.new_password_confirm,
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