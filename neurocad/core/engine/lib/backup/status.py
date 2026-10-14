# neurocad/core/engine/lib/backup/status.py

"""
Status check for the backup subsystem.

Namespace: CoreEngineLibBackupStatus

One async method — check_backups() — returns a dict in the panel
status format:

    {
        "name":   "backups",
        "status": "ok" | "warning" | "error",
        "detail": "12 мин назад (hourly)",
        "value":  0.2,          # age in hours
        "limit":  {"warning": 4.0, "error": 8.0, "timeout": 1.0},
    }

The status is decided by comparing the age of the most recent
successful run against the thresholds stored in panel_limits for
(subsystem="backups", metric="age_hours").

No data / failure → status="error". The panel does not guess
whether backups are healthy: if we cannot prove that they are,
they are reported as an error.
"""

from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import select

from ....models.base import PanelLimit
from .....utils.sqlite import get_db_sqlite

from .service import CoreEngineLibBackupService


class CoreEngineLibBackupStatus:
    """Static status check for the backup subsystem."""

    # ============================================
    # LIMIT LOADING
    # ============================================

    @staticmethod
    async def load_limit(
        subsystem: str,
        metric: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Load thresholds for a (subsystem, metric) pair from panel_limits.

        Returns a dict with warning / error / timeout, or None when
        the row is missing. A missing limit is itself an error for
        the caller (it cannot classify the value).
        """
        async for session in get_db_sqlite():
            stmt = select(PanelLimit).where(
                PanelLimit.subsystem == subsystem,
                PanelLimit.metric == metric,
            )
            row = (await session.execute(stmt)).scalar_one_or_none()
            if row is None:
                return None
            return {
                "warning": row.warning,
                "error": row.error,
                "timeout": row.timeout,
            }
        return None

    # ============================================
    # CLASSIFICATION
    # ============================================

    @staticmethod
    def classify(value: float, limit: Dict[str, Any]) -> str:
        """
        Classify a metric value into ok / warning / error.

        Direction is inferred from the thresholds:
          - warning < error → "higher is worse" (disk, RAM, age);
          - warning > error → "higher is better" (uptime, free space).
        """
        warning = limit["warning"]
        error = limit["error"]

        if warning < error:
            # Higher is worse.
            if value < warning:
                return "ok"
            if value < error:
                return "warning"
            return "error"
        else:
            # Higher is better.
            if value >= warning:
                return "ok"
            if value > error:
                return "warning"
            return "error"

    # ============================================
    # HELPERS
    # ============================================

    @staticmethod
    def _format_age(hours: float) -> str:
        """
        Human-readable age: minutes / hours / days.

        Used in the `detail` field so the user sees "12 мин назад"
        rather than "0.2 hours".
        """
        if hours < 1:
            minutes = int(hours * 60)
            return f"{minutes} мин назад"
        if hours < 48:
            return f"{hours:.1f} ч назад"
        days = hours / 24
        return f"{days:.1f} дн назад"

    # ============================================
    # CHECK: BACKUPS
    # ============================================

    @staticmethod
    async def check_backups(level: str = "hourly") -> Dict[str, Any]:
        """
        Check the freshness of the most recent successful backup run.

        Reads the last successful run for the given level and
        compares its age (hours) against the thresholds configured
        for subsystem='backups', metric='age_hours'.

        Returns an error item when:
          - there is no limit configured for backups/age_hours;
          - there is no successful run recorded;
          - the run's finished_at is NULL;
          - the stored date cannot be parsed.
        """
        name = "backups"

        # 1. Limit
        limit = await CoreEngineLibBackupStatus.load_limit(
            "backups", "age_hours"
        )
        if limit is None:
            return {
                "name": name,
                "status": "error",
                "detail": "лимит не настроен",
                "value": None,
                "limit": None,
            }

        # 2. Last successful run
        last = await CoreEngineLibBackupService.get_last_success(level)
        if last is None or last.get("finished_at") is None:
            return {
                "name": name,
                "status": "error",
                "detail": "нет данных о бэкапах",
                "value": None,
                "limit": limit,
            }

        # 3. Age in hours
        try:
            finished_at = datetime.fromisoformat(last["finished_at"])
        except (TypeError, ValueError):
            return {
                "name": name,
                "status": "error",
                "detail": "некорректная дата бэкапа",
                "value": None,
                "limit": limit,
            }

        now = datetime.now()
        age_hours = (now - finished_at).total_seconds() / 3600.0

        # 4. Classify
        status = CoreEngineLibBackupStatus.classify(age_hours, limit)

        return {
            "name": name,
            "status": status,
            "detail": f"{CoreEngineLibBackupStatus._format_age(age_hours)} ({level})",
            "value": round(age_hours, 3),
            "limit": limit,
        }