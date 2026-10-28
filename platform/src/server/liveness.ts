import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agencies, workspaces } from "@/lib/db/schema";

/** A workspace runs (sends, captures, posts) only when it and its agency are not paused. */
export async function isWorkspaceLive(workspaceId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ status: workspaces.status, agencyStatus: agencies.status })
    .from(workspaces)
    .innerJoin(agencies, eq(agencies.id, workspaces.agencyId))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return Boolean(row && row.status !== "paused" && row.agencyStatus !== "paused");
}
