# app/core/main/cards/schema.py

from pydantic import BaseModel
from typing import Optional


class CoreMainCardsNode(BaseModel):
    type: str  # 'folder', 'table', 'module'
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None
    module_id: Optional[int] = None
