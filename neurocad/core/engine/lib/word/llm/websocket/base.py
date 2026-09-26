# neurocad/core/engine/lib/word/llm/websocket/base.py

"""
CoreEngineLibWordLlmWS — the WebSocket endpoint class, assembled
from mixins.

This class exists only to combine the mixins and hold the small bits
of class-level state that cannot live in a mixin:

  - HISTORY_LIMIT   — how many previous chat messages to feed back
                      into an agent as `history`.
  - _cancel_events  — {run_id: asyncio.Event}. Shared across all
                      connections on purpose: a run_id is unique per
                      run, and only one connection owns it at a time.
                      Kept on the class (not on `self`) so the
                      dispatcher, the endpoint, and any future helper
                      can reach the same dict via `self._cancel_events`.

The `_AGENTS` registry itself lives in `agents.py` — this file does
NOT re-declare it. `dispatch.py` imports it directly:

    from .agents import _AGENTS

Mixins are combined in this order:

    EndpointMixin   — llm_ws_endpoint (main loop), small helpers
    DispatchMixin   — _run_agent / _run_effect_edit / _run_create_effect
    ProviderMixin   — _get_provider
    CancelMixin     — _get_cancel_event / _clear_cancel_event /
                      _finish_cancelled / _finish_error / _safe_send
    HistoryMixin    — _load_history / _load_current_page_html
    AuthMixin       — _authenticate_ws / _log

MRO is linear and has no method-name collisions — each mixin owns a
distinct set of methods.

Used by ws.py:

    from .websocket.base import CoreEngineLibWordLlmWS
    _ws_instance = CoreEngineLibWordLlmWS()
    llm_ws_endpoint = _ws_instance.llm_ws_endpoint

Namespace: CoreEngineLibWordLlmWS
"""

import asyncio
from typing import Dict

from .auth import AuthMixin
from .history import HistoryMixin
from .cancel import CancelMixin
from .provider import ProviderMixin
from .dispatch import DispatchMixin
from .endpoint import EndpointMixin


class CoreEngineLibWordLlmWS(
    EndpointMixin,
    DispatchMixin,
    ProviderMixin,
    CancelMixin,
    HistoryMixin,
    AuthMixin,
):
    """WebSocket endpoint + agent dispatcher for the LLM editor."""

    #: How many previous messages (user + assistant) to include as
    #: context when an agent runs. Read by HistoryMixin._load_history.
    HISTORY_LIMIT = 20

    #: Cancel flags — one asyncio.Event per active run.
    #: Class-level on purpose: shared across all connections.
    #: Each mixin reaches this dict via `self._cancel_events`.
    _cancel_events: Dict[int, asyncio.Event] = {}