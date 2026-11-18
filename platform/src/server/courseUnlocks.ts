import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { platformSettings, workspaces } from "@/lib/db/schema";
import type { CourseHook, CoursePost } from "@/lib/db/types";
import { env } from "@/lib/env";
import { isPublicHttpsUrl } from "@/lib/html";
import { WEEK } from "@/lib/week";
import { enqueue } from "./jobs/queue";
import { checkPostLink, skoolGroupOf } from "./unlocks";

// Course unlocks: the 7-day course in the platform's Skool group drips by engagement. Each day ends
// with the member's post in that day's section. They paste its link in Your path, and that ticks the
// post and (through the owner's Zapier, Skool "Unlock Course for Member") opens the next day's lesson
// and that day's bonus lesson in Skool. Nothing in the app waits on a post: ReelVault and every tool
// are open from the start. The app never signs in to Skool or reads it: the
// member pastes the link, we check it points into the group, and odd-looking links wait for the owner.

export type CourseUnlocks = {
  on: boolean;
  /** Day ("1".."7") -> the Zapier catch hook that fires when a member finishes that day. */
  hooks: Record<string, string>;
  /**
   * When the switch was last turned on (ISO), null while off. A post the member ticked before then
   * keeps counting, so switching on never moves anyone backwards.
   */
  since: string | null;
};
const KEY = "course_unlocks";
const DAYS = WEEK.map((d) => d.day);

export async function getCourseUnlocks(): Promise<CourseUnlocks> {
  const db = await getDb();
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, KEY)).limit(1);
  const v = (row?.value ?? {}) as Partial<CourseUnlocks>;
  const hooks: Record<string, string> = {};
  for (const d of DAYS) {
    const url = typeof v.hooks?.[String(d)] === "string" ? v.hooks[String(d)] : "";
    if (url && isPublicHttpsUrl(url)) hooks[String(d)] = url;
  }
  const on = Boolean(v.on);
  // Switched on before the moment was kept: the last save is the best guess at it.
  const since = !on ? null : typeof v.since === "string" && v.since ? v.since : (row?.updatedAt ?? new Date(0)).toISOString();
  return { on, hooks, since };
}

/** The platform's Skool group ("the-community" from SKOOL_GROUP_URL), or null when it isn't set. */
export const courseGroup = () => skoolGroupOf(env.skoolGroupUrl);

/** Why the switch can't go on right now, or null when it can. */
export function courseUnlocksBlocker(): string | null {
  return courseGroup() ? null : "Set SKOOL_GROUP_URL to your Skool group first. Course unlocks can't go on until post links can be checked against your group.";
}

