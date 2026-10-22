# core/engine/lib/llm/agents/_01_logo/schema.py

"""
Pydantic schemas for the generate_logo HTTP endpoint.

Request / response types only. No business logic here — the route
handles balance, provider, and saving; the service handles the LLM
call. This file is just the wire format.

Classes:
  CoreEngineLibLlmAgentsLogoRequest   — POST body
  CoreEngineLibLlmAgentsLogoData      — inner data of a
                                        successful response
  CoreEngineLibLlmAgentsLogoResponse  — full response
"""

from typing import Optional

from pydantic import BaseModel, Field


class CoreEngineLibLlmAgentsLogoRequest(BaseModel):
    """Body for POST /llm/agents/_01_logo/generate."""

    prompt: str = Field(
        ...,
        min_length=1,
        description="Что нарисовать. Например: 'Нейрокад — CMS нового поколения'.",
    )
    alt: str = Field(
        "",
        description="Alt-текст (необязательно). Используется как подсказка для модели.",
    )
    source: str = Field(
        "logo",
        description="Источник изображения: 'logo' (по умолчанию) или другой.",
    )


class CoreEngineLibLlmAgentsLogoData(BaseModel):
    """Inner data payload of a successful response."""

    id: str = Field(..., description="Идентификатор в реестре изображений.")
    file: str = Field(..., description="Путь к файлу относительно images/.")
    url: str = Field(..., description="Публичный URL для <img src>.")
    bytes: int = Field(0, description="Размер SVG в байтах.")


class CoreEngineLibLlmAgentsLogoResponse(BaseModel):
    """Response for POST /llm/agents/_01_logo/generate."""

    success: bool = True
    data: Optional[CoreEngineLibLlmAgentsLogoData] = None
    error: Optional[str] = None