-- Carry over everyone who had access under the old member-code system, so nobody is locked out
-- by the switch. Each owner of a member-managed workspace becomes an active member for 35 days
-- (channel skool_export), long enough for the admin's first Skool export upload to confirm them.
-- That upload then removes anyone who has really left, like any other sync.
INSERT INTO "member_access" ("email", "name", "channel", "status", "active_until", "last_seen_at", "payload")
SELECT DISTINCT ON (u."email") u."email", u."name", 'skool_export', 'active',
       greatest(coalesce(w."access_verified_until", now()), now()) + interval '35 days', now(),
       '{"carriedOver": "member_codes"}'::jsonb
FROM "workspaces" w
JOIN "workspace_members" wm ON wm."workspace_id" = w."id" AND wm."role" = 'owner'
JOIN "users" u ON u."id" = wm."user_id"
WHERE w."access_source" = 'member'
ORDER BY u."email", w."access_verified_until" DESC NULLS LAST
ON CONFLICT ("email", "channel") DO UPDATE SET "status" = 'active', "active_until" = greatest("member_access"."active_until", excluded."active_until");--> statement-breakpoint
UPDATE "workspaces" w
SET "access_verified_until" = greatest(coalesce(w."access_verified_until", now()), now()) + interval '35 days',
    "status" = 'active', "grace_ends_at" = NULL, "paused_at" = NULL, "pause_reason" = NULL
WHERE w."access_source" = 'member' AND (w."status" = 'grace' OR w."status" = 'active' OR w."pause_reason" = 'access');
