"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/server/tenancy";
import { computeLadder, saveCheckin } from "@/server/growth";
import { field, go } from "./helpers";

/** The Monday check-in: numbers copied from Skool › Settings › Growth. */
export async function saveCheckinAction(wid: string, fd: FormData) {
  await requireWorkspace(wid);
  const n = (k: string) => Number(field(fd, k, 12).replace(/[^\d.]/g, "")) || 0;
  const row = await saveCheckin(wid, {
    aboutVisitors: n("aboutVisitors"),
    networkSignups: n("networkSignups"),
    newPaid: n("newPaid"),
    members: n("members"),
    skoolLevel: n("skoolLevel") || 1,
    boostPercent: field(fd, "boostPercent") === "" ? 30 : n("boostPercent"),
    linkInBio: fd.get("linkInBio") === "on",
    postsPerWeek: n("postsPerWeek"),
    adSpendPerDay: n("adSpendPerDay"),
    note: field(fd, "note", 1000),
  });
  const ladder = computeLadder(row);
  revalidatePath(`/app/w/${wid}/growth`);
  go(`/app/w/${wid}/growth`, {
    ok: ladder.next ? `Saved. Your numbers qualify for Level ${ladder.qualifies}. Next up: Level ${ladder.next.level}.` : "Saved. You're at the top level.",
  });
}
