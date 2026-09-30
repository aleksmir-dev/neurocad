-- Demo data: modules
-- Rows: 2

PRAGMA foreign_keys = OFF;

DELETE FROM "modules";

INSERT INTO "modules" ("id", "name", "description", "url", "is_delete", "created_at") VALUES (1, 'default', NULL, '/default', 0, '2026-09-27 08:35:13.738984');
INSERT INTO "modules" ("id", "name", "description", "url", "is_delete", "created_at") VALUES (2, 'dev.neurocad.ru', NULL, '/dev.neurocad.ru', 0, '2026-09-30 07:30:52.689816');

PRAGMA foreign_keys = ON;
