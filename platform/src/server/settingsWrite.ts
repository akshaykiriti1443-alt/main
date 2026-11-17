import { sql, type SQL } from "drizzle-orm";
import { workspaces } from "@/lib/db/schema";
import type { WorkspaceSettings } from "@/lib/db/types";

/**
 * A whole-settings write that never loses the member's journey (their ticks, "Do this later",
 * "Start Day N now"). Settings screens write back a copy read at the start of the request; a tick
 * saved in the same instant (src/actions/journey.ts writes only settings.journey, in one statement)
 * would otherwise be overwritten by that older copy. Whatever journey the row holds right now wins.
 */
export function settingsKeepingJourney(next: WorkspaceSettings): SQL {
  const { journey: _stale, ...rest } = next;
  return sql`${JSON.stringify(rest)}::jsonb || jsonb_strip_nulls(jsonb_build_object('journey', ${workspaces.settings}->'journey'))`;
}
