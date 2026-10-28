"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailCampaigns, emailSequences } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { saveSequence } from "@/server/email/sequences";
import { scheduleCampaign } from "@/server/email/campaigns";
import { buildVars, queueEmail } from "@/server/email/send";
import { deleteAutomation, saveAutomation } from "@/server/automations";
import { cancelPost, schedulePost } from "@/server/social";
import { runAdReview } from "@/server/ai/adReview";
import { hasFeature, type Feature } from "@/server/plans";
import type { CampaignAudience } from "@/lib/db/types";
import { errMsg, field, go } from "./helpers";

async function gate(wid: string, feature: Feature, back: string) {
  const ctx = await requireWorkspace(wid, "admin");
  if (!hasFeature(ctx.workspace.plan, feature)) go(back, { error: "That's a Growth plan feature. Upgrade in Billing." });
  return ctx;
}

// ----- Sequences -----

export async function createSequenceAction(wid: string) {
  await requireWorkspace(wid, "admin");
  const db = await getDb();
  const [seq] = await db
    .insert(emailSequences)
    .values({ workspaceId: wid, name: "New sequence", trigger: "tag_added", triggerValue: "", active: false })
    .returning({ id: emailSequences.id });
  go(`/app/w/${wid}/emails/sequences/${seq.id}`);
}

export async function saveSequenceAction(wid: string, sequenceId: string, fd: FormData) {
  await requireWorkspace(wid, "admin");
  const subjects = fd.getAll("subject").map(String);
  const bodies = fd.getAll("body").map(String);
  const delays = fd.getAll("delayDays").map((d) => Math.max(0, Math.min(365, Number(d) || 0)));
  const steps = subjects
    .map((subject, i) => ({ subject: subject.trim().slice(0, 200), body: (bodies[i] ?? "").trim().slice(0, 20000), delayMinutes: Math.round((delays[i] ?? 0) * 1440) }))
    .filter((s) => s.subject && s.body);
  const trigger = (field(fd, "trigger") || "lead_created") as "lead_created" | "tag_added" | "manual";
  await saveSequence(wid, sequenceId, {
    name: field(fd, "name", 120) || "Sequence",
    active: fd.get("active") === "on",
    trigger,
    triggerValue: field(fd, "triggerValue", 120).toLowerCase(),
    steps,
  });
  go(`/app/w/${wid}/emails/sequences/${sequenceId}`, { ok: "Sequence saved." });
}

export async function deleteSequenceAction(wid: string, sequenceId: string) {
  await requireWorkspace(wid, "admin");
  const db = await getDb();
  await db.delete(emailSequences).where(and(eq(emailSequences.id, sequenceId), eq(emailSequences.workspaceId, wid)));
  go(`/app/w/${wid}/emails`, { ok: "Sequence deleted." });
}

export async function sendTestEmailAction(wid: string, fd: FormData) {
  const { user, workspace } = await requireWorkspace(wid, "admin");
  const subject = field(fd, "subject", 200);
  const body = field(fd, "body", 20000);
  if (!subject || !body) go(field(fd, "back") || `/app/w/${wid}/emails`, { error: "Add a subject and body first." });
  await queueEmail({ workspaceId: wid, to: user.email, subject: `[Test] ${subject}`, body, vars: await buildVars(workspace, null) });
  go(field(fd, "back") || `/app/w/${wid}/emails`, { ok: `Test sent to ${user.email}.` });
}

// ----- Campaigns -----

export async function createCampaignAction(wid: string) {
  await gate(wid, "campaigns", `/app/w/${wid}/emails`);
  const db = await getDb();
  const [c] = await db.insert(emailCampaigns).values({ workspaceId: wid, name: "New broadcast" }).returning({ id: emailCampaigns.id });
  go(`/app/w/${wid}/emails/campaigns/${c.id}`);
}

