# neurocad/core/engine/lib/backup/route.py

"""
API endpoints for the backup module.

Namespace: CoreEngineLibBackupRouter

Endpoints:
  — script (static token, not JWT):
      POST /backup/report           — record a backup run from an
                                       external script
      POST /backup/run              — accepts either a JWT (UI) or
                                       X-Panel-Token (system cron)
  — superadmin (JWT + is_superadmin):
      GET  /backup/settings/schema  — JSON schema for the UI form
      GET  /backup/settings         — current backup settings
                                       (s3_secret_key blanked)
      PUT  /backup/settings         — save backup settings
      POST /backup/s3/test          — verify S3 credentials
      GET  /backup/schedules        — backup_* rows from panel_tasks
      PUT  /backup/schedules/{id}   — update cron / active (also
                                       regenerates /etc/cron.d/neurocad)
      GET  /backup/list             — recent backup runs

The /backup prefix is added by this router itself; the parent
router (core/engine/lib/route.py) just includes it. Full URL:
/core/engine/lib/backup/...
"""

import asyncio
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Query,
    Request,
)
from fastapi.responses import JSONResponse

from neurocad.config import settings
from neurocad.core.auth.dependencies import get_current_user

from .core import run_backup, LEVELS
from .schema import (
    BackupReportRequest,
    BackupReportResponse,
    BackupSettingsSchema,
    BackupSettingsResponse,
    BackupListResponse,
    BackupRunRequest,
    BackupRunResponse,
    BackupScheduleListResponse,
    BackupScheduleUpdate,
    S3TestRequest,
    S3TestResponse,
)
from .service import CoreEngineLibBackupService


router = APIRouter(prefix="/backup", tags=["core/engine/lib/backup"])


# ============================================
# AUTH
# ============================================

async def require_panel_token(
    x_panel_token: Optional[str] = Header(None, alias="X-Panel-Token"),
) -> None:
    """
    Static token for external scripts (old backup.sh on another
    server). Fail closed: empty PANEL_TOKEN rejects every call.
    """
    expected = settings.PANEL_TOKEN
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="PANEL_TOKEN не настроен на сервере",
        )
    if not x_panel_token or x_panel_token != expected:
        raise HTTPException(status_code=403, detail="Неверный токен")


