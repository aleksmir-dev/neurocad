# neurocad/core/engine/lib/word/llm/runs.py

"""
Service layer for Run records.

Namespace: CoreEngineLibWordLlmRuns

A "Run" is one multi-step LLM generation: plan → fill → effects.
Runs are stored in the shared SQLite database, so:
  - state survives server restarts;
  - all uvicorn workers see the same runs;
  - a run can be inspected or resumed after a WebSocket reconnect.

All methods are async and use the project's SQLite helper
(`get_db_sqlite`). They never raise on "not found" — they return None
or an empty list instead, matching the style of the LLMService.
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select, desc

from .....models.base import Run
from ......utils.sqlite import get_db_sqlite

logger = logging.getLogger(__name__)


class CoreEngineLibWordLlmRuns:
    """Static service for Run records."""

    # ============================================
    # SERIALIZATION HELPERS
    # ============================================

    @staticmethod
    def _dumps(value: Any) -> Optional[str]:
        """JSON-encode a value, or return None for None."""
        if value is None:
            return None
        try:
            return json.dumps(value, ensure_ascii=False)
        except (TypeError, ValueError) as e:
            logger.warning(f"[runs] JSON encode failed: {e}")
            return None

    @staticmethod
    def _loads(text: Optional[str]) -> Any:
        """JSON-decode a value, or return None for None/empty."""
        if not text:
            return None
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.warning(f"[runs] JSON decode failed: {e}")
            return None

    @staticmethod
    def _run_to_dict(run: Run, include_heavy: bool = False) -> Dict[str, Any]:
        """
        Convert a Run model to a dict.

        `include_heavy=False` (default) omits block_catalog, plan,
        filled, final_html — useful when listing runs for a page.
        Set to True to get everything.
        """
        data = {
            "id": run.id,
            "page_id": run.page_id,
            "user_id": run.user_id,
            "status": run.status,
            "step": run.step,
            "user_message": run.user_message,
            "message": run.message,
            "error": run.error,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "updated_at": run.updated_at.isoformat() if run.updated_at else None,
        }
        if include_heavy:
            data.update({
                "block_catalog": CoreEngineLibWordLlmRuns._loads(run.block_catalog),
                "plan": CoreEngineLibWordLlmRuns._loads(run.plan),
                "filled": CoreEngineLibWordLlmRuns._loads(run.filled),
                "effects": CoreEngineLibWordLlmRuns._loads(run.effects),
                "final_html": run.final_html,
            })
        return data

    # ============================================
    # CREATE
    # ============================================

    @staticmethod
    async def create_run(
        page_id: int,
        user_message: str,
        block_catalog: Optional[List[Dict[str, Any]]] = None,
        user_id: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Create a new run in status 'pending'.

        Returns the run dict (with heavy fields included), or None on error.
        """
        async for session in get_db_sqlite():
            run = Run(
                page_id=page_id,
                user_id=user_id,
                status="pending",
                step=0,
                user_message=user_message,
                block_catalog=CoreEngineLibWordLlmRuns._dumps(block_catalog),
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            session.add(run)
            await session.commit()
            await session.refresh(run)
            return CoreEngineLibWordLlmRuns._run_to_dict(run, include_heavy=True)

        return None

    # ============================================
    # GET
    # ============================================

    @staticmethod
    async def get_run(run_id: int) -> Optional[Dict[str, Any]]:
        """Get a run by id with all fields, or None."""
        async for session in get_db_sqlite():
            stmt = select(Run).where(Run.id == run_id)
            result = await session.execute(stmt)
            run = result.scalar_one_or_none()
            if not run:
                return None
            return CoreEngineLibWordLlmRuns._run_to_dict(run, include_heavy=True)

        return None

    @staticmethod
    async def get_active_run_for_page(page_id: int) -> Optional[Dict[str, Any]]:
        """
        Return the latest run for a page that is not yet finished.

        Active statuses: pending, planning, filling, effects.
        Returns None if there is no active run.
        """
        active_statuses = ("pending", "planning", "filling", "effects")
        async for session in get_db_sqlite():
            stmt = (
                select(Run)
                .where(
                    Run.page_id == page_id,
                    Run.status.in_(active_statuses),
                )
                .order_by(desc(Run.created_at))
                .limit(1)
            )
            result = await session.execute(stmt)
            run = result.scalar_one_or_none()
            if not run:
                return None
            return CoreEngineLibWordLlmRuns._run_to_dict(run, include_heavy=True)

        return None

    @staticmethod
    async def list_runs_for_page(
        page_id: int,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        List recent runs for a page (light fields only).

        Heavy fields (block_catalog, plan, filled, final_html) are
        omitted. Use `get_run(id)` to fetch the full data for one run.
        """
        async for session in get_db_sqlite():
            stmt = (
                select(Run)
                .where(Run.page_id == page_id)
                .order_by(desc(Run.created_at))
                .limit(limit)
            )
            result = await session.execute(stmt)
            rows = result.scalars().all()
            return [
                CoreEngineLibWordLlmRuns._run_to_dict(r, include_heavy=False)
                for r in rows
            ]

        return []

    # ============================================
    # UPDATE
    # ============================================

    @staticmethod
    async def update_run_status(
        run_id: int,
        status: str,
        step: Optional[int] = None,
        message: Optional[str] = None,
        error: Optional[str] = None,
    ) -> bool:
        """Update lifecycle fields of a run."""
        async for session in get_db_sqlite():
            stmt = select(Run).where(Run.id == run_id)
            result = await session.execute(stmt)
            run = result.scalar_one_or_none()
            if not run:
                return False

            run.status = status
            if step is not None:
                run.step = step
            if message is not None:
                run.message = message
            if error is not None:
                run.error = error
            run.updated_at = datetime.now()

            await session.commit()
            return True

        return False

    @staticmethod
    async def set_run_plan(run_id: int, plan: List[Dict[str, Any]]) -> bool:
        """Save the plan (step 1 result)."""
        async for session in get_db_sqlite():
            stmt = select(Run).where(Run.id == run_id)
            result = await session.execute(stmt)
            run = result.scalar_one_or_none()
            if not run:
                return False
            run.plan = CoreEngineLibWordLlmRuns._dumps(plan)
            run.updated_at = datetime.now()
            await session.commit()
            return True

        return False

    @staticmethod
    async def set_run_filled(run_id: int, filled: Dict[str, str]) -> bool:
        """Save the filled blocks (step 2 result)."""
        async for session in get_db_sqlite():
            stmt = select(Run).where(Run.id == run_id)
            result = await session.execute(stmt)
            run = result.scalar_one_or_none()
            if not run:
                return False
            run.filled = CoreEngineLibWordLlmRuns._dumps(filled)
            run.updated_at = datetime.now()
            await session.commit()
            return True

        return False

    @staticmethod
    async def set_run_final(
        run_id: int,
        final_html: str,
        message: Optional[str] = None,
    ) -> bool:
        """Save the final HTML and mark the run as done."""
        async for session in get_db_sqlite():
            stmt = select(Run).where(Run.id == run_id)
            result = await session.execute(stmt)
            run = result.scalar_one_or_none()
            if not run:
                return False
            run.final_html = final_html
            run.status = "done"
            run.message = message
            run.updated_at = datetime.now()
            await session.commit()
            return True

        return False

    # ============================================
    # DELETE / CANCEL
    # ============================================

    @staticmethod
    async def cancel_run(run_id: int, reason: str = "cancelled by user") -> bool:
        """
        Mark a run as cancelled.

        Does not delete the record — cancelled runs stay for inspection.
        """
        return await CoreEngineLibWordLlmRuns.update_run_status(
            run_id, status="cancelled", message=reason
        )