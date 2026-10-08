-- Demo data: nav
-- Rows: 8

PRAGMA foreign_keys = OFF;

DELETE FROM "nav";

INSERT INTO "nav" ("id", "user_id", "parent_id", "card_type", "sort_order", "name", "description", "icon", "module_id", "is_delete", "created_at", "updated_at") VALUES (1, 1, NULL, 'link', 1, 'Демо-сайты', NULL, NULL, 1, 0, '2026-09-27 11:40:12', '2026-10-03 22:34:00.440099');
INSERT INTO "nav" ("id", "user_id", "parent_id", "card_type", "sort_order", "name", "description", "icon", "module_id", "is_delete", "created_at", "updated_at") VALUES (2, 2, NULL, 'link', 1, 'Каталог статей', 'Все статьи', NULL, 1, 0, '2026-09-27 11:48:12', '2026-09-27 11:48:12');
INSERT INTO "nav" ("id", "user_id", "parent_id", "card_type", "sort_order", "name", "description", "icon", "module_id", "is_delete", "created_at", "updated_at") VALUES (3, 3, NULL, 'link', 1, 'Каталог статей', NULL, NULL, 1, 0, '2026-09-27 15:24:21.482512', '2026-09-27 15:24:21.482514');
INSERT INTO "nav" ("id", "user_id", "parent_id", "card_type", "sort_order", "name", "description", "icon", "module_id", "is_delete", "created_at", "updated_at") VALUES (4, 4, NULL, 'link', 1, 'Каталог статей', NULL, NULL, 1, 0, '2026-10-03 09:39:33.493135', '2026-10-03 09:39:33.493137');
INSERT INTO "nav" ("id", "user_id", "parent_id", "card_type", "sort_order", "name", "description", "icon", "module_id", "is_delete", "created_at", "updated_at") VALUES (5, 5, NULL, 'link', 1, 'Каталог статей', NULL, NULL, 1, 0, '2026-10-03 10:19:32.559402', '2026-10-03 10:19:32.559407');
INSERT INTO "nav" ("id", "user_id", "parent_id", "card_type", "sort_order", "name", "description", "icon", "module_id", "is_delete", "created_at", "updated_at") VALUES (6, 6, NULL, 'link', 1, 'Мои проекты', NULL, NULL, 1, 0, '2026-10-03 13:05:03.300864', '2026-10-07 07:19:51.153205');
INSERT INTO "nav" ("id", "user_id", "parent_id", "card_type", "sort_order", "name", "description", "icon", "module_id", "is_delete", "created_at", "updated_at") VALUES (7, 7, NULL, 'link', 1, 'Каталог статей', NULL, NULL, 1, 0, '2026-10-04 00:17:42.821006', '2026-10-04 00:17:42.821010');
INSERT INTO "nav" ("id", "user_id", "parent_id", "card_type", "sort_order", "name", "description", "icon", "module_id", "is_delete", "created_at", "updated_at") VALUES (8, 8, NULL, 'link', 1, 'Каталог статей', NULL, NULL, 1, 0, '2026-10-08 04:15:24.822133', '2026-10-08 04:15:24.822136');

PRAGMA foreign_keys = ON;
