-- Carry Zapier approvals into member_access and move every Skool-managed workspace to "member".
INSERT INTO "member_access" ("email", "name", "channel", "status", "active_until", "last_seen_at", "payload")
SELECT "email", "name", 'skool_zapier', 'active', "approved_until", "created_at", "payload" FROM "skool_approvals"
ON CONFLICT ("email", "channel") DO NOTHING;--> statement-breakpoint
UPDATE "workspaces" SET "access_source" = 'member' WHERE "access_source" IN ('skool_code', 'skool_zapier', 'stripe');--> statement-breakpoint
DROP TABLE "access_codes" CASCADE;--> statement-breakpoint
DROP TABLE "skool_approvals" CASCADE;