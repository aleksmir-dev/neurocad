# neurocad/core/engine/lib/word/llm/websocket/dispatch.py

"""
DispatchMixin — four run methods, one per WS request type.

  _run_agent          — type: "start" (router + agent)
  _run_effect_edit    — type: "effect_edit"
  _run_effect_rename  — type: "effect_rename"
  _run_create_effect  — type: "create_effect"

Every method:
    1. _check_balance() — tokens + free guard (llm_allowed).
    2. _run_agent only: if the router picks the "create" agent,
       additionally checks gen > 0 on pro (logo_allowed).
    3. Runs the agent.
    4. _charge_tokens() — tokens -= provider.tokens_used.
    5. _run_agent only: _charge_gen() — gen -= 1 for create on pro.
    6. Clears the cancel event.

Cancel semantics: the server never aborts an in-flight LLM request.
We wait for the current call to finish, then check
`cancel_event.is_set()` and stop.

Balance errors:
    'llm_not_available' — free tariff; LLM is disabled.
    'tokens_exhausted'  — pro / llm; tokens have run out.
    'gen_exhausted'     — pro; gen has run out (generation request).
    'no_balance'        — no Balance row for this user.

Result frames sent to the client (see `_run_agent`):
    html_update       — replace the whole canvas (create / create_page)
    page_css_update   — replace the whole page CSS (create_page)
    element_update    — replace one element (fill / effect)
    assistant_message — text for the chat
    done              — end of the run

Namespace: CoreEngineLibWordLlmWS (via Base + mixins)
"""

import traceback
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import WebSocket
from sqlalchemy import select

from .agents import _AGENTS


# Human-readable messages for balance errors. Kept next to the
# guard so the wording lives in one place.
_BALANCE_ERROR_MESSAGES = {
    "llm_not_available": (
        "LLM-чат недоступен на тарифе Free. "
        "Перейдите на тариф Pro или LLM, чтобы пользоваться чатом."
    ),
    "tokens_exhausted": (
        "Закончились токены LLM на этот месяц. "
        "Они восстановятся в расчётный день или при смене тарифа."
    ),
    "gen_exhausted": (
        "Закончились генерации страниц на этот месяц. "
        "Они восстановятся в расчётный день или при смене тарифа."
    ),
    "no_balance": (
        "Не удалось определить ваш тариф. "
        "Обратитесь к администратору."
    ),
}


