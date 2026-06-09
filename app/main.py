# app/main.py

from fastapi import FastAPI
from .config import settings
from .utils.cors import setup_cors
from .utils.static import setup_static
from .utils.lifespan import get_lifespan
from .utils.routes import setup_routes

# Создаём приложение
app = FastAPI(
    title="СУДПО",
    description="Управление данными УЦ",
    version="0.1.0",
    debug=settings.DEBUG,
    lifespan=get_lifespan()
)

# Настройки
setup_cors(app)
setup_static(app)
setup_routes(app)

# Запуск (только при прямом запуске, не при импорте)
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        reload=settings.DEBUG
    )
