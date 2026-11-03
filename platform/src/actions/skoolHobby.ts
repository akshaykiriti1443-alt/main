"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { isPublicHttpsUrl } from "@/lib/html";
import { isUuid } from "@/lib/util";
import { requireWorkspace } from "@/server/tenancy";
import { markWelcomed } from "@/server/skoolHobby";
import { field, go } from "./helpers";

/** The welcome and "before you go" videos (Skool Pro's onboarding / cancellation video, by email). */
export async function saveSkoolVideosAction(wid: string, fd: FormData) {
  await requireWorkspace(wid, "admin");
  const back = `/app/w/${wid}/skool#hobby-plugins`;
  const onboarding = field(fd, "onboardingVideoUrl", 1000);
  const cancel = field(fd, "cancelVideoUrl", 1000);
  for (const url of [onboarding, cancel]) {
    if (url && !isPublicHttpsUrl(url)) go(back, { error: "Use a public https:// link for each video (Loom, YouTube, Vimeo or Google Drive all work)." });
  }
  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, wid)).limit(1);
  const settings = { ...(ws?.settings ?? {}) };
  if (onboarding) settings.onboardingVideoUrl = onboarding;
  else delete settings.onboardingVideoUrl;
  if (cancel) settings.cancelVideoUrl = cancel;
  else delete settings.cancelVideoUrl;
  await db.update(workspaces).set({ settings }).where(eq(workspaces.id, wid));
  revalidatePath(`/app/w/${wid}/skool`);
  go(back, { ok: "Saved. Your Welcome and Save emails now carry your videos (in the recipes, it's {{onboarding_video_line}} and {{cancel_video_line}})." });
}

/** Ticks someone off the "today's hellos" list once the owner has sent their DM in Skool. */
export async function markWelcomedAction(wid: string, contactId: string) {
  await requireWorkspace(wid);
  if (!isUuid(contactId)) return;
  await markWelcomed(wid, contactId);
  revalidatePath(`/app/w/${wid}/skool`);
}
