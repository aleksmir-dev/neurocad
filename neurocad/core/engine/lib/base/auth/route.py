# neurocad/core/engine/lib/base/auth/route.py

"""
Auth page routes.

Renders engine.html with config_path pointing at the existing
default/base.json (so the header, menu and footer come for free).
The form itself is passed via `auth_form` in the template context;
engine.js picks it up from <body data-auth-form> and forwards it
to Base, which opens the right BaseAuth form.
"""

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from neurocad.utils.templates import templates, STATIC_VERSION


router = APIRouter(prefix="/auth", tags=["core/engine/lib/base/auth"])

# URL segment → auth_form value passed to Base.
FORMS = {
    "login":    "login",
    "register": "register",
    "profile":  "profile",
    "password": "password",
    "restore":  "restore",
}


def _render(request: Request, form: str) -> HTMLResponse:
    return templates.TemplateResponse(
        request=request,
        name="core/engine/engine.html",
        context={
            "module_name": "base",
            # Use the existing default/base.json — no new configs.
            "config_path": "default/base",
            "params_list": [],
            "static_version": STATIC_VERSION,
            "is_authenticated": True,
            "username": "Гость",
            "auth_required": False,
            "auth_redirect": None,
            # This is what tells Base which form to open.
            "auth_form": FORMS[form],
        },
    )


@router.get("/login", response_class=HTMLResponse)
async def auth_login(request: Request):
    return _render(request, "login")


@router.get("/register", response_class=HTMLResponse)
async def auth_register(request: Request):
    return _render(request, "register")


@router.get("/profile", response_class=HTMLResponse)
async def auth_profile(request: Request):
    return _render(request, "profile")


@router.get("/password/change", response_class=HTMLResponse)
async def auth_password_change(request: Request):
    return _render(request, "password")


@router.get("/restore/request", response_class=HTMLResponse)
async def auth_restore_request(request: Request):
    return _render(request, "restore")


@router.get("/restore/confirm", response_class=HTMLResponse)
async def auth_restore_confirm(request: Request):
    return _render(request, "restore")