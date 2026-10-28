import { getDb, type DB } from "@/lib/db";
import { activities } from "@/lib/db/schema";

export async function logActivity(
  input: { workspaceId: string; contactId?: string | null; type: string; refId?: string | null; data?: Record<string, unknown> },
  db?: DB,
) {
  const conn = db ?? (await getDb());
  await conn.insert(activities).values({
    workspaceId: input.workspaceId,
    contactId: input.contactId ?? null,
    type: input.type,
    refId: input.refId ?? null,
    data: input.data ?? {},
  });
}
