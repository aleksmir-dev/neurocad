# neurocad/core/engine/lib/backup/schema.py

"""
Pydantic schemas for the backup module.

Namespace: CoreEngineLibBackupSchema

Schemas:
  - BackupReportRequest  — payload posted by an external script.
  - BackupReportResponse — response to a backup report.
  - BackupSettingsSchema — full backup config; source of truth for
                           the UI form. Field descriptions are shown
                           as hints in the panel.
  - BackupSettingsResponse — response for GET /backup/settings.
  - BackupRunItem / BackupListResponse — history list.
  - BackupRunRequest / BackupRunResponse — manual run.
  - S3TestRequest / S3TestResponse — test S3 credentials.
  - BackupScheduleItem / BackupScheduleListResponse — panel_tasks
                           rows for backup_*.
  - BackupScheduleUpdate — request for PUT /backup/schedules/{id}.

Note on input normalization:
    Users often paste S3 credentials with leading/trailing spaces
    or surrounded by quotes (from JSON, .env, or console output).
    All S3 string fields are normalized via `@field_validator`:
        value.strip().strip("'\"")
    This is defense in depth — service.save_settings() also strips,
    but starting clean at the schema boundary avoids surprises in
    any downstream code that forgets to do it.
"""

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


# ============================================
# HELPERS
# ============================================

def _clean_str(v: Optional[str]) -> Optional[str]:
    """
    Strip whitespace and surrounding single/double quotes from a
    string. Returns None for None — so Optional fields stay None.

    Rationale: users paste keys with a leading space (" f5...") or
    wrap them in quotes ('"f5..."'). rclone then sends the wrong
    value and S3 rejects it with an auth error. We saw this exact
    bug on production — this is the fix at the input boundary.
    """
    if v is None:
        return None
    if not isinstance(v, str):
        return v
    return v.strip().strip("'\"")


# ============================================
# BACKUP REPORT — written by external scripts
# ============================================

class BackupReportRequest(BaseModel):
    """
    Payload posted to POST /backup/report.

    Used when a backup runs OUTSIDE this Python package (e.g. an
    old backup.sh on another server). The normal path is run_backup()
    which writes to backup_runs directly — no HTTP, no token.

    level:  hourly / daily / weekly / monthly / yearly
    status: success / failed
    """
    level: str = Field(..., pattern="^(hourly|daily|weekly|monthly|yearly)$")
    status: str = Field(..., pattern="^(success|failed)$")
    started_at: datetime
    finished_at: Optional[datetime] = None
    size_bytes: Optional[int] = Field(None, ge=0)
    error: Optional[str] = None


class BackupReportResponse(BaseModel):
    """Response to a backup report — always success if accepted."""
    success: bool = True
    run_id: int


# ============================================
# SETTINGS — source of truth for the UI form
# ============================================

class BackupSettingsSchema(BaseModel):
    """
    Full backup configuration.

    Stored as a single JSON row in the shared `settings` table:
        domain="neurocad", subsys="backup", module="", key="backup"

    Field descriptions (Field(..., description=...)) are sent to the
    UI as hints — they are the ONLY documentation of what each
    setting means. When adding a new field here, add a clear
    description: it will be shown to the user in the panel.

    The S3 secret key (s3_secret_key) is stored ENCRYPTED via
    neurocad.utils.crypto.encrypt(). The response schema blanks it
    and sets s3_secret_key_set to let the UI know whether a secret
    is already stored.

    All S3 string fields are normalized on input:
    strip whitespace and surrounding quotes. See _clean_str() above.
    """
    # ---- Common ----
    project_dir: str = Field(
        ...,
        description="Папка проекта, которую нужно бэкапить (абсолютный путь)",
    )
    local_dir: str = Field(
        ...,
        description="Локальная папка для временных архивов перед заливкой в S3",
    )

    # ---- S3 / rclone ----
    rclone_remote: str = Field(
        "selectel",
        description="Имя rclone-remote (используется в rclone.conf)",
    )
    rclone_bucket: str = Field(
        "neurocad-backups",
        description="Имя бакета в S3",
    )
    s3_endpoint: str = Field(
        "https://s3.storage.selcloud.ru",
        description="Endpoint S3 (Selectel: https://s3.storage.selcloud.ru)",
    )
    s3_region: str = Field(
        "ru-3",
        description="Регион S3 (ru-3 — СПб, ru-1 — Москва)",
    )
    s3_access_key: str = Field(
        "",
        description="Access Key ID из панели Selectel",
    )
    s3_secret_key: str = Field(
        "",
        description="Secret Access Key из панели Selectel. Оставь пустым, чтобы не менять сохранённый.",
    )

    # ---- Retention ----
    keep: Dict[str, int] = Field(
        default_factory=lambda: {
            "hourly": 24, "daily": 7, "weekly": 4,
            "monthly": 12, "yearly": 1,
        },
        description="Сколько последних архивов хранить на каждом уровне",
    )

    # ---- What to include ----
    include: List[str] = Field(
        default_factory=lambda: [
            "app", "base", "etc", "media", "mig",
            "requirements.txt", "pyproject.toml", ".env", "README.md",
        ],
        description="Что включать в архив: папки и файлы относительно project_dir",
    )

    # ---- Normalization ----
    @field_validator(
        "rclone_remote", "rclone_bucket",
        "s3_endpoint", "s3_region",
        "s3_access_key", "s3_secret_key",
        mode="after",
    )
    @classmethod
    def _strip_s3_fields(cls, v: str) -> str:
        """Strip whitespace / quotes from all S3-related string fields."""
        return _clean_str(v) or ""

    @field_validator("project_dir", "local_dir", mode="after")
    @classmethod
    def _strip_paths(cls, v: str) -> str:
        """Strip whitespace from path fields (quotes are valid in paths)."""
        return v.strip() if isinstance(v, str) else v


