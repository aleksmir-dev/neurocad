-- Demo data: modules
-- Rows: 2

PRAGMA foreign_keys = OFF;

DELETE FROM "modules";

INSERT INTO "modules" ("id", "name", "description", "url", "is_delete", "created_at") VALUES (1, 'default', NULL, '/admin', 0, '2026-09-27 08:35:13.738984');
INSERT INTO "modules" ("id", "name", "description", "url", "is_delete", "created_at") VALUES (2, 'admin', NULL, '/admin', 0, '2026-10-02 00:06:51.041706');

PRAGMA foreign_keys = ON;
