# neurocad/core/engine/lib/creatives/schema.py

"""
Pydantic schemas for the creatives module.

Namespace: CoreEngineLibCreatives*

Schemas:
  - CreativeCreate / CreativeUpdate — create / update a creative.
  - PlacementCreate / PlacementUpdate — create / update a placement.
  - HitRequest — track a show or a click (public endpoint).
  - TargetActionsRequest — manual input of target actions per day.
  - StatsFilter — filter for the report (period).
"""

from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, Field


# ============================================
# CREATIVE
# ============================================

class CreativeCreate(BaseModel):
    """Request body for creating a creative."""
    name: str = Field(..., min_length=1, max_length=255)
    erid: Optional[str] = Field(None, max_length=64)
    description: Optional[str] = None
    target_url: Optional[str] = Field(None, max_length=2048)
    media_file: Optional[str] = None
    is_active: int = Field(1, description="1 — active, 0 — disabled")

    # ---- Контент блока «Креатив» ----
    # Эти поля используются при генерации готового блока на
    # странице (ReadyBlocks → core-creative). Опциональны:
    # старые креативы без них продолжают работать, блок
    # просто не выводит соответствующую часть.
    text: Optional[str] = Field(
        None,
        description="Рекламный текст — что читает пользователь на странице",
    )
    button_text: Optional[str] = Field(
        None,
        max_length=64,
        description="Текст кнопки-ссылки («Посмотрите здесь»)",
    )

    # ---- Юридические реквизиты ----
    # Обязательны по закону о рекламе, если креатив показывается
    # на публичной странице.
    brand: Optional[str] = Field(
        None,
        max_length=255,
        description="Наименование рекламодателя («ООО «Бегет»»)",
    )
    inn: Optional[str] = Field(
        None,
        max_length=32,
        description="ИНН рекламодателя («7801451618»)",
    )


class CreativeUpdate(BaseModel):
    """Request body for updating a creative. All fields are optional."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    erid: Optional[str] = Field(None, max_length=64)
    description: Optional[str] = None
    target_url: Optional[str] = Field(None, max_length=2048)
    media_file: Optional[str] = None
    is_active: Optional[int] = None

    # ---- Контент блока «Креатив» ----
    text: Optional[str] = None
    button_text: Optional[str] = Field(None, max_length=64)

    # ---- Юридические реквизиты ----
    brand: Optional[str] = Field(None, max_length=255)
    inn: Optional[str] = Field(None, max_length=32)


class CreativeResponse(BaseModel):
    """Response — one creative."""
    id: int
    nav_id: int
    name: str
    erid: Optional[str] = None
    description: Optional[str] = None
    target_url: Optional[str] = None
    media_file: Optional[str] = None
    is_active: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # ---- Контент блока «Креатив» ----
    text: Optional[str] = None
    button_text: Optional[str] = None

    # ---- Юридические реквизиты ----
    brand: Optional[str] = None
    inn: Optional[str] = None


# ============================================
# PLACEMENT
# ============================================

class PlacementCreate(BaseModel):
    """Request body for creating a placement."""
    creative_id: int
    page_id: int
    date_start: Optional[datetime] = None
    date_end: Optional[datetime] = None
    is_active: int = Field(1, description="1 — active, 0 — disabled")


class PlacementUpdate(BaseModel):
    """Request body for updating a placement."""
    page_id: Optional[int] = None
    date_start: Optional[datetime] = None
    date_end: Optional[datetime] = None
    is_active: Optional[int] = None


class PlacementResponse(BaseModel):
    """Response — one placement."""
    id: int
    creative_id: int
    page_id: int
    date_start: Optional[datetime] = None
    date_end: Optional[datetime] = None
    is_active: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # Additional — from JOIN with Creative
    creative_name: Optional[str] = None
    erid: Optional[str] = None


# ============================================
# HIT — tracking
# ============================================

class HitRequest(BaseModel):
    """
    Request body for tracking a show or a click.

    Public endpoint — called by a JS script from the page.
    placement_id — placement ID, hit_type — "show" | "click".
    """
    placement_id: int
    hit_type: str = Field(..., pattern="^(show|click)$")


class HitResponse(BaseModel):
    """Response to tracking. Always success=true if the request is accepted."""
    success: bool = True


# ============================================
# TARGET ACTIONS — manual input
# ============================================

class TargetActionsRequest(BaseModel):
    """
    Request body for manual input of target actions per day.

    One day of one placement — one PlacementStat row.
    """
    placement_id: int
    date: date
    count: int = Field(..., ge=0, description="Number of target actions")


# ============================================
# STATS — report
# ============================================

class StatsFilter(BaseModel):
    """
    Filter for the stats report.

    date_from / date_to — inclusive. Defaults to the current month.
    """
    date_from: Optional[date] = None
    date_to: Optional[date] = None


class StatsItem(BaseModel):
    """One report row — per placement for the period."""
    placement_id: int
    creative_id: int
    creative_name: str
    erid: Optional[str] = None
    page_id: int
    shows: int = 0
    clicks: int = 0
    target_actions: int = 0


class StatsResponse(BaseModel):
    """Response — list of report rows."""
    items: list[StatsItem]
    total: int = 0