function audienceFrom(fd: FormData): CampaignAudience {
  const temps = fd.getAll("temperatures").map(String).filter((t): t is "hot" | "warm" | "cold" => ["hot", "warm", "cold"].includes(t));
  const stages = fd
    .getAll("stages")
    .map(String)
    .filter((s): s is "new" | "engaged" | "trial" | "member" | "lost" => ["new", "engaged", "trial", "member", "lost"].includes(s));
  const tags = field(fd, "tags", 300).split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  return { ...(temps.length ? { temperatures: temps } : {}), ...(stages.length ? { stages } : {}), ...(tags.length ? { tags } : {}) };
}

export async function saveCampaignAction(wid: string, campaignId: string, fd: FormData) {
  await gate(wid, "campaigns", `/app/w/${wid}/emails`);
  const db = await getDb();
  await db
    .update(emailCampaigns)
    .set({ name: field(fd, "name", 120) || "Broadcast", subject: field(fd, "subject", 200), body: field(fd, "body", 20000), audience: audienceFrom(fd) })
    .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.workspaceId, wid), eq(emailCampaigns.status, "draft")));
  const intent = field(fd, "intent");
  if (intent === "schedule") {
    const when = field(fd, "sendAt") ? new Date(field(fd, "sendAt")) : new Date();
    let msg: { ok?: string; error?: string };
    try {
      await scheduleCampaign(wid, campaignId, isNaN(when.getTime()) ? new Date() : when);
      msg = { ok: "Broadcast scheduled." };
    } catch (err) {
      msg = { error: errMsg(err) };
    }
    go(`/app/w/${wid}/emails/campaigns/${campaignId}`, msg);
  }
  go(`/app/w/${wid}/emails/campaigns/${campaignId}`, { ok: "Draft saved." });
}

// ----- Automations -----

export async function saveAutomationAction(
  wid: string,
  id: string | null,
  input: { name: string; trigger: unknown; actions: unknown; active: boolean },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { workspace } = await requireWorkspace(wid, "admin");
  if (!hasFeature(workspace.plan, "automations")) return { ok: false, error: "Automations are on the Growth plan." };
  try {
    const saved = await saveAutomation(wid, id, { ...input, name: input.name.slice(0, 120) || "Automation" });
    revalidatePath(`/app/w/${wid}/automations`);
    return { ok: true, id: saved };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === "ZodError" ? "Check each step. Something is missing." : errMsg(err) };
  }
}

export async function deleteAutomationAction(wid: string, id: string) {
  await requireWorkspace(wid, "admin");
  await deleteAutomation(wid, id);
  go(`/app/w/${wid}/automations`, { ok: "Automation deleted." });
}

// ----- Social planner -----

export async function schedulePostAction(wid: string, fd: FormData) {
  await gate(wid, "social", `/app/w/${wid}/social`);
  let msg: { ok?: string; error?: string };
  try {
    const at = field(fd, "scheduledAt");
    await schedulePost(wid, {
      caption: field(fd, "caption", 2200),
      mediaUrl: field(fd, "mediaUrl", 1000),
      connectionIds: fd.getAll("connectionIds").map(String),
      scheduledAt: at ? new Date(at) : null,
    });
    msg = { ok: at ? "Post scheduled." : "Publishing now." };
  } catch (err) {
    msg = { error: errMsg(err) };
  }
  go(`/app/w/${wid}/social`, msg);
}

export async function cancelPostAction(wid: string, postId: string) {
  await requireWorkspace(wid, "admin");
  await cancelPost(wid, postId);
  go(`/app/w/${wid}/social`, { ok: "Post moved back to drafts." });
}

// ----- Ad review -----

export async function adReviewAction(wid: string, fd: FormData) {
  await requireWorkspace(wid);
  const res = await runAdReview(wid, Object.fromEntries(fd.entries()));
  if (!res.ok) go(`/app/w/${wid}/ads`, { error: res.error });
  go(`/app/w/${wid}/ads?review=${res.id}`, { ok: "Your custom plan is ready.", ...(res.warning ? { warn: res.warning } : {}) });
}