/** Save the owner's switch and hooks. A hook must be a public https:// URL; throws a message they can act on. */
export async function setCourseUnlocks(input: Pick<CourseUnlocks, "on" | "hooks">) {
  const hooks: Record<string, string> = {};
  for (const d of DAYS) {
    const url = (input.hooks[String(d)] ?? "").trim();
    if (!url) continue;
    if (!isPublicHttpsUrl(url)) throw new Error(`The Day ${d} Zapier link must be a public https:// URL.`);
    hooks[String(d)] = url.slice(0, 500);
  }
  const on = Boolean(input.on);
  const blocker = on ? courseUnlocksBlocker() : null;
  if (blocker) throw new Error(blocker);
  // The moment it goes on is kept while it stays on; off and on again starts a new one.
  const previous = await getCourseUnlocks();
  const since = on ? (previous.on && previous.since ? previous.since : new Date().toISOString()) : undefined;
  const value = { on, hooks, ...(since ? { since } : {}) };
  const db = await getDb();
  await db
    .insert(platformSettings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
}

/** Everyone is in the course (members, manual grants, buyers) except agency workspaces, which aren't in the community. */
export const inCourse = (ws: { accessSource: string }) => ws.accessSource !== "agency";

/** A day's post counts once its link is saved and nothing about it waits for the owner. */
export const postClaimed = (p: CoursePost | undefined): boolean => Boolean(p?.url) && !p?.flagged;

/** A post ticked on the member's word before course unlocks went on: it keeps counting. Pure. */
export function postCountsBeforeSwitch(tick: { at: string; as?: string } | undefined, since: string | null | undefined): boolean {
  if (!tick || tick.as === "waiting" || !since) return false;
  const at = Date.parse(tick.at);
  return Number.isFinite(at) && at < Date.parse(since);
}

export type CoursePostResult =
  | { ok: true; already: boolean; flagged: boolean; reason: string; day: number; resent?: boolean }
  | { ok: false; error: string };

const base = (url: string) => url.split("?")[0].replace(/\/$/, "").toLowerCase();

/** A send that didn't get through: the member re-pasting, or the owner's "Send again", tries it again. */
const sendFailed = (p: CoursePost | undefined) => p?.hook?.state === "failed" || p?.hook?.state === "no-hook";

/** The last send's number. Links saved before sends were tracked had one, under the plain key. */
const lastAttempt = (p: CoursePost | undefined) => p?.hook?.attempt ?? (postClaimed(p) ? 1 : 0);

/**
 * The member pastes the link to their Day N post. Checked with the same rules as an Unlock (a post in
 * the platform's group, not a community page), saved, and the post ticked. Unless it looks reused, the
 * day's Zapier hook fires with { email, name, day, post_url }. A looks-reused link is saved and flagged
 * for the owner, and nothing fires until they approve it (or the member pastes their own post).
 * Pasting a day that's already in sends it again only when the last send didn't get through.
 */
export async function claimCoursePost(workspaceId: string, user: { email: string; name: string }, day: number, postUrl: string): Promise<CoursePostResult> {
  const cfg = await getCourseUnlocks();
  if (!cfg.on) return { ok: false, error: "Posting links is switched off right now. Tick your post instead." };
  const group = courseGroup();
  if (!group) return { ok: false, error: "Post links can't be checked right now, so nothing was saved. Try again a little later." };
  if (!DAYS.includes(day)) return { ok: false, error: "That day doesn't exist." };
  const link = checkPostLink(postUrl, group);
  if (!link.ok) return link;

  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings, accessSource: workspaces.accessSource }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!ws) return { ok: false, error: "That account doesn't exist any more." };
  if (!inCourse(ws)) return { ok: false, error: "Course post links are for community members' accounts. This account isn't in the course, so there's nothing to open." };
  const posts = ws.settings.journey?.posts ?? {};
  const existing = posts[String(day)];
  if (existing && postClaimed(existing)) {
    // Already in: nothing fires twice, unless the last send didn't get through. Then it goes again.
    if (!sendFailed(existing)) return { ok: true, already: true, flagged: false, reason: "", day };
    const plan = hookPlan(cfg, day, lastAttempt(existing));
    if (!plan.url) return { ok: true, already: true, flagged: false, reason: "", day };
    await writePost(workspaceId, day, { ...existing, hook: plan.hook }, false);
    await sendHook(workspaceId, day, plan, { email: existing.email, name: existing.name, postUrl: existing.url });
    return { ok: true, already: false, flagged: false, reason: "", day, resent: true };
  }

  // Trust, then spot-check: a link the member already used, or someone else's post.
  let reason = "";
  const mine = base(link.url);
  const sameDay = DAYS.find((d) => d !== day && posts[String(d)]?.url && base(posts[String(d)]!.url) === mine);
  if (sameDay) reason = `Same link as their Day ${sameDay} post`;
  else if (ws.settings.entryPostUrl && base(ws.settings.entryPostUrl) === mine) reason = "Same link as their intro post";
  else {
    const [other] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(
        and(
          ne(workspaces.id, workspaceId),
          sql`exists (select 1 from jsonb_each(coalesce(${workspaces.settings}->'journey'->'posts', '{}'::jsonb)) e where lower(rtrim(split_part(e.value->>'url', '?', 1), '/')) = ${mine})`,
        ),
      )
      .limit(1);
    if (other) reason = "Same link as another member's post";
  }

  const at = new Date().toISOString();
  const name = user.name.replace(/[^\p{L}\p{M}\s.,'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 120);
  const plan = reason ? null : hookPlan(cfg, day, lastAttempt(existing));
  const record: CoursePost = { url: link.url, at, email: user.email, name, ...(reason ? { flagged: true, reason } : {}), ...(plan ? { hook: plan.hook } : {}) };
  await writePost(workspaceId, day, record, !reason);
  if (plan) await sendHook(workspaceId, day, plan, { email: user.email, name, postUrl: link.url });
  return { ok: true, already: false, flagged: Boolean(reason), reason, day };
}

/** Save the day's post record and, when it counts, tick the post as seen from its link. One statement. */
async function writePost(workspaceId: string, day: number, record: CoursePost, tick: boolean) {
  const db = await getDb();
  const journey = sql`coalesce(${workspaces.settings}->'journey', '{}'::jsonb)`;
  const posts = sql`jsonb_build_object('posts', coalesce(${journey}->'posts', '{}'::jsonb) || jsonb_build_object(${String(day)}::text, ${JSON.stringify(record)}::jsonb))`;
  const ticks = tick
    ? sql` || jsonb_build_object('ticks', coalesce(${journey}->'ticks', '{}'::jsonb) || jsonb_build_object(${`post${day}`}::text, ${JSON.stringify({ at: record.approvedAt ?? record.at, as: "link" })}::jsonb))`
    : sql``;
  await db
    .update(workspaces)
    .set({ settings: sql`jsonb_set(coalesce(${workspaces.settings}, '{}'::jsonb), '{journey}', ${journey} || ${posts}${ticks}, true)` })
    .where(eq(workspaces.id, workspaceId));
}

type HookPlan = { hook: CourseHook; url?: string };

/** The next send for a day: queued under a fresh attempt number, or no-hook when that day has no Zapier link. */
function hookPlan(cfg: CourseUnlocks, day: number, previousAttempt: number): HookPlan {
  const url = cfg.hooks[String(day)];
  const at = new Date().toISOString();
  return url ? { hook: { state: "queued", attempt: previousAttempt + 1, at }, url } : { hook: { state: "no-hook", attempt: previousAttempt, at } };
}

/** The job's dedupe key: the first send keeps the plain key, every resend gets its own. */
export const courseHookKey = (workspaceId: string, day: number, attempt: number) => (attempt <= 1 ? `course-unlock:${workspaceId}:${day}` : `course-unlock:${workspaceId}:${day}:${attempt}`);

/** Queue the send the plan describes. Called after the post record (with plan.hook) is saved. */
async function sendHook(workspaceId: string, day: number, plan: HookPlan, p: { email: string; name: string; postUrl: string }) {
  if (!plan.url) return;
  await enqueue(
    "course.unlock",
    { url: plan.url, email: p.email, name: p.name, day, postUrl: p.postUrl, workspaceId, attempt: plan.hook.attempt },
    { dedupeKey: courseHookKey(workspaceId, day, plan.hook.attempt) },
  );
}

async function postOf(workspaceId: string, day: number): Promise<CoursePost> {
  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const p = ws?.settings.journey?.posts?.[String(day)];
  if (!p?.url) throw new Error("That post isn't there any more.");
  return p;
}

/** Owner: "Looks fine". The flagged post counts, the post ticks and the day's hook fires. */
export async function approveCoursePost(workspaceId: string, day: number) {
  const p = await postOf(workspaceId, day);
  if (!p.flagged) return;
  const { flagged: _f, reason: _r, ...rest } = p;
  // A flagged link never sent anything, so this is its first send.
  const plan = hookPlan(await getCourseUnlocks(), day, lastAttempt(p));
  await writePost(workspaceId, day, { ...rest, approvedAt: new Date().toISOString(), hook: plan.hook }, true);
  await sendHook(workspaceId, day, plan, { email: p.email, name: p.name, postUrl: p.url });
}

/** Owner: "Send again" on a post that counts. Always a fresh job, so a send that never went out goes now. */
export async function resendCoursePost(workspaceId: string, day: number) {
  const p = await postOf(workspaceId, day);
  if (p.flagged) throw new Error("This link is flagged. Approve it first: that sends it.");
  const plan = hookPlan(await getCourseUnlocks(), day, lastAttempt(p));
  if (!plan.url) throw new Error(`There's no Zapier link for Day ${day} yet. Add it above, press Save, then send again.`);
  await writePost(workspaceId, day, { ...p, hook: plan.hook }, false);
  await sendHook(workspaceId, day, plan, { email: p.email, name: p.name, postUrl: p.url });
}

/** The job writes how its send went onto the post it was for, unless a newer send has replaced it. */
async function markHook(payload: Record<string, unknown>, state: CourseHook["state"], error?: string) {
  const workspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId : "";
  const day = Math.trunc(Number(payload.day));
  const attempt = Math.trunc(Number(payload.attempt));
  if (!workspaceId || !DAYS.includes(day) || !(attempt >= 1)) return;
  const hook: CourseHook = { state, attempt, at: new Date().toISOString(), ...(error ? { error: error.slice(0, 300) } : {}) };
  const path = sql`array['journey', 'posts', ${String(day)}::text]::text[]`;
  const db = await getDb();
  await db
    .update(workspaces)
    .set({ settings: sql`jsonb_set(${workspaces.settings}, ${path}, (${workspaces.settings} #> ${path}) || jsonb_build_object('hook', ${JSON.stringify(hook)}::jsonb), false)` })
    .where(and(eq(workspaces.id, workspaceId), sql`${workspaces.settings} #>> array['journey', 'posts', ${String(day)}::text, 'hook', 'attempt']::text[] = ${String(attempt)}`));
}

/**
 * Job: tell Zapier a member finished a day (Skool "Unlock Course for Member" for the next one). Retries via
 * the queue; each run records on the member's post whether it was sent, is still queued for a retry, or failed.
 */
export async function processCourseUnlockWebhook(payload: Record<string, unknown>, job?: { attempts: number; maxAttempts: number }) {
  const url = String(payload.url ?? "");
  if (!isPublicHttpsUrl(url)) {
    await markHook(payload, "failed", "The Zapier link isn't a public https:// URL.");
    return;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ email: payload.email, name: payload.name, day: payload.day, post_url: payload.postUrl }),
    });
    if (!res.ok) throw new Error(`Course unlock webhook answered ${res.status}`);
  } catch (err) {
    const last = !job || job.attempts >= job.maxAttempts;
    await markHook(payload, last ? "failed" : "queued", err instanceof Error ? err.message : String(err));
    throw err;
  }
  await markHook(payload, "sent");
}

