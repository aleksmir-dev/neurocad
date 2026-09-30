# neurocad/core/engine/lib/word/llm/websocket/agents.py

"""
Agent registry — maps agent names to their classes.

Used by DispatchMixin to look up the class by the name the router
returned (or by the name hardcoded in the effect_edit / effect_rename
/ create_effect flows).

Keys are the agent names the router and the frontend use. Values are
the classes — DispatchMixin instantiates them per run:

    agent = _AGENTS["fill"]()
    result = await agent.run(...)

All agents inherit CoreEngineLibWordLlmAgentBase and share the same
`run` signature (see agent/base.py).

The "edit", "rename" and "create_effect" agents are NOT returned by
the router in a normal start flow — they are only reachable via their
explicit WS types. To be safe, DispatchMixin and the endpoint's
router-handling block both reject them if the router returns them
anyway.

Namespace: CoreEngineLibWordLlmWS (via Base + mixins)
"""

from ..agent.none import CoreEngineLibWordLlmAgentNone
from ..agent.help import CoreEngineLibWordLlmAgentHelp
from ..agent.create import CoreEngineLibWordLlmAgentCreate
from ..agent.create_page import CoreEngineLibWordLlmAgentCreatePage
from ..agent.fill import CoreEngineLibWordLlmAgentFill
from ..agent.effect import CoreEngineLibWordLlmAgentEffect
from ..agent.edit import CoreEngineLibWordLlmAgentEdit
from ..agent.rename import CoreEngineLibWordLlmAgentRename
from ..agent.create_effect import CoreEngineLibWordLlmAgentCreateEffect


#: Name → agent class.
#:
#:   none          — off-topic requests; no LLM call, no output
#:   help          — questions about the editor itself
#:   create        — build a full page from our blocks (multi-step)
#:   create_page   — build a full page in ONE LLM request (free-form)
#:   fill          — fill one selected element with text/links/alts
#:   effect        — add one ready-made effect class to one element
#:   edit          — rewrite the CSS of one existing effect
#:   rename        — propose a NEW id/label for an existing effect
#:                   (CSS is not changed)
#:   create_effect — generate a draft for a NEW effect
#:
#: edit / rename / create_effect bypass the router: they are
#: dispatched directly from the endpoint by WS message type.
_AGENTS = {
    "none":          CoreEngineLibWordLlmAgentNone,
    "help":          CoreEngineLibWordLlmAgentHelp,
    "create":        CoreEngineLibWordLlmAgentCreate,
    "create_page":   CoreEngineLibWordLlmAgentCreatePage,
    "fill":          CoreEngineLibWordLlmAgentFill,
    "effect":        CoreEngineLibWordLlmAgentEffect,
    "edit":          CoreEngineLibWordLlmAgentEdit,
    "rename":        CoreEngineLibWordLlmAgentRename,
    "create_effect": CoreEngineLibWordLlmAgentCreateEffect,
}