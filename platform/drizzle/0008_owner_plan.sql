-- The platform owner's own workspaces get the Owner plan: every feature, no usage caps, lifetime access.
UPDATE "workspaces" w
SET "plan" = 'owner', "access_source" = 'admin', "status" = 'active', "grace_ends_at" = NULL, "paused_at" = NULL, "pause_reason" = NULL
FROM "workspace_members" wm, "users" u, "agencies" a
WHERE wm."workspace_id" = w."id" AND wm."role" = 'owner' AND u."id" = wm."user_id" AND u."is_platform_admin" = true
  AND a."id" = w."agency_id" AND a."is_platform" = true;
