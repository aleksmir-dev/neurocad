# app/core/node/auth/route.py

from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from .schema import UserOut
from .service import AuthService
from .dependencies import create_access_token, get_current_user
from ....config import settings
from ....utils.templates import templates  # единый шаблон

router = APIRouter(prefix="/core/node/auth", tags=["core/node/auth"])


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request, redirect: str = None):
    """Страница входа"""
    return templates.TemplateResponse("core/node/auth/login/login.html", {
        "request": request,
        "redirect": redirect,
        "error": None
    })


@router.post("/login")
async def login(request: Request):
    """Обработка формы входа — устанавливает cookie с токеном"""
    form = await request.form()
    login = form.get("login")
    password = form.get("password")
    redirect_url = form.get("redirect") or "/"
    
    user = await AuthService.login(login, password)
    
    if not user:
        return templates.TemplateResponse("core/node/auth/login/login.html", {
            "request": request,
            "redirect": redirect_url,
            "error": "Неверный логин или пароль"
        })
    
    access_token = create_access_token(data={"sub": str(user["user_id"])})
    
    response = RedirectResponse(url=redirect_url, status_code=302)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    return response


@router.get("/profile", response_model=UserOut)
async def get_profile(current_user: dict = Depends(get_current_user)):
    return current_user


@router.get("/logout")
async def logout():
    response = RedirectResponse(url="/core/node/auth/login", status_code=302)
    response.delete_cookie("access_token")
    return response