class DispatchMixin:
    """Run methods for the four WS request types."""

    # ============================================
    # BALANCE GUARD
    # ============================================

    async def _send_balance_error(
        self,
        websocket: WebSocket,
        run_id: int,
        err: str,
        user_id: Optional[int] = None,
    ) -> None:
        """
        Send a balance error frame + done, update the run status.

        `err` is the code from BalanceChecked (llm_not_available,
        tokens_exhausted, gen_exhausted, no_balance).
        """
        from ..runs import CoreEngineLibWordLlmRuns

        message = _BALANCE_ERROR_MESSAGES.get(err, "Лимит исчерпан.")

        try:
            await CoreEngineLibWordLlmRuns.update_run_status(
                run_id,
                status="failed",
                message="Лимит исчерпан",
                error=err,
            )
        except Exception:
            pass

        await self._safe_send(
            websocket,
            {"type": "error", "code": err, "message": message},
        )
        await self._safe_send(
            websocket, {"type": "done", "run_id": run_id}
        )

    async def _check_balance(
        self,
        websocket: WebSocket,
        run_id: int,
    ) -> Optional[Any]:
        """
        Check whether the current user may run an LLM request.

        Uses BalanceChecked.llm_allowed — blocks free users and
        users with no tokens left.

        Returns the Balance object on success, or None if blocked
        (error frame already sent).
        """
        from neurocad.core.engine.lib.balance.checked import BalanceChecked

        user_id = getattr(websocket.state, "user_id", None)
        if not user_id:
            await self._log(
                websocket, "warning",
                f"[balance] run {run_id}: no user_id on websocket.state",
            )
            await self._send_balance_error(
                websocket, run_id, "no_balance", user_id=None,
            )
            return None

        log = getattr(websocket.app.state, "log", None)

        bal, err = await BalanceChecked.llm_allowed(user_id, log=log)
        if err:
            await self._log(
                websocket, "info",
                f"[balance] run {run_id} blocked for user {user_id}: {err}",
            )
            await self._send_balance_error(
                websocket, run_id, err, user_id=user_id,
            )
            return None

        return bal

    async def _check_generation(
        self,
        websocket: WebSocket,
        run_id: int,
    ) -> bool:
        """
        Additional guard for generation requests (create-agent).

        Uses BalanceChecked.logo_allowed — on pro also requires
        gen > 0. Returns True if the request may proceed, False if
        blocked (error frame already sent).
        """
        from neurocad.core.engine.lib.balance.checked import BalanceChecked

        user_id = getattr(websocket.state, "user_id", None)
        if not user_id:
            return False

        log = getattr(websocket.app.state, "log", None)

        _bal, err = await BalanceChecked.logo_allowed(user_id, log=log)
        if err:
            await self._log(
                websocket, "info",
                f"[balance] run {run_id} generation blocked "
                f"for user {user_id}: {err}",
            )
            await self._send_balance_error(
                websocket, run_id, err, user_id=user_id,
            )
            return False

        return True

    # ============================================
    # CHARGE
    # ============================================

    async def _charge_tokens(
        self,
        websocket: WebSocket,
        provider: Any,
    ) -> None:
        """
        Charge `provider.tokens_used` to the current user's Balance.

        Called after the agent returns successfully. If the provider
        has no `tokens_used` (0), nothing happens.

        Updates Balance.tokens (clamped at 0) and updated_at.
        """
        from neurocad.core.models.balance import Balance
        from neurocad.utils.sqlite import get_db_sqlite

        user_id = getattr(websocket.state, "user_id", None)
        usage = int(getattr(provider, "tokens_used", 0) or 0)

        if not user_id or usage <= 0:
            return

        try:
            async for session in get_db_sqlite():
                stmt = select(Balance).where(
                    Balance.user_id == user_id,
                    Balance.is_delete.is_(False),
                )
                bal = (await session.execute(stmt)).scalar_one_or_none()
                if bal is None:
                    return
                bal.tokens = max(0, (bal.tokens or 0) - usage)
                bal.updated_at = datetime.now()
                await session.commit()
                await self._log(
                    websocket, "info",
                    f"[balance] user {user_id} charged {usage} tokens "
                    f"(left {bal.tokens})",
                )
                return
        except Exception as e:
            await self._log(
                websocket, "warning",
                f"[balance] charge tokens failed for user {user_id}: {e}",
            )

    async def _charge_gen(
        self,
        websocket: WebSocket,
        agent_name: str,
    ) -> None:
        """
        Charge 1 generation for the create-agent on pro.

        Free / llm — no charge (free is blocked earlier; llm is
        unlimited). Only runs when agent_name == "create".

        Called after agent.run() returns, so an LLM failure costs
        nothing.
        """
        from neurocad.core.models.balance import Balance
        from neurocad.utils.sqlite import get_db_sqlite

        if agent_name != "create":
            return

        user_id = getattr(websocket.state, "user_id", None)
        if not user_id:
            return

        try:
            async for session in get_db_sqlite():
                stmt = select(Balance).where(
                    Balance.user_id == user_id,
                    Balance.is_delete.is_(False),
                )
                bal = (await session.execute(stmt)).scalar_one_or_none()
                if bal is None:
                    return
                # Only pro pays with gen.
                if bal.tarif != 1:
                    return
                bal.gen = max(0, (bal.gen or 0) - 1)
                bal.updated_at = datetime.now()
                await session.commit()
                await self._log(
                    websocket, "info",
                    f"[balance] user {user_id} charged 1 gen "
                    f"(left {bal.gen})",
                )
                return
        except Exception as e:
            await self._log(
                websocket, "warning",
                f"[balance] charge gen failed for user {user_id}: {e}",
            )

    # ============================================
    # TYPE: start — router then agent
    # ============================================

    async def _run_agent(
        self,
        websocket: WebSocket,
        page_id: int,
        run_id: int,
        user_message: str,
        block_catalog: list,
        selection: Optional[Dict[str, Any]] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> None:
        """
        Route the request to one agent and send the result to the client.

        Steps:
          0a. Balance guard — refuse if the user cannot run an LLM call.
          1.  Resolve the provider (mock or real, from the DB).
          2.  Dump meta for this run (for post-mortem debugging).
          3.  Load the current page HTML (for router state + agents).
          4.  Ask the router which agent should handle the request.
          0b. If the router picked "create" — generation guard (gen > 0 on pro).
          5.  Run that agent and send its result to the client.
          6.  Charge tokens + (for create on pro) 1 gen.

        Result frames (see module docstring):
          - html_update       — replace canvas (create / create_page)
          - page_css_update   — replace page CSS (create_page)
          - element_update    — replace one element (fill / effect)
          - assistant_message — text for chat
          - done              — end of run
        """
        from ..runs import CoreEngineLibWordLlmRuns
        from ..service import CoreEngineLibWordLlmService
        from ..dumper import CoreEngineLibWordLlmDumper
        from ..agent.router import CoreEngineLibWordLlmRouter

        # ---- 0a. BALANCE GUARD (tokens + free) ----
        bal = await self._check_balance(websocket, run_id)
        if bal is None:
            return

        cancel_event = self._get_cancel_event(run_id)

        log = getattr(websocket.app.state, "log", None)
        provider = await self._get_provider(log=log)

        history = history or []

        CoreEngineLibWordLlmDumper.dump_meta(
            run_id=run_id,
            page_id=page_id,
            user_message=user_message,
            block_catalog=block_catalog,
            provider_name=provider.name,
            model=provider.model,
        )

        current_html = await self._load_current_page_html(page_id)

        async def _emit(msg: dict) -> None:
            await self._safe_send(websocket, msg)

        try:
            # ---- ROUTER ----
            await CoreEngineLibWordLlmRuns.update_run_status(
                run_id,
                status="planning",
                step=1,
                message="Определяю действие...",
            )

            routing = await CoreEngineLibWordLlmRouter.route(
                provider=provider,
                user_message=user_message,
                selection=selection,
                current_html=current_html,
                run_id=run_id,
                emit=_emit,
            )
            agent_name = routing.get("agent", "help")
            target = routing.get("target")

            # "edit", "create_effect" and "rename" are only reachable
            # via their explicit WS types. Fall back to help if the
            # router returned them in a start flow.
            if agent_name in ("edit", "create_effect", "rename"):
                agent_name = "help"
                target = None

            if cancel_event.is_set():
                await self._finish_cancelled(websocket, run_id)
                return

            # ---- 0b. GENERATION GUARD (only for create) ----
            if agent_name == "create":
                ok = await self._check_generation(websocket, run_id)
                if not ok:
                    return

            # ---- NO TARGET FOR fill / effect ----
            has_element = bool((selection or {}).get("selector"))
            if agent_name in ("fill", "effect") and not has_element:
                msg_text = "Выделите элемент на странице мышкой и повторите запрос."
                await self._log(
                    websocket,
                    "info",
                    f"[run-agent] run {run_id} {agent_name} without selection "
                    f"— asking user to select",
                )
                try:
                    await CoreEngineLibWordLlmService.save_chat_message(
                        page_id=page_id,
                        role="assistant",
                        content=msg_text,
                    )
                except Exception as e:
                    await self._log(
                        websocket,
                        "warning",
                        f"[ws] save assistant msg failed: {e}",
                    )
                await CoreEngineLibWordLlmRuns.update_run_status(
                    run_id,
                    status="failed",
                    message="Не выделен элемент",
                    error="selection required",
                )
                await self._safe_send(
                    websocket,
                    {"type": "assistant_message", "content": msg_text},
                )
                await self._safe_send(
                    websocket,
                    {"type": "done", "run_id": run_id},
                )
                return

            # ---- AGENT ----
            agent_cls = _AGENTS.get(agent_name)
            if agent_cls is None:
                agent_cls = _AGENTS["help"]

            await CoreEngineLibWordLlmRuns.update_run_status(
                run_id,
                status="filling",
                step=2,
                message="Обрабатываю запрос...",
            )

            agent = agent_cls()
            result = await agent.run(
                provider=provider,
                user_message=user_message,
                page_id=page_id,
                run_id=run_id,
                emit=_emit,
                selection=selection,
                block_catalog=block_catalog,
                current_html=current_html,
                history=history,
            )

            if cancel_event.is_set():
                await self._finish_cancelled(websocket, run_id)
                return

            # ---- CHARGE ----
            await self._charge_tokens(websocket, provider)
            await self._charge_gen(websocket, agent_name)

            # ---- RESULT ----
            message = result.get("message") or ""
            html = result.get("html")
            css = result.get("css")              # ← from create_page
            selector = result.get("selector")
            element_html = result.get("element_html")

            # Sanity: element_html must look like HTML.
            if selector and element_html:
                trimmed = str(element_html).strip()
                if not trimmed.startswith("<"):
                    selector = None
                    element_html = None

            try:
                await CoreEngineLibWordLlmService.save_chat_message(
                    page_id=page_id,
                    role="assistant",
                    content=message,
                )
            except Exception as e:
                await self._log(
                    websocket,
                    "warning",
                    f"[ws] save assistant msg failed: {e}",
                )

            if html and str(html).strip().startswith("<"):
                final_html = html
            elif element_html and str(element_html).strip().startswith("<"):
                final_html = element_html
            else:
                final_html = ""
            await CoreEngineLibWordLlmRuns.set_run_final(
                run_id,
                final_html,
                message=message,
            )

            # ---- html_update — replace canvas ----
            if html and str(html).strip().startswith("<"):
                await self._safe_send(
                    websocket,
                    {"type": "html_update", "html": html},
                )

            # ---- page_css_update — replace page CSS (create_page) ----
            if css and str(css).strip():
                await self._safe_send(
                    websocket,
                    {"type": "page_css_update", "css": css},
                )

            # ---- element_update — replace one element (fill / effect) ----
            if selector and element_html:
                await self._safe_send(
                    websocket,
                    {
                        "type": "element_update",
                        "selector": selector,
                        "html": element_html,
                    },
                )

            if message:
                await self._safe_send(
                    websocket,
                    {"type": "assistant_message", "content": message},
                )

            await self._safe_send(
                websocket,
                {"type": "done", "run_id": run_id},
            )

        except Exception as e:
            await self._log(
                websocket,
                "error",
                f"[run-agent] run {run_id} crashed: {e}\n{traceback.format_exc()}",
            )
            await self._finish_error(
                websocket,
                run_id,
                f"Внутренняя ошибка: {e}",
            )

        finally:
            self._clear_cancel_event(run_id)

    # ============================================
    # TYPE: effect_edit
    # ============================================

    async def _run_effect_edit(
        self,
        websocket: WebSocket,
        page_id: int,
        run_id: int,
        user_message: str,
        effect_id: str,
        effect_css: str,
        effect_label: Optional[str] = None,
        existing_effect_ids: Optional[List[str]] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> None:
        """Run the "edit" agent directly."""
        from ..runs import CoreEngineLibWordLlmRuns
        from ..service import CoreEngineLibWordLlmService
        from ..dumper import CoreEngineLibWordLlmDumper

        # ---- BALANCE GUARD ----
        bal = await self._check_balance(websocket, run_id)
        if bal is None:
            return

        cancel_event = self._get_cancel_event(run_id)

        log = getattr(websocket.app.state, "log", None)
        provider = await self._get_provider(log=log)

        history = history or []

        CoreEngineLibWordLlmDumper.dump_meta(
            run_id=run_id,
            page_id=page_id,
            user_message=user_message,
            block_catalog=[],
            provider_name=provider.name,
            model=provider.model,
        )

        async def _emit(msg: dict) -> None:
            await self._safe_send(websocket, msg)

        try:
            await CoreEngineLibWordLlmRuns.update_run_status(
                run_id,
                status="filling",
                step=1,
                message="Готовлю правку эффекта...",
            )

            agent = _AGENTS["edit"]()
            result = await agent.run(
                provider=provider,
                user_message=user_message,
                page_id=page_id,
                run_id=run_id,
                emit=_emit,
                selection=None,
                block_catalog=None,
                current_html=None,
                history=history,
                effect_id=effect_id,
                effect_css=effect_css,
                effect_label=effect_label,
                existing_effect_ids=existing_effect_ids,
            )

            if cancel_event.is_set():
                await self._finish_cancelled(websocket, run_id)
                return

            # ---- CHARGE TOKENS ----
            await self._charge_tokens(websocket, provider)

            message = result.get("message") or ""
            css = result.get("css")
            result_effect_id = result.get("effect_id")
            new_id = result.get("new_id")
            new_label = result.get("new_label")

            try:
                await CoreEngineLibWordLlmService.save_chat_message(
                    page_id=page_id,
                    role="assistant",
                    content=message,
                )
            except Exception as e:
                await self._log(
                    websocket,
                    "warning",
                    f"[ws] save assistant msg failed: {e}",
                )

            final_html = css if css else ""
            await CoreEngineLibWordLlmRuns.set_run_final(
                run_id,
                final_html,
                message=message,
            )

            if css and result_effect_id:
                payload: Dict[str, Any] = {
                    "type": "css_update",
                    "effect_id": result_effect_id,
                    "css": css,
                    "new_id": new_id,
                    "new_label": new_label,
                }
                await self._safe_send(websocket, payload)

            if message:
                await self._safe_send(
                    websocket,
                    {"type": "assistant_message", "content": message},
                )

            await self._safe_send(
                websocket,
                {"type": "done", "run_id": run_id},
            )

        except Exception as e:
            await self._log(
                websocket,
                "error",
                f"[run-effect-edit] run {run_id} crashed: {e}\n"
                f"{traceback.format_exc()}",
            )
            await self._finish_error(
                websocket,
                run_id,
                f"Внутренняя ошибка: {e}",
            )

        finally:
            self._clear_cancel_event(run_id)

    # ============================================
    # TYPE: effect_rename
    # ============================================

    async def _run_effect_rename(
        self,
        websocket: WebSocket,
        page_id: int,
        run_id: int,
        user_message: str,
        effect_id: str,
        effect_css: str,
        effect_label: Optional[str] = None,
        existing_effect_ids: Optional[List[str]] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> None:
        """Run the "rename" agent directly."""
        from ..runs import CoreEngineLibWordLlmRuns
        from ..service import CoreEngineLibWordLlmService
        from ..dumper import CoreEngineLibWordLlmDumper

        # ---- BALANCE GUARD ----
        bal = await self._check_balance(websocket, run_id)
        if bal is None:
            return

        cancel_event = self._get_cancel_event(run_id)

        log = getattr(websocket.app.state, "log", None)
        provider = await self._get_provider(log=log)

        history = history or []

        CoreEngineLibWordLlmDumper.dump_meta(
            run_id=run_id,
            page_id=page_id,
            user_message=user_message,
            block_catalog=[],
            provider_name=provider.name,
            model=provider.model,
        )

        async def _emit(msg: dict) -> None:
            await self._safe_send(websocket, msg)

        try:
            await CoreEngineLibWordLlmRuns.update_run_status(
                run_id,
                status="filling",
                step=1,
                message="Придумываю новое название...",
            )

            agent = _AGENTS["rename"]()
            result = await agent.run(
                provider=provider,
                user_message=user_message,
                page_id=page_id,
                run_id=run_id,
                emit=_emit,
                selection=None,
                block_catalog=None,
                current_html=None,
                history=history,
                effect_id=effect_id,
                effect_css=effect_css,
                effect_label=effect_label,
                existing_effect_ids=existing_effect_ids,
            )

            if cancel_event.is_set():
                await self._finish_cancelled(websocket, run_id)
                return

            # ---- CHARGE TOKENS ----
            await self._charge_tokens(websocket, provider)

            message = result.get("message") or ""
            css = result.get("css")
            result_effect_id = result.get("effect_id")
            new_label = result.get("new_label")
            new_media = result.get("new_media")

            try:
                await CoreEngineLibWordLlmService.save_chat_message(
                    page_id=page_id,
                    role="assistant",
                    content=message,
                )
            except Exception as e:
                await self._log(
                    websocket,
                    "warning",
                    f"[ws] save assistant msg failed: {e}",
                )

            final_html = css if css else ""
            await CoreEngineLibWordLlmRuns.set_run_final(
                run_id,
                final_html,
                message=message,
            )

            if css and result_effect_id:
                payload: Dict[str, Any] = {
                    "type": "css_update",
                    "effect_id": result_effect_id,
                    "css": css,
                    "new_label": new_label,
                    "new_media": new_media,
                }
                await self._safe_send(websocket, payload)

            if message:
                await self._safe_send(
                    websocket,
                    {"type": "assistant_message", "content": message},
                )

            await self._safe_send(
                websocket,
                {"type": "done", "run_id": run_id},
            )

        except Exception as e:
            await self._log(
                websocket,
                "error",
                f"[run-effect-rename] run {run_id} crashed: {e}\n"
                f"{traceback.format_exc()}",
            )
            await self._finish_error(
                websocket,
                run_id,
                f"Внутренняя ошибка: {e}",
            )

        finally:
            self._clear_cancel_event(run_id)

    # ============================================
    # TYPE: create_effect
    # ============================================

    async def _run_create_effect(
        self,
        websocket: WebSocket,
        page_id: int,
        run_id: int,
        user_message: str,
        previous_draft: Optional[Dict[str, Any]] = None,
        existing_effect_ids: Optional[List[str]] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> None:
        """Run the "create_effect" agent directly."""
        from ..runs import CoreEngineLibWordLlmRuns
        from ..service import CoreEngineLibWordLlmService
        from ..dumper import CoreEngineLibWordLlmDumper

        # ---- BALANCE GUARD ----
        bal = await self._check_balance(websocket, run_id)
        if bal is None:
            return

        cancel_event = self._get_cancel_event(run_id)

        log = getattr(websocket.app.state, "log", None)
        provider = await self._get_provider(log=log)

        history = history or []

        CoreEngineLibWordLlmDumper.dump_meta(
            run_id=run_id,
            page_id=page_id,
            user_message=user_message,
            block_catalog=[],
            provider_name=provider.name,
            model=provider.model,
        )

        async def _emit(msg: dict) -> None:
            await self._safe_send(websocket, msg)

        try:
            await CoreEngineLibWordLlmRuns.update_run_status(
                run_id,
                status="filling",
                step=1,
                message="Придумываю эффект...",
            )

            agent = _AGENTS["create_effect"]()
            result = await agent.run(
                provider=provider,
                user_message=user_message,
                page_id=page_id,
                run_id=run_id,
                emit=_emit,
                selection=None,
                block_catalog=None,
                current_html=None,
                history=history,
                previous_draft=previous_draft,
                existing_effect_ids=existing_effect_ids,
            )

            if cancel_event.is_set():
                await self._finish_cancelled(websocket, run_id)
                return

            # ---- CHARGE TOKENS ----
            await self._charge_tokens(websocket, provider)

            message = result.get("message") or ""
            draft = result.get("draft")

            try:
                await CoreEngineLibWordLlmService.save_chat_message(
                    page_id=page_id,
                    role="assistant",
                    content=message,
                )
            except Exception as e:
                await self._log(
                    websocket,
                    "warning",
                    f"[ws] save assistant msg failed: {e}",
                )

            await CoreEngineLibWordLlmRuns.set_run_final(
                run_id,
                "",
                message=message,
            )

            if draft:
                await self._safe_send(
                    websocket,
                    {"type": "effect_draft", "draft": draft},
                )

            if message:
                await self._safe_send(
                    websocket,
                    {"type": "assistant_message", "content": message},
                )

            await self._safe_send(
                websocket,
                {"type": "done", "run_id": run_id},
            )

        except Exception as e:
            await self._log(
                websocket,
                "error",
                f"[run-create-effect] run {run_id} crashed: {e}\n"
                f"{traceback.format_exc()}",
            )
            await self._finish_error(
                websocket,
                run_id,
                f"Внутренняя ошибка: {e}",
            )

        finally:
            self._clear_cancel_event(run_id)