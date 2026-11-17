"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/server/tenancy";
import { checkinSavedMessage, computeLadder, latestCheckins, saveCheckin } from "@/server/growth";
import { field, go } from "./helpers";

/** The check-in: numbers copied from Skool › Settings › Growth, once a week on any day. */
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
  const first = (await latestCheckins(wid, 2)).length === 1;
  revalidatePath(`/app/w/${wid}/growth`);
  go(`/app/w/${wid}/growth`, { ok: checkinSavedMessage(computeLadder(row), first) });
}
