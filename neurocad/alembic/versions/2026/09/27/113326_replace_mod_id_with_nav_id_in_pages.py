"""replace mod_id with nav_id in pages

Revision ID: dcccfce2b645
Revises: 0fee0a076f0b
Create Date: 2026-09-27 11:33:26.520539

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "dcccfce2b645"
down_revision: Union[str, Sequence[str], None] = "0fee0a076f0b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ============================================
# HELPERS
# ============================================

def _ensure_admin_nav(conn) -> int:
    """
    Make sure admin (user_id=1) has a Nav row for the 'default'
    module (module_id=1). Return its id.

    Idempotent: if the row already exists, returns its id without
    inserting anything.
    """
    # Find module_id by name 'default' — safer than assuming id=1.
    row = conn.execute(
        sa.text("SELECT id FROM modules WHERE name = 'default' AND is_delete = 0 LIMIT 1")
    ).fetchone()

    if row is None:
        # No 'default' module — nothing to attach pages to.
        # Fall back to module_id=1 anyway, so the migration at
        # least doesn't fail on a fresh DB where modules table
        # is empty.
        module_id = 1
    else:
        module_id = row[0]

    # Does admin already have a nav for this module?
    row = conn.execute(
        sa.text(
            "SELECT id FROM nav "
            "WHERE user_id = 1 AND module_id = :mid AND is_delete = 0 "
            "LIMIT 1"
        ),
        {"mid": module_id},
    ).fetchone()

    if row is not None:
        return row[0]

    # Create it.
    conn.execute(
        sa.text(
            "INSERT INTO nav "
            "(user_id, parent_id, card_type, sort_order, name, description, icon, "
            " module_id, is_delete, created_at, updated_at) "
            "VALUES "
            "(1, NULL, 'link', 1, 'Каталог статей', NULL, NULL, "
            " :mid, 0, datetime('now'), datetime('now'))"
        ),
        {"mid": module_id},
    )

    row = conn.execute(
        sa.text(
            "SELECT id FROM nav "
            "WHERE user_id = 1 AND module_id = :mid AND is_delete = 0 "
            "LIMIT 1"
        ),
        {"mid": module_id},
    ).fetchone()
    return row[0]


# ============================================
# UPGRADE
# ============================================

def upgrade() -> None:
    """Replace pages.mod_id with pages.nav_id (SQLite-safe)."""
    conn = op.get_bind()

    # Step 1. Ensure the admin has a nav row we can point pages to.
    nav_id = _ensure_admin_nav(conn)
    print(f"[migration] admin default nav_id = {nav_id}")

    # Step 2. Create a new pages table with nav_id instead of mod_id.
    #
    # We don't use op.create_table here because we want an exact copy
    # of the existing columns (including template_id FK) with just
    # mod_id → nav_id swapped. Writing the DDL explicitly is the
    # cleanest way to do that on SQLite.
    op.execute(
        """
        CREATE TABLE pages_new (
            id INTEGER NOT NULL,
            nav_id INTEGER NOT NULL,
            datetime DATETIME NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            logo TEXT,
            content TEXT,
            content_json TEXT,
            is_active INTEGER NOT NULL,
            is_delete INTEGER NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            rss_yandex_id VARCHAR(64),
            is_template INTEGER DEFAULT '0' NOT NULL,
            template_id INTEGER,
            css TEXT,
            PRIMARY KEY (id),
            CONSTRAINT fk_pages_template_id
                FOREIGN KEY(template_id) REFERENCES pages (id)
        )
        """
    )

    # Step 3. Copy all existing rows, mapping mod_id → nav_id.
    #
    # Every existing page currently belongs to some module. In the
    # current data model there is only one module ('default') and
    # only one nav per (user, module), so we can safely point all
    # rows at nav_id. If more modules ever existed, this would need
    # a per-module lookup — but today it's a single value.
    #
    # NOTE: op.execute() does not accept a parameters dict as a
    # second argument. Bind parameters must go through
    # .bindparams() on the sa.text() construct instead.
    op.execute(
        sa.text(
            "INSERT INTO pages_new ("
            "  id, nav_id, datetime, title, description, logo, "
            "  content, content_json, is_active, is_delete, "
            "  created_at, updated_at, rss_yandex_id, is_template, "
            "  template_id, css"
            ") "
            "SELECT "
            "  id, :nav_id, datetime, title, description, logo, "
            "  content, content_json, is_active, is_delete, "
            "  created_at, updated_at, rss_yandex_id, is_template, "
            "  template_id, css "
            "FROM pages"
        ).bindparams(nav_id=nav_id)
    )

    # Step 4. Swap tables.
    op.execute("DROP TABLE pages")
    op.execute("ALTER TABLE pages_new RENAME TO pages")

    # Step 5. Recreate indexes under the new names.
    op.create_index("idx_pages_nav_id", "pages", ["nav_id"], unique=False)
    op.create_index(
        "idx_pages_nav_datetime", "pages", ["nav_id", "datetime"], unique=False
    )
    op.create_index("idx_pages_datetime", "pages", ["datetime"], unique=False)
    op.create_index("idx_pages_is_delete", "pages", ["is_delete"], unique=False)
    op.create_index("idx_pages_is_active", "pages", ["is_active"], unique=False)
    op.create_index(
        "idx_pages_rss_yandex_id", "pages", ["rss_yandex_id"], unique=False
    )
    op.create_index("idx_pages_is_template", "pages", ["is_template"], unique=False)
    op.create_index("idx_pages_template_id", "pages", ["template_id"], unique=False)


# ============================================
# DOWNGRADE
# ============================================

def downgrade() -> None:
    """Restore pages.mod_id, drop pages.nav_id (SQLite-safe)."""
    # Step 1. Create a new pages table with mod_id.
    op.execute(
        """
        CREATE TABLE pages_old (
            id INTEGER NOT NULL,
            mod_id INTEGER NOT NULL,
            datetime DATETIME NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            logo TEXT,
            content TEXT,
            content_json TEXT,
            is_active INTEGER NOT NULL,
            is_delete INTEGER NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            rss_yandex_id VARCHAR(64),
            is_template INTEGER DEFAULT '0' NOT NULL,
            template_id INTEGER,
            css TEXT,
            PRIMARY KEY (id),
            CONSTRAINT fk_pages_template_id
                FOREIGN KEY(template_id) REFERENCES pages (id)
        )
        """
    )

    # Step 2. Copy data back, resolving module_id via nav.module_id.
    # If a page's nav has been deleted, we fall back to module_id=1
    # so the row survives.
    op.execute(
        """
        INSERT INTO pages_old (
            id, mod_id, datetime, title, description, logo,
            content, content_json, is_active, is_delete,
            created_at, updated_at, rss_yandex_id, is_template,
            template_id, css
        )
        SELECT
            p.id,
            COALESCE(n.module_id, 1) AS mod_id,
            p.datetime, p.title, p.description, p.logo,
            p.content, p.content_json, p.is_active, p.is_delete,
            p.created_at, p.updated_at, p.rss_yandex_id, p.is_template,
            p.template_id, p.css
        FROM pages p
        LEFT JOIN nav n ON n.id = p.nav_id
        """
    )

    # Step 3. Swap tables.
    op.execute("DROP TABLE pages")
    op.execute("ALTER TABLE pages_old RENAME TO pages")

    # Step 4. Recreate indexes under the old names.
    op.create_index("idx_pages_mod_id", "pages", ["mod_id"], unique=False)
    op.create_index(
        "idx_pages_mod_datetime", "pages", ["mod_id", "datetime"], unique=False
    )
    op.create_index("idx_pages_datetime", "pages", ["datetime"], unique=False)
    op.create_index("idx_pages_is_delete", "pages", ["is_delete"], unique=False)
    op.create_index("idx_pages_is_active", "pages", ["is_active"], unique=False)
    op.create_index(
        "idx_pages_rss_yandex_id", "pages", ["rss_yandex_id"], unique=False
    )
    op.create_index("idx_pages_is_template", "pages", ["is_template"], unique=False)
    op.create_index("idx_pages_template_id", "pages", ["template_id"], unique=False)