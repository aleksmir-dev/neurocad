# core/engine/lib/llm/agents/route.py

"""
Aggregator router for all LLM agents.

Mounted under /core/engine/lib/llm/agents (the parent llm/route.py
includes this with prefix="/agents").

Each agent's own router lives next to its agent.py / prompt.py:

  agents/_01_generate_logo/route.py
  agents/_02_<name>/route.py
  ...

To add a new agent with an HTTP endpoint:

  1. Create agents/_NN_<name>/route.py with
         router = APIRouter(prefix="/_NN_<name>", ...)
  2. Import it below and add router.include_router(...).
"""

from fastapi import APIRouter

from ._01_logo.route import router as generate_logo_router
from ._02_router.route import router as router_router
from ._03_none.route import router as none_router
from ._04_personal.route import router as personal_page_router

router = APIRouter(prefix="/agents", tags=["core/engine/lib/llm/agents"])

router.include_router(generate_logo_router)
router.include_router(router_router)
router.include_router(none_router)
router.include_router(personal_page_router)
