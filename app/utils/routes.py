# app/utils/routes.py

from fastapi import FastAPI, Request, Depends, Query
from fastapi.responses import RedirectResponse
from ..core.auth.dependencies import get_current_user_optional
from ..core.route import router as core_router        

def setup_routes(app: FastAPI) -> None:
    """Подключение всех роутеров приложения"""
    
    app.include_router(core_router)    
    
    # Корневой маршрут       
    @app.get("/")
    async def root(
        request: Request,
        section: int = Query(None),
        current_user: dict = Depends(get_current_user_optional)
    ):
        if section is None:
            if current_user and current_user.get("is_superadmin"):
                section = 2
            else:
                section = 1
        return RedirectResponse(url=f"/core/main?section={section}")
