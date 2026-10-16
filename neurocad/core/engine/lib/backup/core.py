# neurocad/core/engine/lib/backup/core.py

"""
Main backup logic.

Namespace: CoreEngineLibBackupCore

One entry point — run_backup(level) — does the full cycle:

    1. Load settings from the shared `settings` table.
    2. Record the start time.
    3. Dump SQLite (if the DB exists).
    4. Create a tar.gz archive of the configured items.
    5. Upload the archive and the DB dump to S3 via rclone.
    6. Rotate old archives on the level (keep N newest).
    7. Clean up local temp files.
    8. Record the result in backup_runs.
    9. Update the matching panel_tasks row (last_run_at /
       last_status / last_error / next_run_at) so the UI shows
       the real state of each schedule.

On any failure the run is recorded as "failed" with the error
message, and the BackupResult(success=False) is returned.
No exception is raised — the caller (CLI / scheduler) decides
what to do.

If rclone is not configured / not reachable, the upload step
fails and the run is recorded as "failed". The archive stays
in the local dir for manual inspection.
"""

import logging
import shutil
import sqlite3
import tarfile
import traceback
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from croniter import croniter

from . import s3
from .service import CoreEngineLibBackupService


logger = logging.getLogger(__name__)


# ============================================
# CONSTANTS
# ============================================

#: Valid levels.
LEVELS = ("hourly", "daily", "weekly", "monthly", "yearly")

#: Defaults if a key is missing from settings.
_DEFAULTS: Dict[str, Any] = {
    "project_dir": ".",
    "local_dir": "_backup",
    "rclone_remote": "selectel",
    "rclone_bucket": "neurocad-backups",
    "keep": {
        "hourly": 24,
        "daily": 7,
        "weekly": 4,
        "monthly": 12,
        "yearly": 1,
    },
    "include": [
        "app", "base", "etc", "media", "mig",
        "requirements.txt", "pyproject.toml", ".env", "README.md",
    ],
}

#: Max length of the error string stored in backup_runs.error.
#: The DB column is small; full traceback goes to the log instead.
_ERROR_MAX_LEN = 500


# ============================================
# RESULT
# ============================================

@dataclass
class BackupResult:
    """Outcome of one backup run."""
    level: str
    success: bool
    started_at: datetime
    finished_at: datetime
    archive_name: Optional[str] = None
    size_bytes: Optional[int] = None
    error: Optional[str] = None


# ============================================
# HELPERS
# ============================================

def _timestamp() -> str:
    """YYYYMMDD_HHMMSS for archive names."""
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _collect_items(project_dir: Path, include: List[str]) -> List[str]:
    """Existing items from `include` (relative to project_dir)."""
    found = []
    for item in include:
        if (project_dir / item).exists():
            found.append(item)
    return found


def _dump_sqlite(db_path: Path, dump_path: Path) -> None:
    """
    Consistent SQLite dump via the sqlite3 module.

    .backup runs inside a transaction — safe against concurrent
    writes from the running app (uvicorn).
    """
    src = sqlite3.connect(str(db_path))
    try:
        dst = sqlite3.connect(str(dump_path))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def _create_archive(
    project_dir: Path,
    items: List[str],
    archive_path: Path,
) -> None:
    """
    Create tar.gz of the given items. Excludes DB files, caches,
    .git, venv, and log/static (regenerated at runtime).
    """
    excludes_abs = {
        project_dir / "base" / "neurocad.db",
        project_dir / "base" / "neurocad.db-shm",
        project_dir / "base" / "neurocad.db-wal",
        project_dir / "static",
        project_dir / ".git",
        project_dir / ".venv",
        project_dir / ".venvtest",
        project_dir / "log",
    }

    def _filter(tarinfo: tarfile.TarInfo):
        full = project_dir / tarinfo.name
        if full in excludes_abs:
            return None
        if "__pycache__" in tarinfo.name:
            return None
        if tarinfo.name.endswith(".pyc"):
            return None
        return tarinfo

    with tarfile.open(archive_path, "w:gz") as tar:
        for item in items:
            tar.add(
                project_dir / item,
                arcname=item,
                filter=_filter,
                recursive=True,
            )


async def _rotate(
    remote: str,
    bucket: str,
    level: str,
    keep: int,
) -> None:
    """Delete oldest archives beyond `keep` on the level."""
    archives = await s3.list_archives(remote, bucket, level)
    total = len(archives)
    if total <= keep:
        return

    to_delete = archives[: total - keep]
    for name in to_delete:
        await s3.delete_file(remote, bucket, level, name)
        # Best-effort delete of the paired .db.dump.
        dump_name = name.replace(".tar.gz", ".db.dump")
        try:
            await s3.delete_file(remote, bucket, level, dump_name)
        except Exception:
            pass


def _format_error(exc: BaseException) -> str:
    """
    Short, human-readable error for the DB and the UI.

    Rules:
      - FileNotFoundError with a filename → "FileNotFoundError: <file>"
        (much clearer than the bare "No such file or directory").
      - Other exceptions → "{Type}: {msg}".
      - Truncated to _ERROR_MAX_LEN.

    Full traceback goes to the log via _log_exception().
    """
    if isinstance(exc, FileNotFoundError):
        # `filename` may be the executable, config, or any other path.
        fname = getattr(exc, "filename", None) or getattr(exc, "filename2", None)
        if fname:
            msg = f"FileNotFoundError: {fname}"
        else:
            msg = f"FileNotFoundError: {exc}"
    else:
        msg = f"{type(exc).__name__}: {exc}"

    if len(msg) > _ERROR_MAX_LEN:
        msg = msg[: _ERROR_MAX_LEN - 3] + "..."
    return msg


