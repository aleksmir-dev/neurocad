# app/core/main/modules/schema.py

from pydantic import BaseModel
from typing import Optional


class ModuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    url: Optional[str] = None


class ModuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None