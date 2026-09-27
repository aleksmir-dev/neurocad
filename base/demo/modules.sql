-- Demo data: modules
-- Rows: 1

PRAGMA foreign_keys = OFF;

DELETE FROM "modules";

INSERT INTO "modules" ("id", "name", "description", "url", "is_delete", "created_at") VALUES (1, 'default', NULL, '/default', 0, '2026-09-20 07:50:04.551051');

PRAGMA foreign_keys = ON;
