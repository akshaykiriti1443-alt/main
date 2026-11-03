"use server";

import { requireWorkspace } from "@/server/tenancy";
import { companionSnapshot, type CompanionSnapshot } from "@/server/companion";
import { isUuid } from "@/lib/util";

/** Fresh "where am I on Your path" for the guide, after each page change. */
export async function companionSnapshotAction(
  wid: string,
): Promise<CompanionSnapshot | null> {
  if (!isUuid(wid)) return null;
  try {
    const { workspace, user } = await requireWorkspace(wid, "user", {
      allowPaused: true,
      allowEntry: true,
    });
    return await companionSnapshot(workspace, user.id);
  } catch {
    return null;
  }
}
