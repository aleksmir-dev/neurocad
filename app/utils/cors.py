# app/utils/cors.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Response

def setup_cors(app: FastAPI) -> None:
    """Настройка CORS для приложения"""
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    

