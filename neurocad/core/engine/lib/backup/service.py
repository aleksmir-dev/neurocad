# neurocad/core/engine/lib/backup/service.py

"""
Service for backup runs and backup settings.

Namespace: CoreEngineLibBackupService

Three concerns:

  1. backup_runs — one row per run_backup() invocation. Written by
     run_backup(), read by the panel status check and the "История"
     tab in the UI.

  2. settings — the backup configuration (project_dir, rclone
     remote, retention, include list, S3 credentials) lives in the
     shared `settings` table as ONE row with a JSON payload, keyed
     by:
         domain="neurocad", subsys="backup", module="", key="backup"
     (same shape as the LLM settings row).

     The S3 secret key (s3_secret_key) is stored ENCRYPTED via
     neurocad.utils.crypto.encrypt(). Never sent to the UI in
     plaintext — load_settings_for_ui() blanks it.

  3. schedules — backup tasks live in the shared `panel_tasks`
     table (names starting with "backup_"). This module reads them,
     updates cron / active, and regenerates the per-instance
     crontab file /etc/cron.d/<APP_DOMAIN> whenever something
     changes.

     Multi-instance: the crontab path, its base URL, and the
     run-as user are derived from APP_DOMAIN / APP_HOST /
     APP_PORT / APP_SYSTEM_USER (see _crontab_path /
     _crontab_base_url / _crontab_user below), so 10–20
     instances on one host do not overwrite each other's
     schedules.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from ....models.base import BackupRun, PanelTask, Setting
from .....utils.crypto import decrypt, encrypt, is_crypto_available
from .....utils.sqlite import get_db_sqlite


# ============================================
# CONSTANTS
# ============================================

#: The settings row that holds the backup config.
_SETTINGS_DOMAIN = "neurocad"
_SETTINGS_SUBSYS = "backup"
_SETTINGS_MODULE = ""          # NOT NULL in the DB — empty string, not NULL
_SETTINGS_KEY = "backup"
_SETTINGS_CAPTION = "Настройки бэкапа"
_SETTINGS_DESCRIPTION = "Параметры резервного копирования проекта"

#: Prefix of panel_tasks names that belong to the backup module.
_TASK_PREFIX = "backup_"


# ============================================
# DERIVED PATHS / URLS (multi-instance)
# ============================================

def _crontab_path() -> Path:
    """
    Per-instance system crontab file.

    Default: /etc/cron.d/<APP_DOMAIN>  (e.g. /etc/cron.d/neurocad.ru).
    Derived from APP_DOMAIN so multiple instances on one host do not
    overwrite each other's schedules.

    Escape hatch: set NEUROCAD_CRONTAB_PATH in env to override.
    """
    override = os.environ.get("NEUROCAD_CRONTAB_PATH")
    if override:
        return Path(override)
    from .....config import settings
    name = (settings.APP_DOMAIN or "neurocad").strip() or "neurocad"
    return Path(f"/etc/cron.d/{name}")


def _crontab_base_url() -> str:
    """
    Base URL that cron uses to call the local app endpoint.

    Derived from APP_HOST + APP_PORT so each instance hits its own
    port. Escape hatch: NEUROCAD_CRONTAB_BASE_URL.
    """
    override = os.environ.get("NEUROCAD_CRONTAB_BASE_URL")
    if override:
        return override
    from .....config import settings
    host = settings.APP_HOST or "127.0.0.1"
    port = settings.APP_PORT or 8000
    return f"http://{host}:{port}"


def _crontab_user() -> str:
    """System user for cron lines. Sourced from APP_SYSTEM_USER."""
    from .....config import settings
    return settings.APP_SYSTEM_USER or "root"


def _rclone_config_path() -> Path:
    """
    Where rclone reads its config.

    Uses HOME from env, falling back to Path.home(). Under systemd
    the HOME env may be unset — rclone then can't find its config
    and silently uses CWD.
    """
    home = os.environ.get("HOME") or str(Path.home())
    return Path(home) / ".config" / "rclone" / "rclone.conf"


# ============================================
# SERVICE
# ============================================

class CoreEngineLibBackupService:
    """Static service for backup runs, settings, and schedules."""

    # ============================================
    # RUNS — write
    # ============================================

    @staticmethod
    async def record_run(
        level: str,
        status: str,
        started_at: datetime,
        finished_at: Optional[datetime] = None,
        size_bytes: Optional[int] = None,
        error: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Record one backup run.

        Called by run_backup() after every invocation (success or
        failure). level is one of:
        "hourly" / "daily" / "weekly" / "monthly" / "yearly".
        """
        async for session in get_db_sqlite():
            run = BackupRun(
                level=level,
                status=status,
                started_at=started_at,
                finished_at=finished_at,
                size_bytes=size_bytes,
                error=error,
            )
            session.add(run)
            await session.commit()
            await session.refresh(run)
            return CoreEngineLibBackupService._run_to_dict(run)
        return None

    # ============================================
    # RUNS — read
    # ============================================

    @staticmethod
    async def get_last_success(level: str) -> Optional[Dict[str, Any]]:
        """
        Most recent successful run for a level, or None.
        """
        async for session in get_db_sqlite():
            stmt = (
                select(BackupRun)
                .where(
                    BackupRun.level == level,
                    BackupRun.status == "success",
                )
                .order_by(BackupRun.finished_at.desc())
                .limit(1)
            )
            run = (await session.execute(stmt)).scalar_one_or_none()
            if run is None:
                return None
            return CoreEngineLibBackupService._run_to_dict(run)
        return None

    @staticmethod
    async def list_recent(
        level: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Most recent runs, optionally filtered by level. Newest first.
        """
        async for session in get_db_sqlite():
            stmt = select(BackupRun).order_by(BackupRun.finished_at.desc()).limit(limit)
            if level is not None:
                stmt = stmt.where(BackupRun.level == level)
            rows = (await session.execute(stmt)).scalars().all()
            return [
                CoreEngineLibBackupService._run_to_dict(r)
                for r in rows
            ]
        return []

    # ============================================
    # SETTINGS — read (internal, with decrypted secret)
    # ============================================

    @staticmethod
    async def load_settings() -> Optional[Dict[str, Any]]:
        """
        Load the backup config from the shared `settings` table.

        Returns the parsed JSON dict with s3_secret_key DECRYPTED,
        or None if the row is missing.

        For UI use — load_settings_for_ui().
        """
        raw = await CoreEngineLibBackupService._load_raw()
        if raw is None:
            return None

        # Decrypt the secret for internal use (rclone.conf generation).
        if raw.get("s3_secret_key"):
            raw["s3_secret_key"] = decrypt(raw["s3_secret_key"]) or ""

        return raw

    # ============================================
    # SETTINGS — read (UI, without the secret)
    # ============================================

    @staticmethod
    async def load_settings_for_ui() -> Optional[Dict[str, Any]]:
        """
        Same as load_settings(), but the S3 secret is blanked.

        The UI needs to know whether a secret is already stored —
        that is what `s3_secret_key_set` is for. The plaintext
        secret never leaves the server.
        """
        raw = await CoreEngineLibBackupService._load_raw()
        if raw is None:
            return None

        has_secret = bool(raw.get("s3_secret_key"))
        raw["s3_secret_key"] = ""
        raw["s3_secret_key_set"] = has_secret
        return raw

    # ============================================
    # SETTINGS — write
    # ============================================

    @staticmethod
    async def save_settings(data: Dict[str, Any]) -> bool:
        """
        Save the backup config to the shared `settings` table.

        If `s3_secret_key` is non-empty — it is encrypted before
        storing. If it is empty ("" or missing) — the existing
        secret in the DB is preserved (the user did not change it,
        they just left the field blank).
        """
        payload_data = dict(data)

        # Sanitize S3 credentials — strip whitespace and surrounding
        # quotes. Users often paste keys with a leading space or wrap
        # them in quotes; rclone then sends the wrong value and S3
        # rejects the request.
        for field in (
            "s3_access_key", "s3_secret_key", "s3_endpoint",
            "s3_region", "rclone_remote", "rclone_bucket",
        ):
            if field in payload_data and isinstance(payload_data[field], str):
                payload_data[field] = payload_data[field].strip().strip("'\"")

        # Preserve the existing secret if the caller sent an empty one.
        if not payload_data.get("s3_secret_key"):
            existing = await CoreEngineLibBackupService._load_raw()
            if existing and existing.get("s3_secret_key"):
                payload_data["s3_secret_key"] = existing["s3_secret_key"]
        else:
            # Encrypt the new secret before storing.
            payload_data["s3_secret_key"] = encrypt(payload_data["s3_secret_key"]) or ""

        # Never persist the UI-only marker.
        payload_data.pop("s3_secret_key_set", None)

        payload = json.dumps(payload_data, ensure_ascii=False)
        now = datetime.now()

        async for session in get_db_sqlite():
            stmt = select(Setting).where(
                Setting.domain == _SETTINGS_DOMAIN,
                Setting.subsys == _SETTINGS_SUBSYS,
                Setting.module == _SETTINGS_MODULE,
                Setting.key == _SETTINGS_KEY,
            )
            row = (await session.execute(stmt)).scalar_one_or_none()

            if row is None:
                row = Setting(
                    domain=_SETTINGS_DOMAIN,
                    subsys=_SETTINGS_SUBSYS,
                    module=_SETTINGS_MODULE,
                    section=None,
                    key=_SETTINGS_KEY,
                    value=payload,
                    caption=_SETTINGS_CAPTION,
                    description=_SETTINGS_DESCRIPTION,
                    is_delete=False,
                    created_at=now,
                    updated_at=now,
                )
                session.add(row)
            else:
                row.value = payload
                row.updated_at = now
                row.is_delete = False

            await session.commit()
            return True
        return False

    # ============================================
    # SCHEDULES — read (from panel_tasks)
    # ============================================

    @staticmethod
    async def list_backup_tasks() -> List[Dict[str, Any]]:
        """
        All panel_tasks with a name starting with 'backup_',
        ordered by id ascending.
        """
        async for session in get_db_sqlite():
            stmt = (
                select(PanelTask)
                .where(PanelTask.name.like(f"{_TASK_PREFIX}%"))
                .order_by(PanelTask.id.asc())
            )
            rows = (await session.execute(stmt)).scalars().all()
            return [
                CoreEngineLibBackupService._task_to_dict(t)
                for t in rows
            ]
        return []

    @staticmethod
    async def get_backup_task(task_id: int) -> Optional[Dict[str, Any]]:
        """
        One panel_task by id — only if it belongs to backup_*.
        Returns None otherwise.
        """
        async for session in get_db_sqlite():
            stmt = select(PanelTask).where(
                PanelTask.id == task_id,
                PanelTask.name.like(f"{_TASK_PREFIX}%"),
            )
            task = (await session.execute(stmt)).scalar_one_or_none()
            if task is None:
                return None
            return CoreEngineLibBackupService._task_to_dict(task)
        return None

    @staticmethod
    async def get_backup_task_by_name(name: str) -> Optional[Dict[str, Any]]:
        """
        One panel_task by exact name (e.g. "backup_hourly").
        Returns None if not found.
        """
        async for session in get_db_sqlite():
            stmt = select(PanelTask).where(PanelTask.name == name)
            task = (await session.execute(stmt)).scalar_one_or_none()
            if task is None:
                return None
            return CoreEngineLibBackupService._task_to_dict(task)
        return None

    # ============================================
    # SCHEDULES — write
    # ============================================

    @staticmethod
    async def update_backup_task(
        task_id: int,
        cron: Optional[str] = None,
        active: Optional[bool] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Update cron and/or active for a backup_* panel_task.

        Validates `cron` via croniter before saving. Returns the
        updated task dict, or None if the task was not found.

        Raises ValueError if the cron expression is invalid.
        """
        # Validate cron if provided.
        if cron is not None:
            from croniter import croniter
            if not croniter.is_valid(cron):
                raise ValueError(f"Invalid cron expression: {cron!r}")

        async for session in get_db_sqlite():
            stmt = select(PanelTask).where(
                PanelTask.id == task_id,
                PanelTask.name.like(f"{_TASK_PREFIX}%"),
            )
            task = (await session.execute(stmt)).scalar_one_or_none()
            if task is None:
                return None

            if cron is not None:
                task.cron = cron
            if active is not None:
                task.active = bool(active)

            task.updated_at = datetime.now()

            await session.commit()
            await session.refresh(task)
            return CoreEngineLibBackupService._task_to_dict(task)
        return None

    @staticmethod
    async def mark_task_run(
        task_id: int,
        last_run_at: datetime,
        last_status: str,
        last_error: Optional[str],
        next_run_at: Optional[datetime],
    ) -> bool:
        """
        Record the outcome of a run in the matching panel_tasks row.

        Called by run_backup() after every invocation (via
        _update_panel_task_after_run in core.py). Updates:

            last_run_at  — finished_at of the run
            last_status  — "success" or "failed"
            last_error   — error text (or None on success)
            next_run_at  — next occurrence of the task's cron

        Returns True on success, False if the task was not found or
        the update failed. Never raises.
        """
        async for session in get_db_sqlite():
            task = await session.get(PanelTask, task_id)
            if task is None:
                return False

            task.last_run_at = last_run_at
            task.last_status = last_status
            task.last_error = last_error
            task.next_run_at = next_run_at
            task.updated_at = datetime.now()

            await session.commit()
            return True
        return False

    # ============================================
    # CRONTAB — generation
    # ============================================

    @staticmethod
    async def apply_crontab() -> bool:
        """
        Regenerate the per-instance crontab file from panel_tasks.

        Path: /etc/cron.d/<APP_DOMAIN> (see _crontab_path).
        Only active backup_* tasks are included. The file is
        written atomically (tmp + rename). Header contains a
        warning that the file is generated — manual edits will be
        overwritten the next time a schedule is changed from the UI.

        Never raises: any error returns False.

        The file is read by the system cron daemon automatically —
        no `crontab -e` and no `systemctl reload cron` required.
        """
        tasks = await CoreEngineLibBackupService.list_backup_tasks()
        active_tasks = [t for t in tasks if t.get("active")]

        lines: List[str] = [
            "# Generated by NeuroCad admin panel. Do not edit manually.\n",
            "# Any changes here are overwritten the next time a schedule\n",
            "# is saved from the UI.\n",
            "SHELL=/bin/sh\n",
            "PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n",
            "\n",
        ]

        for t in active_tasks:
            line = CoreEngineLibBackupService._render_crontab_line(t)
            if line:
                lines.append(line)

        content = "".join(lines)

        # Atomic write: tmp file in the same directory, then rename.
        path = _crontab_path()
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_text(content, encoding="utf-8")
            os.chmod(tmp, 0o644)   # cron requires mode 0644 for /etc/cron.d/*
            os.replace(tmp, path)
            return True
        except Exception:
            return False

    @staticmethod
    def _render_crontab_line(task: Dict[str, Any]) -> str:
        """
        Render one line for the per-instance crontab file.

        Format (system crontab with user field):
            <cron> <user> <command>

        The command is a curl POST to the local app endpoint. The
        URL and level come from task["url"]:
            "/backup/run?level=hourly"
        →  POST http://127.0.0.1:<port>/core/engine/lib/backup/run
            body {"level": "hourly"}

        Output is discarded — the real status is recorded in
        backup_runs by the endpoint itself.

        The static PANEL_TOKEN is passed in X-Panel-Token so the
        endpoint can authenticate the cron caller without a JWT
        cookie. If PANEL_TOKEN is empty, the header is omitted —
        the call will fail with 401 and cron will silently drop it.
        """
        # Late import — avoid a circular import at module load time.
        from neurocad.config import settings

        cron = (task.get("cron") or "").strip()
        url = (task.get("url") or "").strip()

        if not cron or not url:
            return ""

        # Defensive: user cannot inject whitespace / newlines into
        # the cron expression because update_backup_task validates
        # it via croniter. Still, strip in case of manual edits.
        if "\n" in cron or "\r" in cron or "\n" in url or "\r" in url:
            return ""

        # Split url into path and query: "/backup/run?level=hourly"
        #   path  = "/backup/run"
        #   level = "hourly"
        if "?" in url:
            path, query = url.split("?", 1)
        else:
            path, query = url, ""

        level = ""
        for part in query.split("&"):
            if part.startswith("level="):
                level = part[len("level="):]
                break

        full_url = f"{_crontab_base_url()}/core/engine/lib{path}"

        # Build the curl command. If PANEL_TOKEN is set, include it
        # as X-Panel-Token so /backup/run accepts the call without
        # a JWT.
        token_header = ""
        token = getattr(settings, "PANEL_TOKEN", None)
        if token:
            token_header = f"-H 'X-Panel-Token: {token}' "

        # JSON body carries the level — the endpoint expects it there.
        if level:
            body_arg = f"-d '{{\"level\":\"{level}\"}}' "
        else:
            body_arg = "-d '{}' "

        command = (
            f"/usr/bin/curl -s -X POST "
            f"'{full_url}' "
            f"-H 'Content-Type: application/json' "
            f"{token_header}"
            f"{body_arg}"
            f"> /dev/null 2>&1"
        )

        return f"{cron} {_crontab_user()} {command}\n"

    # ============================================
    # RCLONE CONFIG
    # ============================================

    @staticmethod
    async def build_rclone_config() -> Optional[str]:
        """
        Generate the rclone.conf content for the configured S3 remote.

        Returns None if the settings row is missing or the required
        S3 fields are empty (access_key / secret_key).

        The remote name comes from settings["rclone_remote"].
        Endpoint / region / bucket come from s3_* fields.
        """
        settings = await CoreEngineLibBackupService.load_settings()
        if not settings:
            return None

        remote = settings.get("rclone_remote") or "selectel"
        access_key = settings.get("s3_access_key") or ""
        secret_key = settings.get("s3_secret_key") or ""
        endpoint = settings.get("s3_endpoint") or "https://s3.storage.selcloud.ru"
        region = settings.get("s3_region") or "ru-3"

        if not access_key or not secret_key:
            return None

        return (
            f"[{remote}]\n"
            f"type = s3\n"
            f"provider = Other\n"
            f"access_key_id = {access_key}\n"
            f"secret_access_key = {secret_key}\n"
            f"region = {region}\n"
            f"endpoint = {endpoint}\n"
        )

    @staticmethod
    async def write_rclone_config() -> bool:
        """
        Write rclone.conf to ~/.config/rclone/rclone.conf.

        Returns True on success, False if settings are incomplete or
        the write fails. Never raises.
        """
        content = await CoreEngineLibBackupService.build_rclone_config()
        if not content:
            return False

        try:
            cfg = _rclone_config_path()
            cfg.parent.mkdir(parents=True, exist_ok=True)
            cfg.write_text(content, encoding="utf-8")
            # Only the owner should read the credentials.
            cfg.chmod(0o600)
            return True
        except Exception:
            return False

    @staticmethod
    def is_s3_configured_sync(settings: Optional[Dict[str, Any]]) -> bool:
        """
        True if the settings have everything rclone needs.

        Used by /backup/settings response and by the UI to show
        "S3 not configured" warnings.
        """
        if not settings:
            return False
        return bool(
            settings.get("s3_access_key")
            and settings.get("s3_secret_key")
            and settings.get("rclone_remote")
            and settings.get("rclone_bucket")
        )

    # ============================================
    # HELPERS
    # ============================================

    @staticmethod
    async def _load_raw() -> Optional[Dict[str, Any]]:
        """
        Load the raw settings row (secret still encrypted).

        Used internally by load_settings (decrypts) and
        save_settings (preserves).
        """
        async for session in get_db_sqlite():
            stmt = select(Setting).where(
                Setting.domain == _SETTINGS_DOMAIN,
                Setting.subsys == _SETTINGS_SUBSYS,
                Setting.module == _SETTINGS_MODULE,
                Setting.key == _SETTINGS_KEY,
                Setting.is_delete == False,  # noqa: E712
            )
            row = (await session.execute(stmt)).scalar_one_or_none()
            if row is None:
                return None
            try:
                return json.loads(row.value)
            except (TypeError, ValueError):
                return None
        return None

    @staticmethod
    def _run_to_dict(run: BackupRun) -> Dict[str, Any]:
        """BackupRun ORM → JSON-safe dict."""
        return {
            "id": run.id,
            "level": run.level,
            "status": run.status,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "size_bytes": run.size_bytes,
            "error": run.error,
        }

    @staticmethod
    def _task_to_dict(task: PanelTask) -> Dict[str, Any]:
        """PanelTask ORM → JSON-safe dict."""
        return {
            "id": task.id,
            "name": task.name,
            "title": task.title,
            "url": task.url,
            "cron": task.cron,
            "active": bool(task.active),
            "last_run_at": task.last_run_at.isoformat() if task.last_run_at else None,
            "last_status": task.last_status,
            "last_error": task.last_error,
            "next_run_at": task.next_run_at.isoformat() if task.next_run_at else None,
        }