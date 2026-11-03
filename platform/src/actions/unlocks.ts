"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { unlocks, workspaceMembers } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { requirePlatformAdmin } from "@/server/auth";
import { claimEntryTicket, claimUnlock, createUnlock, setEntryTicket, setUnlockActive, getEntryTicket, updateUnlock, type UnlockInput } from "@/server/unlocks";
import { isUuid } from "@/lib/util";
import { clientIp } from "@/lib/ip";
import { errMsg, field, go } from "./helpers";

export type ClaimState = {
  error?: string;
  done?: { title: string; reward: string; rewardUrl: string; already: boolean };
  values?: { name?: string; email?: string; postUrl?: string };
};

/** Public: a member claims an unlock by pasting the link to their Skool post or comment. */
export async function claimUnlockAction(slug: string, _prev: ClaimState, fd: FormData): Promise<ClaimState> {
  const values = { name: field(fd, "name", 120), email: field(fd, "email", 200), postUrl: field(fd, "postUrl", 500) };
  const res = await claimUnlock({ slug, ...values, honeypot: field(fd, "website", 100), limits: { ip: clientIp(await headers()) } });
  if (!res.ok) return { error: res.error, values };
  return { done: { title: res.title, reward: res.reward, rewardUrl: res.rewardUrl, already: res.already } };
}

const unlockFields = (fd: FormData): UnlockInput => ({
  title: field(fd, "title", 80),
  reward: field(fd, "reward", 300),
  rewardUrl: field(fd, "rewardUrl", 500),
  action: field(fd, "action") === "post" ? "post" : "comment",
  instructions: field(fd, "instructions", 600),
  skoolPostUrl: field(fd, "skoolPostUrl", 500),
  zapierWebhookUrl: field(fd, "zapierWebhookUrl", 500),
  clearZapier: fd.get("clearZapier") === "on",
});

export async function createUnlockAction(wid: string, fd: FormData) {
  await requireWorkspace(wid, "admin");
  try {
    await createUnlock(wid, unlockFields(fd));
  } catch (err) {
    go(`/app/w/${wid}/unlocks`, { error: errMsg(err) });
  }
  go(`/app/w/${wid}/unlocks`, { ok: "Unlock created. Copy the Skool post below and publish it in your community." });
}

/** Fix a typo or a broken reward link. The claim link stays the same. */
export async function updateUnlockAction(wid: string, id: string, fd: FormData) {
  await requireWorkspace(wid, "admin");
  if (!isUuid(id)) go(`/app/w/${wid}/unlocks`, { error: "That unlock doesn't exist any more." });
  try {
    await updateUnlock(wid, id, unlockFields(fd));
  } catch (err) {
    go(`/app/w/${wid}/unlocks`, { error: errMsg(err) });
  }
  go(`/app/w/${wid}/unlocks`, { ok: "Unlock saved. Its claim link and your pinned post still work." });
}

export async function toggleUnlockAction(wid: string, id: string, active: boolean) {
  await requireWorkspace(wid, "admin");
  await setUnlockActive(wid, id, active);
  go(`/app/w/${wid}/unlocks`, { ok: active ? "Unlock is live again." : "Unlock paused. Its claim page now says it isn't available." });
}

/** The entry ticket: the member posts their intro, pastes the link, and their account unlocks. */
export async function entryTicketAction(wid: string, _prev: ClaimState, fd: FormData): Promise<ClaimState> {
  const { user } = await requireWorkspace(wid, "user", { allowPaused: true, allowEntry: true });
  const postUrl = field(fd, "postUrl", 500);
  const res = await claimEntryTicket(wid, { email: user.email, name: user.name }, postUrl);
  if (!res.ok) return { error: res.error, values: { postUrl } };
  redirect(`/app/w/${wid}/launch`);
}

/** Admin: turn the entry ticket on or off and pick the unlock that powers it. */
export async function saveEntryTicketAction(fd: FormData) {
  const admin = await requirePlatformAdmin();
  const unlockId = field(fd, "unlockId", 40);
  const on = fd.get("on") === "on";
  if (on && !isUuid(unlockId)) go("/app/admin/members", { error: "Pick the unlock that new members claim with their intro post." });
  if (isUuid(unlockId)) {
    // Only an unlock from a workspace the admin belongs to.
    const db = await getDb();
    const [owned] = await db
      .select({ id: unlocks.id })
      .from(unlocks)
      .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, unlocks.workspaceId), eq(workspaceMembers.userId, admin.id)))
      .where(eq(unlocks.id, unlockId))
      .limit(1);
    if (!owned) go("/app/admin/members", { error: "That unlock isn't in one of your workspaces." });
  }
  const previous = await getEntryTicket();
  const everyone = fd.get("everyone") === "on";
  const epoch = new Date(0).toISOString();
  // "New members only" counts from the moment it is first switched on. Keep that moment, but never the
  // "everyone" epoch once that option is unticked, or existing members would stay locked out.
  const keepSince = previous?.enabled && previous.unlockId === unlockId && new Date(previous.since).getTime() > 0;
  await setEntryTicket({ on, unlockId, since: everyone ? epoch : keepSince ? previous.since : new Date().toISOString() });
  go("/app/admin/members", { ok: on ? "Entry ticket is on. New members post their intro to unlock the app." : "Entry ticket is off." });
}