export type CourseClaim = CoursePost & { workspaceId: string; workspace: string; day: number };

/** Every saved post link, newest first, for the owner's spot-checks. Flagged ones first. */
export async function listCourseClaims(limit = 200): Promise<CourseClaim[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: workspaces.id, name: workspaces.name, posts: sql<Record<string, CoursePost> | null>`${workspaces.settings}->'journey'->'posts'` })
    .from(workspaces)
    .where(sql`${workspaces.settings}->'journey'->'posts' is not null`);
  const out: CourseClaim[] = [];
  for (const r of rows) {
    for (const [day, p] of Object.entries(r.posts ?? {})) {
      if (p?.url) out.push({ ...p, workspaceId: r.id, workspace: r.name, day: Number(day) });
    }
  }
  return out.sort((a, b) => Number(Boolean(b.flagged)) - Number(Boolean(a.flagged)) || b.at.localeCompare(a.at)).slice(0, limit);
}

/** The status the owner sees for a post link: what really happened to its send. */
export function courseClaimStatus(c: Pick<CourseClaim, "flagged" | "reason" | "hook" | "approvedAt" | "day">): { label: string; tone: "warning" | "success" | "danger" | "muted"; canResend: boolean } {
  if (c.flagged) return { label: c.reason || "Flagged", tone: "warning", canResend: false };
  switch (c.hook?.state) {
    case "sent":
      return { label: c.approvedAt ? "Approved · sent" : "Sent", tone: "success", canResend: true };
    case "queued":
      return { label: c.hook.error ? "Retrying" : "Sending", tone: "muted", canResend: false };
    case "failed":
      return { label: "Failed", tone: "danger", canResend: true };
    case "no-hook":
      return { label: `Not sent: no Zapier link for Day ${c.day}`, tone: "danger", canResend: true };
    default:
      // Saved before sends were tracked: it was queued, but nothing recorded how it went.
      return { label: "Queued (not tracked)", tone: "muted", canResend: true };
  }
}

/** Days 1 to 6 open the next lesson, so with the switch on each needs its Zapier link. */
export const missingCourseHooks = (cfg: Pick<CourseUnlocks, "on" | "hooks">): number[] => (cfg.on ? DAYS.filter((d) => d < 7 && !cfg.hooks[String(d)]) : []);
