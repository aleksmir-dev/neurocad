# core/engine/lib/llm/agents/_04_personal/schema.py

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class CoreEngineLibLlmAgentsPersonalRequest(BaseModel):
    prompt: str
    stage: Optional[str] = Field(
        default="base",
        description='"brief" | "base" | "effects"',
    )
    target_section: Optional[str] = Field(
        default=None,
        description='Имя секции для stage="effects": "hero" | "projects" | "footer".',
    )
    current_html: Optional[str] = Field(
        default=None,
        description=(
            "HTML целевой секции. Используется только на stage='effects' "
            "как контекст для модели. На stage='base' игнорируется."
        ),
    )
    current_css: Optional[str] = Field(
        default=None,
        description=(
            "[deprecated] Единая строка CSS секции. Оставлено для совместимости. "
            "Используйте css_by_section."
        ),
    )
    css_by_section: Optional[Dict[str, str]] = Field(
        default=None,
        description=(
            'CSS по секциям: {"hero": "...", "projects": "...", "footer": "..."}. '
            "На stage='effects' сервис берёт из этого словаря CSS целевой секции."
        ),
    )
    history: Optional[List[Dict[str, Any]]] = None


class CoreEngineLibLlmAgentsPersonalData(BaseModel):
    # base: HTML секций по ключам; effects: HTML одной (целевой) секции
    html: Optional[str] = None

    # base: CSS одной строкой (склейка css_by_section)
    # effects: CSS только для целевой секции
    css: Optional[str] = None

    # base: CSS по секциям (предпочтительный формат)
    css_by_section: Optional[Dict[str, str]] = Field(
        default=None,
        description='CSS по секциям. Заполняется на stage="base".',
    )

    # effects: какая секция обновлена (эхо target_section)
    section: Optional[str] = Field(
        default=None,
        description='Заполняется на stage="effects".',
    )

    # brief
    question: Optional[str] = None
    ready: Optional[bool] = None

    # brief: предупреждение, если модель ответила не-JSON (fallback)
    warning: Optional[str] = Field(
        default=None,
        description='Заполняется на stage="brief", если модель вернула не-JSON.',
    )


class CoreEngineLibLlmAgentsPersonalResponse(BaseModel):
    success: bool
    data: Optional[CoreEngineLibLlmAgentsPersonalData] = None
    error: Optional[str] = None