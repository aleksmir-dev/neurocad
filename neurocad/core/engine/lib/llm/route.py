# core/engine/lib/llm/route.py

"""
Aggregator router for the LLM layer.

Mounted under /core/engine/lib/llm (the parent lib/route.py includes
this with prefix="/llm").

Structure:
  llm/route.py            ← this file
  llm/agents/route.py     ← aggregates all agent routers
  llm/agents/_NN_<name>/route.py
"""

from fastapi import APIRouter

from .agents.route import router as agents_router
from .disp.route import router as disp_router

router = APIRouter(prefix="/llm", tags=["core/engine/lib/llm"])

router.include_router(agents_router)
router.include_router(disp_router)