def _log_exception(level: str, exc: BaseException) -> None:
    """Log the full traceback once, at ERROR level."""
    logger.error(
        "Backup run failed (level=%s): %s",
        level,
        exc,
        exc_info=True,
    )


async def _update_panel_task_after_run(
    level: str,
    result: BackupResult,
) -> None:
    """
    Update the panel_tasks row for this backup_* level after a run.

    Called from run_backup()'s finally block, after the run has
    been recorded in backup_runs. Updates:

        last_run_at  — finished_at of this run
        last_status  — "success" or "failed"
        last_error   — error text (or None on success)
        next_run_at  — next occurrence of the task's cron expression

    Never raises: any error here must not affect the backup result
    or mask it in the UI.
    """
    try:
        task = await CoreEngineLibBackupService.get_backup_task_by_name(
            f"backup_{level}"
        )
        if task is None:
            return

        finished_at = result.finished_at or datetime.now()

        # Compute next_run_at from the task's cron expression.
        next_run_at: Optional[datetime] = None
        cron_expr = (task.get("cron") or "").strip()
        if cron_expr and croniter.is_valid(cron_expr):
            try:
                next_run_at = croniter(cron_expr, finished_at).get_next(datetime)
            except Exception:
                next_run_at = None

        await CoreEngineLibBackupService.mark_task_run(
            task_id=task["id"],
            last_run_at=finished_at,
            last_status="success" if result.success else "failed",
            last_error=result.error,
            next_run_at=next_run_at,
        )
    except Exception:
        # Never propagate — the backup result is what matters.
        # Log at debug — panel_tasks update failure is not critical.
        logger.debug("Failed to update panel_tasks after run", exc_info=True)


# ============================================
# MAIN
# ============================================

async def run_backup(level: str) -> BackupResult:
    """
    Run one backup of the given level.

    Never raises on S3 / tar / SQLite errors — records them and
    returns BackupResult(success=False). Raises only on invalid
    level (programmer error).
    """
    if level not in LEVELS:
        raise ValueError(
            f"Unknown level: {level!r}. Allowed: {', '.join(LEVELS)}"
        )

    started_at = datetime.now()
    archive_path: Optional[Path] = None
    dump_path: Optional[Path] = None
    archive_name: Optional[str] = None
    size_bytes: Optional[int] = None
    error: Optional[str] = None
    result: Optional[BackupResult] = None

    # Load settings from the DB (fallback to defaults if missing).
    settings = await CoreEngineLibBackupService.load_settings() or {}
    project_dir = Path(settings.get("project_dir") or _DEFAULTS["project_dir"]).resolve()
    local_dir = Path(settings.get("local_dir") or _DEFAULTS["local_dir"]).resolve()
    remote = settings.get("rclone_remote") or _DEFAULTS["rclone_remote"]
    bucket = settings.get("rclone_bucket") or _DEFAULTS["rclone_bucket"]
    keep_map = settings.get("keep") or _DEFAULTS["keep"]
    include = settings.get("include") or _DEFAULTS["include"]
    keep = int(keep_map.get(level, _DEFAULTS["keep"][level]))

    try:
        local_dir.mkdir(parents=True, exist_ok=True)

        items = _collect_items(project_dir, include)
        if not items:
            raise RuntimeError(f"No items to back up in {project_dir}")

        stamp = _timestamp()
        archive_name = f"neurocad_{stamp}.tar.gz"
        archive_path = local_dir / archive_name
        dump_path = local_dir / f"neurocad_{stamp}.db.dump"

        # 1. DB dump
        db_path = project_dir / "base" / "neurocad.db"
        if db_path.exists():
            _dump_sqlite(db_path, dump_path)

        # 2. Archive
        _create_archive(project_dir, items, archive_path)
        size_bytes = archive_path.stat().st_size

        # 3. Upload
        await s3.upload_file(archive_path, remote, bucket, level)
        if dump_path.exists():
            await s3.upload_file(dump_path, remote, bucket, level)

        # 4. Rotation
        await _rotate(remote, bucket, level, keep)

        result = BackupResult(
            level=level,
            success=True,
            started_at=started_at,
            finished_at=datetime.now(),
            archive_name=archive_name,
            size_bytes=size_bytes,
        )
        logger.info(
            "Backup %s succeeded: %s (%s bytes)",
            level,
            archive_name,
            size_bytes,
        )
        return result

    except Exception as e:
        # Log full traceback once, store short message in DB / UI.
        _log_exception(level, e)
        error = _format_error(e)
        result = BackupResult(
            level=level,
            success=False,
            started_at=started_at,
            finished_at=datetime.now(),
            archive_name=archive_name,
            size_bytes=size_bytes,
            error=error,
        )
        return result

    finally:
        # 5. Clean up local temp files — only on success; on failure
        #    keep them for manual inspection.
        if error is None:
            for p in (archive_path, dump_path):
                if p and p.exists():
                    try:
                        p.unlink()
                    except Exception:
                        pass

        # 6. Record the run in backup_runs (direct DB write).
        try:
            await CoreEngineLibBackupService.record_run(
                level=level,
                status="success" if error is None else "failed",
                started_at=started_at,
                finished_at=datetime.now(),
                size_bytes=size_bytes,
                error=error,
            )
        except Exception:
            # Recording failure must not mask the actual result.
            logger.exception("Failed to record backup run in backup_runs")

        # 7. Update panel_tasks (last_run_at / next_run_at / status).
        if result is not None:
            await _update_panel_task_after_run(level, result)