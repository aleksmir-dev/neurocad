# neurocad/utils/cors.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..config import settings


def setup_cors(app: FastAPI) -> None:
    """
    Настройка CORS.

    На локальной разработке (APP_HOST == 127.0.0.1/localhost) CORS
    отключается полностью — фронт и бэк на одном origin, а наличие
    CORSMiddleware с allow_credentials=True ломает WebSocket-handshake.

    На проде — включается с конкретными origin'ами (без "*", т.к.
    при allow_credentials=True wildcard запрещён спецификацией).
    """
    host = settings.APP_HOST

    if host in ("127.0.0.1", "localhost", "::1"):
        # Локальная разработка: CORS не нужен вообще
        return

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            f"https://{host}",
            f"https://www.{host}",
            # сюда добавляй остальные домены явно
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )