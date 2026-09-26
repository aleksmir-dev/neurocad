# neurocad/core/engine/lib/word/llm/websocket/auth.py

"""
AuthMixin — authentication and logging helpers for the WebSocket endpoint.

Two responsibilities:

  1. _authenticate_ws(websocket)
     Decodes the access_token cookie (JWT) and looks up the user via
     CoreAuthService. Returns the user dict, or None if anything fails.
     The endpoint closes the connection with code 4403 when this
     returns None or when the user is not a superadmin.

  2. _log(websocket, level, message, **kwargs)
     Best-effort logger. Writes through `websocket.app.state.log`
     (the shared app logger) if it exists, otherwise to stderr.
     Supports both async and sync logger methods, and both plain
     (`log_info`) and `_sync` (`log_info_sync`) variants.

These methods used to be @staticmethod on CoreEngineLibWordLlmWS. They
are now regular methods on a mixin, so they are called as
`self._authenticate_ws(...)` / `self._log(...)` from the endpoint and
from the dispatchers.

Namespace: CoreEngineLibWordLlmWS (via Base + mixins)
"""

import asyncio
import inspect
from typing import Any, Optional

from fastapi import WebSocket


class AuthMixin:
    """Authentication and logging for the WebSocket endpoint."""

    # ============================================
    # AUTH
    # ============================================

    async def _authenticate_ws(self, websocket: WebSocket) -> Optional[dict]:
        """
        Resolve the current user from the `access_token` cookie.

        Returns:
            The user dict on success, or None on any failure.
            The caller (endpoint) treats None as "close connection
            with code 4403".

        Notes:
          - Cookie is read BEFORE websocket.accept(), which is fine
            for FastAPI/Starlette: cookies are available on the scope
            before the handshake completes.
          - JWT decode uses the project-wide SECRET_KEY and ALGORITHM.
          - User lookup goes through CoreAuthService (async).
        """
        try:
            token = websocket.cookies.get("access_token")
            if not token:
                return None

            from jose import jwt, JWTError
            from neurocad.config import settings

            try:
                payload = jwt.decode(
                    token,
                    settings.SECRET_KEY,
                    algorithms=[settings.ALGORITHM],
                )
            except JWTError:
                return None

            user_id = payload.get("sub")
            if user_id is None:
                return None

            from neurocad.core.auth.service import CoreAuthService
            user = await CoreAuthService.get_user_by_id(int(user_id))
            return user

        except Exception as e:
            print(f"[ws-auth] unexpected error: {e}", flush=True)
            return None

    # ============================================
    # LOGGING BRIDGE
    # ============================================

    async def _log(
        self,
        websocket: WebSocket,
        level: str,
        message: str,
        **kwargs: Any,
    ) -> None:
        """
        Write a log line through app.state.log, else to stderr.

        The app logger may expose:
          - async methods       (`log_info`, `log_warning`, ...)
          - sync methods        (`log_info_sync`, ...)
        We try async first, then sync, then fall through to stderr.

        Never raises — logging must not break the WS handler.
        """
        try:
            log = getattr(websocket.app.state, "log", None)
        except Exception:
            log = None

        if log is not None:
            try:
                # ---- async variant ----
                fn = getattr(log, f"log_{level}", None)
                if fn is None:
                    fn = getattr(log, "log_info", None)

                if fn is not None:
                    if inspect.iscoroutinefunction(fn):
                        # Fire-and-forget: don't block the caller on the
                        # log write.
                        asyncio.create_task(
                            fn(target="ws", message=message, **kwargs)
                        )
                    else:
                        fn(target="ws", message=message, **kwargs)
                    return

                # ---- sync variant ----
                fn_sync = getattr(log, f"log_{level}_sync", None)
                if fn_sync is None:
                    fn_sync = getattr(log, "log_info_sync", None)
                if fn_sync is not None:
                    fn_sync(target="ws", message=message, **kwargs)
                    return

            except Exception as e:
                print(f"[ws][log-fail] {e!r} :: {message}", flush=True)
                return

        # ---- fallback: stderr ----
        print(f"[ws][{level}] {message}", flush=True)