async def require_superadmin(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Superadmin-only endpoints (JWT path)."""
    is_superadmin = (
        current_user.get("is_superadmin") is True
        or current_user.get("is_superadmin") == 1
        or current_user.get("is_superadmin") == "1"
    )
    if not is_superadmin:
        raise HTTPException(status_code=403, detail="Доступ только для супер-админа")
    return current_user


async def require_superadmin_or_panel_token(
    request: Request,
    x_panel_token: Optional[str] = Header(None, alias="X-Panel-Token"),
) -> dict:
    """
    Accept either a JWT (superadmin) OR the static PANEL_TOKEN.

    - JWT path:    for UI calls (browser session).
    - Static path: for cron / external scripts (curl, no cookie).

    Used by /backup/run: the endpoint is hit both by the UI (JWT)
    and by the system cron (curl, no cookie). Both paths lead to
    the same handler.

    Fail closed: if neither a valid JWT nor a matching PANEL_TOKEN
    is provided, respond 401/403.
    """
    # 1. Static token (fast, no DB).
    expected = settings.PANEL_TOKEN
    if expected and x_panel_token and x_panel_token == expected:
        return {"is_superadmin": True, "via": "panel_token"}

    # 2. JWT — delegate to get_current_user (reads the Authorization
    #    header / access_token cookie).
    try:
        user = await get_current_user(request)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    is_superadmin = (
        user.get("is_superadmin") is True
        or user.get("is_superadmin") == 1
        or user.get("is_superadmin") == "1"
    )
    if not is_superadmin:
        raise HTTPException(status_code=403, detail="Доступ только для супер-админа")
    return user


# ============================================
# EXTERNAL REPORT — static token
# ============================================

@router.post("/report", response_model=BackupReportResponse)
async def backup_report(
    data: BackupReportRequest,
    _: None = Depends(require_panel_token),
) -> JSONResponse:
    """Record a backup run from an external script."""
    run = await CoreEngineLibBackupService.record_run(
        level=data.level,
        status=data.status,
        started_at=data.started_at,
        finished_at=data.finished_at,
        size_bytes=data.size_bytes,
        error=data.error,
    )
    if not run:
        raise HTTPException(status_code=500, detail="Не удалось записать run")
    return JSONResponse({"success": True, "run_id": run["id"]})


# ============================================
# SETTINGS — schema for UI
# ============================================

@router.get("/settings/schema")
async def settings_schema(
    _: dict = Depends(require_superadmin),
) -> JSONResponse:
    """JSON schema for the settings form."""
    schema = BackupSettingsSchema.model_json_schema()
    return JSONResponse({"success": True, "schema": schema})


# ============================================
# SETTINGS — read / write
# ============================================

@router.get("/settings", response_model=BackupSettingsResponse)
async def get_settings(
    _: dict = Depends(require_superadmin),
) -> JSONResponse:
    """
    Current backup settings, or null if not configured yet.

    The S3 secret key is blanked before sending to the browser;
    s3_secret_key_set tells the UI whether a secret is already stored.
    """
    data = await CoreEngineLibBackupService.load_settings_for_ui()
    return JSONResponse({"success": True, "data": data})


@router.put("/settings")
async def put_settings(
    data: BackupSettingsSchema,
    _: dict = Depends(require_superadmin),
) -> JSONResponse:
    """
    Save backup settings.

    If s3_secret_key is empty — the previously stored secret is
    preserved (the user did not change it). If non-empty — it is
    encrypted and stored.
    """
    ok = await CoreEngineLibBackupService.save_settings(data.model_dump())
    if not ok:
        raise HTTPException(status_code=500, detail="Не удалось сохранить настройки")
    return JSONResponse({"success": True})


# ============================================
# S3 TEST — verify credentials
# ============================================

async def _run_rclone_lsd(config_path: Path) -> tuple[bool, str, list[str]]:
    """
    Run `rclone lsd <remote>:` with the given config file.

    Returns (success, message, buckets).
    Never raises.
    """
    proc = await asyncio.create_subprocess_exec(
        "rclone",
        "lsd",
        "--config", str(config_path),
        "selectel:",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    out = stdout.decode("utf-8", errors="replace")
    err = stderr.decode("utf-8", errors="replace").strip()

    if proc.returncode != 0:
        return False, err or "rclone вернул ошибку", []

    # Each line: "<size> <date> <time> <name>". Parse names.
    buckets: list[str] = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 4:
            buckets.append(parts[-1])

    return True, "OK", buckets


@router.post("/s3/test", response_model=S3TestResponse)
async def test_s3(
    data: S3TestRequest,
    _: dict = Depends(require_superadmin),
) -> JSONResponse:
    """
    Test S3 credentials by writing a temporary rclone.conf and
    running `rclone lsd <remote>:`.

    If s3_secret_key is empty in the request — the stored (encrypted)
    secret is used. This lets the user click "Проверить подключение"
    without re-entering the secret every time.
    """
    secret_key = data.s3_secret_key

    # Fall back to the stored secret.
    if not secret_key:
        stored = await CoreEngineLibBackupService.load_settings()
        if stored:
            secret_key = stored.get("s3_secret_key") or ""

    if not secret_key:
        return JSONResponse({
            "success": False,
            "message": "Secret Access Key не задан и не сохранён",
            "buckets": [],
        })

    if not data.s3_access_key:
        return JSONResponse({
            "success": False,
            "message": "Access Key ID не задан",
            "buckets": [],
        })

    # Write a temporary rclone.conf.
    config_content = (
        f"[{data.rclone_remote}]\n"
        f"type = s3\n"
        f"provider = Other\n"
        f"access_key_id = {data.s3_access_key}\n"
        f"secret_access_key = {secret_key}\n"
        f"region = {data.s3_region}\n"
        f"endpoint = {data.s3_endpoint}\n"
    )

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".conf", delete=False, encoding="utf-8"
    ) as f:
        f.write(config_content)
        tmp_path = Path(f.name)

    try:
        ok, message, buckets = await _run_rclone_lsd(tmp_path)
        return JSONResponse({
            "success": ok,
            "message": message,
            "buckets": buckets,
        })
    finally:
        try:
            tmp_path.unlink()
        except Exception:
            pass


# ============================================
# SCHEDULES — panel_tasks rows for backup_*
# ============================================

@router.get("/schedules", response_model=BackupScheduleListResponse)
async def list_schedules(
    _: dict = Depends(require_superadmin),
) -> JSONResponse:
    """
    All backup_* tasks from panel_tasks.
    """
    items = await CoreEngineLibBackupService.list_backup_tasks()
    return JSONResponse({"success": True, "data": items})


@router.put("/schedules/{task_id}")
async def update_schedule(
    task_id: int,
    data: BackupScheduleUpdate,
    _: dict = Depends(require_superadmin),
) -> JSONResponse:
    """
    Update cron and/or active for a backup_* task.

    Validates the cron expression via croniter. Returns the updated
    task on success, 404 if not found, 400 if cron is invalid.

    After the DB row is saved, the system crontab file
    /etc/cron.d/neurocad is regenerated from all active backup_*
    tasks. The system cron daemon picks up the new file
    automatically — no `crontab -e` and no reload required.
    """
    try:
        task = await CoreEngineLibBackupService.update_backup_task(
            task_id=task_id,
            cron=data.cron,
            active=data.active,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if task is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    # Regenerate /etc/cron.d/neurocad from panel_tasks.
    # If this fails (e.g. permissions), the DB row is still saved;
    # the user just won't see the change applied to the system cron.
    applied = await CoreEngineLibBackupService.apply_crontab()

    return JSONResponse({
        "success": True,
        "data": task,
        "crontab_applied": applied,
    })


# ============================================
# LIST — recent runs
# ============================================

@router.get("/list", response_model=BackupListResponse)
async def list_runs(
    level: Optional[str] = Query(None, pattern="^(hourly|daily|weekly|monthly|yearly)$"),
    limit: int = Query(50, ge=1, le=500),
    _: dict = Depends(require_superadmin),
) -> JSONResponse:
    """Recent backup runs, newest first. Filter by level optional."""
    items = await CoreEngineLibBackupService.list_recent(level=level, limit=limit)
    return JSONResponse({"success": True, "data": items})


# ============================================
# RUN — manual run from the UI, also from cron
# ============================================

@router.post("/run", response_model=BackupRunResponse)
async def run_now(
    data: BackupRunRequest,
    background: BackgroundTasks,
    _: dict = Depends(require_superadmin_or_panel_token),
) -> JSONResponse:
    """
    Run a backup now — in the background.

    Accepts either a JWT (UI button) or X-Panel-Token (system cron).
    Returns immediately; the actual run happens via BackgroundTasks.
    Before starting, the rclone.conf is regenerated from the current
    settings so the run uses fresh credentials.
    """
    if data.level not in LEVELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown level: {data.level!r}. Allowed: {', '.join(LEVELS)}",
        )

    # Regenerate rclone.conf before the run.
    await CoreEngineLibBackupService.write_rclone_config()

    background.add_task(run_backup, data.level)

    return JSONResponse({
        "success": True,
        "level": data.level,
        "started": True,
        "message": f"Бэкап {data.level} запущен в фоне",
    })