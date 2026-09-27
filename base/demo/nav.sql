-- Demo data: nav
-- Rows: 3

PRAGMA foreign_keys = OFF;

DELETE FROM "nav";

INSERT INTO "nav" ("id", "user_id", "parent_id", "card_type", "sort_order", "name", "description", "icon", "module_id", "is_delete", "created_at", "updated_at") VALUES (1, 1, NULL, 'link', 1, 'Каталог статей', NULL, NULL, 1, 0, '2026-09-27 11:40:12', '2026-09-27 11:40:12');
INSERT INTO "nav" ("id", "user_id", "parent_id", "card_type", "sort_order", "name", "description", "icon", "module_id", "is_delete", "created_at", "updated_at") VALUES (2, 2, NULL, 'link', 1, 'Каталог статей', 'Все статьи', NULL, 1, 0, '2026-09-27 11:48:12', '2026-09-27 11:48:12');
INSERT INTO "nav" ("id", "user_id", "parent_id", "card_type", "sort_order", "name", "description", "icon", "module_id", "is_delete", "created_at", "updated_at") VALUES (3, 3, NULL, 'link', 1, 'Каталог статей', NULL, NULL, 1, 0, '2026-09-27 15:24:21.482512', '2026-09-27 15:24:21.482514');

PRAGMA foreign_keys = ON;
