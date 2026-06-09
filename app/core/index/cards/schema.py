# app/core/node/index/cards/schema.py

from pydantic import BaseModel
from typing import Optional


class CoreNodeIndexCardsNode(BaseModel):
    type: str  # 'folder', 'table', 'module'
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None
    module_id: Optional[int] = None
