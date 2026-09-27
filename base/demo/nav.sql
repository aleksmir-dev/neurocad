-- Demo data: nav
-- Rows: 1

PRAGMA foreign_keys = OFF;

DELETE FROM "nav";

INSERT INTO "nav" ("id", "user_id", "parent_id", "card_type", "sort_order", "name", "description", "icon", "module_id", "is_delete", "created_at", "updated_at") VALUES (1, 1, NULL, 'link', 1, 'Каталог статей', NULL, NULL, 1, 0, '2026-09-27 16:37:31', '2026-09-27 16:37:31');

PRAGMA foreign_keys = ON;
