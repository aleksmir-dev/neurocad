# neurocad/core/engine/lib/word/llm/step.py

"""
Multi-step LLM flow: plan → fill → effects → svg-illustrations.

Namespace: CoreEngineLibWordLlmStep

This module is a thin facade: each static method delegates to the
corresponding module in `steps/`. The split exists so that the four
steps — which are large and independent — live in their own files.

    steps/plan.py     — step_plan
    steps/fill.py     — step_fill
    steps/effects.py  — step_effects
    steps/svg.py      — step_svg_illustrations
    steps/common.py   — shared helpers (logging, JSON/SVG parsing, ...)

The public API of `CoreEngineLibWordLlmStep` is unchanged: all
existing callers (agent/create.py, agent/fill.py, agent/effect.py, ...)
continue to work without modification.

Generator protocol
------------------
Every step is an async generator that yields progress events and, in
the end, yields a final result. The caller (an agent in agent/)
consumes the events and forwards them to the client.

Every yield is a dict with a "type" field:

  Progress events (intermediate, may repeat):
    {"type": "step",          "step": "planning", "message": "..."}
    {"type": "plan",          "blocks": [...]}
    {"type": "step",          "step": "filling",  "message": "..."}
    {"type": "fill_progress", "request": 1, "total": 3, "block_ids": [...]}
    {"type": "step",          "step": "effects",  "message": "..."}
    {"type": "step",          "step": "svg",      "message": "..."}
    {"type": "svg_progress",  "current": 2, "total": 6, "alt": "..."}

  Final event (exactly one at the end):
    {"type": "result", "html": "...", "message": "..."}

On error:
    {"type": "error", "message": "..."}

Logging: uses provider.log (app.state.log, passed via the provider).
"""

from .steps.plan import step_plan
from .steps.fill import step_fill
from .steps.effects import step_effects
from .steps.svg import step_svg_illustrations


class CoreEngineLibWordLlmStep:
    """Static multi-step LLM flow (facade over steps/*.py)."""

    step_plan = staticmethod(step_plan)
    step_fill = staticmethod(step_fill)
    step_effects = staticmethod(step_effects)
    step_svg_illustrations = staticmethod(step_svg_illustrations)