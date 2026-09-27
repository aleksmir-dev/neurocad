# neurocad/utils/dbsqlite/demo_export.py

"""
Export demo data from a working SQLite DB into SQL dumps.

Usage (from the project root, e.g. in release.sh):

    python -m neurocad.utils.dbsqlite.demo_export \
        --db test/base/neurocad.db \
        --out base/demo

The --out directory is cleaned and re-created before writing.

Never exports:
    users, settings, page_chat, page_hist, runs,
    page_pres, password_resets, alembic_version

Images are NOT exported: editor/images/files/*.svg live inside the
package and ship with it. The demo SQL only references paths under
/static/.../images/files/ — those files are already present after
`pip install`.
"""

import argparse
import json
import shutil
import sqlite3
from pathlib import Path


# Tables exported, in FK-safe order:
#   1. modules — no dependencies
#   2. pages   — FK to modules, self-ref (template_id)
#   3. nav     — FK to modules, self-ref (parent_id)
#   4. access  — no FK
TABLES = ["modules", "pages", "nav", "access"]

# Never exported.
SKIP = {
    "users", "settings", "page_chat", "page_hist", "runs",
    "page_pres", "password_resets", "alembic_version",
}

# For self-ref tables: order parents (NULL) first, then children by id.
SELF_REF_COLUMN = {
    "pages": "template_id",
    "nav": "parent_id",
}


def dump_table(conn, table, out_path):
    """Write a single table as an SQL dump file."""
    cur = conn.cursor()

    order_by = ""
    if table in SELF_REF_COLUMN:
        col = SELF_REF_COLUMN[table]
        # (col IS NULL) → 1 for roots, 0 for children. DESC → roots first.
        order_by = f" ORDER BY ({col} IS NULL) DESC, id ASC"

    cur.execute(f'SELECT * FROM "{table}"{order_by}')
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]

    lines = [
        f"-- Demo data: {table}",
        f"-- Rows: {len(rows)}",
        "",
        # Disable FK during the import — self-ref rows may reference
        # rows later in the file, and cross-table order is not
        # guaranteed to be FK-clean in every SQLite build.
        "PRAGMA foreign_keys = OFF;",
        "",
        f'DELETE FROM "{table}";',
        "",
    ]

    if rows:
        cols_sql = ", ".join(f'"{c}"' for c in cols)
        for row in rows:
            vals = []
            for v in row:
                if v is None:
                    vals.append("NULL")
                elif isinstance(v, bool):
                    vals.append("1" if v else "0")
                elif isinstance(v, (int, float)):
                    vals.append(str(v))
                elif isinstance(v, bytes):
                    vals.append(f"X'{v.hex()}'")
                else:
                    s = str(v).replace("'", "''")
                    vals.append(f"'{s}'")
            lines.append(
                f'INSERT INTO "{table}" ({cols_sql}) VALUES ({", ".join(vals)});'
            )

    lines.append("")
    lines.append("PRAGMA foreign_keys = ON;")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len(rows)


def export_demo(db_path: Path, out_dir: Path) -> None:
    """Clean out_dir, then dump all demo tables + manifest.json into it."""
    if not db_path.is_file():
        raise SystemExit(f"ERROR: DB not found: {db_path}")

    if out_dir.exists():
        print(f"Cleaning {out_dir} ...")
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"DB:  {db_path}")
    print(f"OUT: {out_dir}")

    conn = sqlite3.connect(db_path)
    try:
        for table in TABLES:
            if table in SKIP:
                continue
            out_sql = out_dir / f"{table}.sql"
            n = dump_table(conn, table, out_sql)
            print(f"  {table}: {n} rows → {out_sql.name}")
    finally:
        conn.close()

    manifest = {
        "version": 1,
        "applied": False,
        "tables": TABLES,
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("  manifest.json written")
    print("Done.")


def main():
    ap = argparse.ArgumentParser(
        description="Export demo data from a working SQLite DB.",
    )
    ap.add_argument("--db", required=True, help="Source SQLite DB path")
    ap.add_argument("--out", required=True, help="Output directory (base/demo)")
    args = ap.parse_args()

    export_demo(
        db_path=Path(args.db).resolve(),
        out_dir=Path(args.out).resolve(),
    )


if __name__ == "__main__":
    main()