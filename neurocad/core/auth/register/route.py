# app/core/auth/register/route.py

from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse

from .schema import CoreAuthRegisterRequestSchema
from .service import CoreAuthRegisterService
from ..dependencies import CoreAuthDependencies
from ..validators import validate_login, normalize_login, slugify_login
from ..service import CoreAuthService

router = APIRouter(prefix="/register", tags=["core/auth/register"])


# ============================================
# CHECK LOGIN (public, live-check for the signup form)
# ============================================

@router.get("/check-login")
async def check_login(request: Request, login: str) -> JSONResponse:
    """
    Публичная проверка логина для формы регистрации.

    Возвращает:
        {
          "available": bool,
          "reason": "invalid" | "taken" | None,
          "error": str | None
        }

    Ничего не пишет в БД, только читает. Дешёвый эндпоинт —
    фронт вызывает его с debounce ~400 мс после последнего
    нажатия клавиши.

    Позже, если появится нагрузка от ботов, навесьте rate-limit
    по IP (slowapi или свой middleware).
    """
    log = request.app.state.log if hasattr(request.app.state, "log") else None

    # ---- 1. Формат ----
    err = validate_login(login)
    if err:
        return JSONResponse({
            "available": False,
            "reason": "invalid",
            "error": err,
        })

    normalized = normalize_login(login)
    slug = slugify_login(normalized)

    # ---- 2. Логин занят ----
    if await CoreAuthService.is_login_taken(normalized, log=log):
        return JSONResponse({
            "available": False,
            "reason": "taken",
            "error": "Этот логин уже занят",
        })

    # ---- 3. Slug занят (другой логин → тот же поддомен) ----
    if await CoreAuthService.is_slug_taken(slug, log=log):
        return JSONResponse({
            "available": False,
            "reason": "taken",
            "error": "Этот логин уже занят",
        })

    # ---- 4. Свободен ----
    return JSONResponse({
        "available": True,
        "reason": None,
        "error": None,
    })


# ============================================
# REGISTER
# ============================================

@router.post("")
async def register(request: Request, register_data: CoreAuthRegisterRequestSchema) -> JSONResponse:
    """
    Регистрация нового пользователя.
    """
    log = request.app.state.log if hasattr(request.app.state, 'log') else None

    result = await CoreAuthRegisterService.register_user(
        login=register_data.login,
        password=register_data.password,
        password_confirm=register_data.password_confirm,
        name=register_data.name,
        email=register_data.email,
        log=log
    )

    if not result["success"]:
        return JSONResponse(
            status_code=400,
            content=result
        )

    return JSONResponse(
        status_code=201,
        content=result
    )


# ============================================
# DELETE USER (superadmin only)
# ============================================

@router.delete("/{user_id}")
async def delete_user(
    request: Request,
    user_id: int,
    current_user: dict = Depends(CoreAuthDependencies.get_current_user)
) -> JSONResponse:
    """
    Удаление пользователя (мягкое удаление).

    Только для суперпользователей.
    """
    log = request.app.state.log if hasattr(request.app.state, 'log') else None

    # Проверяем права
    if not current_user.get("is_superadmin"):
        if log:
            await log.log_warning(target="auth", message=f"User {current_user['id']} tried to delete user {user_id} without permissions")
        return JSONResponse(
            status_code=403,
            content={
                "success": False,
                "message": "Недостаточно прав для удаления пользователя"
            }
        )

    # Проверяем, что не удаляем самого себя
    if current_user["id"] == user_id:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": "Нельзя удалить самого себя"
            }
        )

    # Мягкое удаление (устанавливаем is_delete = True)
    result = await CoreAuthService.update_user(user_id, log=log, is_delete=True)

    if not result:
        return JSONResponse(
            status_code=404,
            content={
                "success": False,
                "message": "Пользователь не найден"
            }
        )

    if log:
        await log.log_info(target="auth", message=f"User {user_id} deleted by {current_user['login']}")

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": "Пользователь успешно удалён"
        }
    )