class BackupSettingsResponse(BaseModel):
    """
    Response for GET /backup/settings.

    `data` is None when the settings row is missing (first run,
    before the seed migration).

    When data is present, `s3_secret_key` is always "" (never sent
    to the browser) and `s3_secret_key_set` indicates whether a
    secret is already stored in the DB.
    """
    success: bool = True
    data: Optional[Dict] = None  # dict — because s3_secret_key_set is dynamic


# ============================================
# RUN — one backup run in the UI list
# ============================================

class BackupRunItem(BaseModel):
    """One backup run, as returned by GET /backup/list."""
    id: int
    level: str
    status: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    size_bytes: Optional[int] = None
    error: Optional[str] = None


class BackupListResponse(BaseModel):
    """Response for GET /backup/list."""
    success: bool = True
    data: List[BackupRunItem] = Field(default_factory=list)


# ============================================
# RUN — request for POST /backup/run
# ============================================

class BackupRunRequest(BaseModel):
    """Request body for POST /backup/run (manual run from the UI)."""
    level: str = Field(..., pattern="^(hourly|daily|weekly|monthly|yearly)$")


class BackupRunResponse(BaseModel):
    """Response for POST /backup/run."""
    success: bool = True
    level: str
    started: bool = True
    message: Optional[str] = None


# ============================================
# S3 TEST — verify credentials
# ============================================

class S3TestRequest(BaseModel):
    """
    Request body for POST /backup/s3/test.

    Sent from the UI when the user clicks "Проверить подключение".
    If s3_secret_key is empty — the stored (encrypted) secret is used.
    """
    s3_endpoint: str = Field(..., description="Endpoint S3")
    s3_region: str = Field(..., description="Region S3")
    s3_access_key: str = Field(..., description="Access Key ID")
    s3_secret_key: str = Field(
        "",
        description="Secret Access Key. Пусто — использовать сохранённый.",
    )
    rclone_remote: str = Field(
        "selectel",
        description="Имя rclone-remote",
    )
    rclone_bucket: str = Field(
        "neurocad-backups",
        description="Бакет, который нужно проверить",
    )

    @field_validator(
        "s3_endpoint", "s3_region",
        "s3_access_key", "s3_secret_key",
        "rclone_remote", "rclone_bucket",
        mode="after",
    )
    @classmethod
    def _strip_fields(cls, v: str) -> str:
        """Strip whitespace / quotes — see _clean_str() for rationale."""
        return _clean_str(v) or ""


class S3TestResponse(BaseModel):
    """
    Response for POST /backup/s3/test.

    success — True if the bucket is reachable with these credentials.
    message — human-readable result: "OK" or the error text.
    buckets — list of buckets visible to this key (if success).
    """
    success: bool
    message: str
    buckets: List[str] = Field(default_factory=list)


# ============================================
# SCHEDULES — panel_tasks rows for backup_*
# ============================================

class BackupScheduleItem(BaseModel):
    """
    One backup schedule.

    Backed by a `panel_tasks` row whose name starts with "backup_".
    The row is seeded by the `backup_settings_and_tasks` migration
    and can be edited from the UI (cron / active).
    """
    id: int
    name: str
    title: str
    url: str
    cron: str
    active: bool
    last_run_at: Optional[str] = None
    last_status: Optional[str] = None
    last_error: Optional[str] = None
    next_run_at: Optional[str] = None


class BackupScheduleListResponse(BaseModel):
    """Response for GET /backup/schedules."""
    success: bool = True
    data: List[BackupScheduleItem] = Field(default_factory=list)


# ============================================
# SCHEDULES — update
# ============================================

class BackupScheduleUpdate(BaseModel):
    """
    Request body for PUT /backup/schedules/{id}.

    Only `cron` and `active` are editable. Other fields (name,
    title, url) are seeded by the migration and never change from
    the UI.

    Both fields are optional: sending only `cron` updates just the
    cron expression, sending only `active` toggles the task on or
    off, sending both updates both.
    """
    cron: Optional[str] = Field(
        None,
        min_length=1,
        max_length=128,
        description="Cron-выражение (например, '0 * * * *' — каждый час)",
    )
    active: Optional[bool] = Field(
        None,
        description="Включить или выключить задачу",
    )