# neurocad/core/engine/lib/word/llm/ws.py

"""
Thin re-export for the WebSocket endpoint.

The real code lives in `./websocket/`:

  websocket/base.py      — CoreEngineLibWordLlmWS class (assembled from mixins)
  websocket/endpoint.py  — EndpointMixin: the main WS loop
  websocket/dispatch.py  — DispatchMixin: run_agent / run_effect_edit / run_create_effect
  websocket/provider.py  — ProviderMixin: get_provider
  websocket/cancel.py    — CancelMixin: cancel events, safe_send, finish_cancelled/error
  websocket/history.py   — HistoryMixin: load_history, load_current_page_html
  websocket/auth.py      — AuthMixin: authenticate_ws, log
  websocket/agents.py    — _AGENTS registry

Why this file exists:
  `route.py` does `from .ws import llm_ws_endpoint` and passes it to
  `router.add_api_websocket_route(...)`.

  After the split into mixins, `llm_ws_endpoint` is a REGULAR async
  method on EndpointMixin — it takes `self` as its first parameter.

  If we exported `CoreEngineLibWordLlmWS.llm_ws_endpoint`, that would
  be an UNBOUND function with signature `(self, websocket, page_id)`.
  FastAPI inspects the signature, cannot resolve `self`, and silently
  refuses to register the handler. The WebSocket handshake then fails
  with close code 1006.

  To avoid that, we instantiate the class once and export the BOUND
  method. Its signature becomes `(websocket, page_id)` — exactly what
  FastAPI expects.

  Do NOT replace this with `CoreEngineLibWordLlmWS.llm_ws_endpoint`.
"""

from .websocket.base import CoreEngineLibWordLlmWS


#: The class is stateless apart from class-level attributes
#: (HISTORY_LIMIT and _cancel_events). A single instance is enough
#: for the whole application — all state shared across connections
#: lives on the class, not on the instance.
_ws_instance = CoreEngineLibWordLlmWS()

#: Bound method. Signature: (websocket, page_id).
#: This is what route.py passes to add_api_websocket_route.
llm_ws_endpoint = _ws_instance.llm_ws_endpoint


__all__ = ["CoreEngineLibWordLlmWS", "llm_ws_endpoint"]