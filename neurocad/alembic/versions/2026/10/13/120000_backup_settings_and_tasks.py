"""backup settings and tasks

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-10-13 12:00:00.000000

"""

from typing import Sequence, Union
from datetime import datetime as dt
import json

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ============================================
# DEFAULTS
# ============================================

#: Default backup settings, stored as JSON in the `settings` table.
#: One row: domain="neurocad", subsys="backup", module="", key="backup".
#:
#: project_dir and local_dir are left as empty strings — the user
#: MUST set them via the UI before the first backup. This is
#: intentional: the package cannot guess where the project lives.
#: The other values are sensible defaults so a fresh install
#: works out of the box once the paths are set.
_DEFAULT_SETTINGS = {
    "project_dir": "",
    "local_dir": "",
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
        "app",
        "base",
        "etc",
        "media",
        "mig",
        "requirements.txt",
        "pyproject.toml",
        ".env",
        "README.md",
    ],
}


#: Default backup tasks — five rows in panel_tasks.
#: The scheduler (panel_scheduler.py) reads these and hits the URL
#: when next_run_at is due.
_DEFAULT_TASKS = [
    {
        "name": "backup_hourly",
        "title": "Бэкап (час)",
        "url": "/backup/run?level=hourly",
        "active": True,
        "cron": "0 * * * *",
    },
    {
        "name": "backup_daily",
        "title": "Бэкап (день)",
        "url": "/backup/run?level=daily",
        "active": True,
        "cron": "0 3 * * *",
    },
    {
        "name": "backup_weekly",
        "title": "Бэкап (неделя)",
        "url": "/backup/run?level=weekly",
        "active": True,
        "cron": "0 4 * * 0",
    },
    {
        "name": "backup_monthly",
        "title": "Бэкап (месяц)",
        "url": "/backup/run?level=monthly",
        "active": True,
        "cron": "0 5 1 * *",
    },
    {
        "name": "backup_yearly",
        "title": "Бэкап (год)",
        "url": "/backup/run?level=yearly",
        "active": True,
        "cron": "0 6 1 1 *",
    },
]


def upgrade() -> None:
    """Upgrade schema."""
    now = dt.now()

    # ===== 1. Seed backup settings =====
    settings_table = sa.table(
        "settings",
        sa.column("domain", sa.String),
        sa.column("subsys", sa.String),
        sa.column("module", sa.String),
        sa.column("section", sa.String),
        sa.column("key", sa.String),
        sa.column("value", sa.Text),
        sa.column("caption", sa.String),
        sa.column("description", sa.Text),
        sa.column("is_delete", sa.Boolean),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )

    op.bulk_insert(settings_table, [
        {
            "domain": "neurocad",
            "subsys": "backup",
            "module": "",
            "section": None,
            "key": "backup",
            "value": json.dumps(_DEFAULT_SETTINGS, ensure_ascii=False),
            "caption": "Настройки бэкапа",
            "description": "Параметры резервного копирования проекта",
            "is_delete": False,
            "created_at": now,
            "updated_at": now,
        },
    ])

    # ===== 2. Seed backup tasks =====
    tasks_table = sa.table(
        "panel_tasks",
        sa.column("name", sa.String),
        sa.column("title", sa.String),
        sa.column("url", sa.String),
        sa.column("active", sa.Boolean),
        sa.column("cron", sa.String),
        sa.column("last_run_at", sa.DateTime),
        sa.column("last_status", sa.String),
        sa.column("last_error", sa.Text),
        sa.column("next_run_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
        sa.column("updated_by", sa.Integer),
    )

    op.bulk_insert(tasks_table, [
        {
            **task,
            "last_run_at": None,
            "last_status": None,
            "last_error": None,
            "next_run_at": None,
            "updated_at": now,
            "updated_by": None,
        }
        for task in _DEFAULT_TASKS
    ])

    # ===== 3. Fix metrics_hourly URL =====
    # The old /services/panel/metrics path was left over from the
    # pre-refactor layout. The panel now lives at /panel/metrics.
    op.execute(
        sa.text(
            "UPDATE panel_tasks "
            "SET url = :new_url "
            "WHERE name = :name"
        ).bindparams(
            new_url="/panel/metrics",
            name="metrics_hourly",
        )
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Remove backup tasks
    op.execute(
        sa.text(
            "DELETE FROM panel_tasks WHERE name IN "
            "('backup_hourly', 'backup_daily', 'backup_weekly', "
            "'backup_monthly', 'backup_yearly')"
        )
    )

    # Remove backup settings row
    op.execute(
        sa.text(
            "DELETE FROM settings "
            "WHERE domain = :domain AND subsys = :subsys "
            "AND module = :module AND key = :key"
        ).bindparams(
            domain="neurocad",
            subsys="backup",
            module="",
            key="backup",
        )
    )

    # Restore the old metrics_hourly URL
    op.execute(
        sa.text(
            "UPDATE panel_tasks "
            "SET url = :old_url "
            "WHERE name = :name"
        ).bindparams(
            old_url="/services/panel/metrics",
            name="metrics_hourly",
        )
    )