"use server";

import { revalidatePath } from "next/cache";
import { eq, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import type { WorkspaceSettings } from "@/lib/db/types";
import { AI_RUNS_WIN, carryRange, DAY_REWARDS, fill, JOURNEY_COPY, LEGACY_TICKS, POST_KEYS, POST_REVIEW_KEYS, REVIEW_WAITING_WIN, SELF_TICK_KEYS, stepDef, WEEK_STEPS, withCarriedTicks, withLegacyTicks } from "@/lib/week";
import { isSkoolUrl } from "@/server/growth";
import { setAccountSkoolUrl } from "@/server/sites";
import { requireWorkspace } from "@/server/tenancy";
import { claimCoursePost, getCourseUnlocks, inCourse } from "@/server/courseUnlocks";
import { field, go } from "./helpers";

// Your path's own ticks: the member's word for what the app can't see (Skool, Ads Manager, a
// text). Every write touches only settings.journey, in one statement, so it can't overwrite a
// settings save running at the same moment.

type Branch = "ticks" | "later" | "started" | "uncarried";
const A = JOURNEY_COPY.actions;

/** Only ever back to a screen inside this account, with no query (go() adds ?ok=). */
function backFor(wid: string, fd: FormData) {
  const home = `/app/w/${wid}`;
  const asked = field(fd, "back", 300);
  const inside = asked === home || asked.startsWith(`${home}/`);
  return inside && !asked.includes("//") && !asked.includes("\\") && !/[?#]/.test(asked) ? asked : home;
}

const branchOf = (branch: Branch) => sql`coalesce(${workspaces.settings}->'journey'->${branch}::text, '{}'::jsonb)`;
const put = (branch: Branch, key: string, value: unknown) => sql`jsonb_build_object(${branch}::text, ${branchOf(branch)} || jsonb_build_object(${key}::text, ${JSON.stringify(value)}::jsonb))`;
const drop = (branch: Branch, keys: string[]) =>
  sql`jsonb_build_object(${branch}::text, ${branchOf(branch)}${sql.join(
    keys.map((k) => sql` - ${k}::text`),
    sql``,
  )})`;
/** Add several keys at once. */
const merge = (branch: Branch, add: Record<string, unknown>) => sql`jsonb_build_object(${branch}::text, ${branchOf(branch)} || ${JSON.stringify(add)}::jsonb)`;
/** Add some keys and take others away in one statement (drop() when nothing is added). */
const rewrite = (branch: Branch, add: Record<string, unknown>, remove: string[]) =>
  Object.keys(add).length
    ? sql`jsonb_build_object(${branch}::text, (${branchOf(branch)} || ${JSON.stringify(add)}::jsonb)${sql.join(
        remove.map((k) => sql` - ${k}::text`),
        sql``,
      )})`
    : drop(branch, remove);

async function writeJourney(wid: string, entry: SQL) {
  const db = await getDb();
  await db
    .update(workspaces)
    .set({ settings: sql`jsonb_set(coalesce(${workspaces.settings}, '{}'::jsonb), '{journey}', coalesce(${workspaces.settings}->'journey', '{}'::jsonb) || ${entry}, true)` })
    .where(eq(workspaces.id, wid));
  revalidatePath(`/app/w/${wid}`, "layout");
}

/** The toast after a tick: the step's win, or which half of a post is still to do. */
function tickedMessage(key: string, settings: WorkspaceSettings, waiting: boolean) {
  const ticks = settings.journey?.ticks ?? {};
  if (POST_KEYS.includes(key)) return ticks[`${key}r`] ? stepDef(key)!.win : A.postedHalf;
  if (POST_REVIEW_KEYS.includes(key)) {
    const postKey = key.slice(0, -1);
    return ticks[postKey] ? stepDef(postKey)!.win : A.reviewedHalf;
  }
  if (key === "review" && waiting) return REVIEW_WAITING_WIN;
  // The member's word that they'll use the included runs: no key is saved, so don't say one is.
  if (key === "ai") return AI_RUNS_WIN;
  return stepDef(key)?.win ?? JOURNEY_COPY.row.untick;
}

/** "I pressed Publish", "I posted mine", "None at 1,000 yet"... Never a step the app can see. */
export async function tickStepAction(wid: string, key: string, fd: FormData) {
  const { workspace } = await requireWorkspace(wid, "user");
  const back = backFor(wid, fd);
  const waiting = key === "review" && field(fd, "as", 20) === "waiting";
  if (!SELF_TICK_KEYS.includes(key) || (key === "review" && !waiting)) go(back, { error: A.notYours });
  // Course unlocks: a day's post is its pasted link, not a tick.
  if (POST_KEYS.includes(key) && inCourse(workspace) && (await getCourseUnlocks()).on) go(back, { error: JOURNEY_COPY.post.linkInstead });
  await writeJourney(wid, put("ticks", key, { at: new Date().toISOString(), ...(waiting ? { as: "waiting" } : {}) }));
  go(back, { ok: tickedMessage(key, workspace.settings, waiting) });
}

/** "You ticked this · Undo". both=1 on a post step clears both halves. */
export async function untickStepAction(wid: string, key: string, fd: FormData) {
  const { workspace } = await requireWorkspace(wid, "user");
  const back = backFor(wid, fd);
  const journey = workspace.settings.journey ?? {};
  const ticks = journey.ticks ?? {};
  // Carry-over from the old day order: steps counted done because the member posted that far before
  // the order changed. Those can be undone too, even a step the app would otherwise tick by itself.
  const legacyTicks = withLegacyTicks(ticks);
  const range = carryRange(legacyTicks, journey.posts);
  const carried = withCarriedTicks(legacyTicks, journey.posts, journey.uncarried);
  if (!SELF_TICK_KEYS.includes(key) && carried[key]?.as !== "carried") go(back, { error: A.notYours });
  // A post the app saw through its link stays: it already opened the next lesson in Skool.
  const keys = (POST_KEYS.includes(key) && field(fd, "both", 2) === "1" ? [key, `${key}r`] : [key]).filter((k) => ticks[k]?.as !== "link");
  if (!keys.length) go(back);
  // A step ticked through an old key (video1 counts for carousel and firstpost): drop the old key, and
  // keep its other steps ticked under their own keys, so Undo on one leaves the rest as they were.
  const legacy = Object.entries(LEGACY_TICKS).filter(([old, now]) => ticks[old] && keys.some((k) => now.includes(k)));
  const keep: Record<string, unknown> = {};
  for (const [old, now] of legacy) for (const k of now) if (!keys.includes(k) && !ticks[k]) keep[k] = ticks[old];
  // A key on a carried-over day would be carried again once its tick is gone, so it's kept as undone.
  const at = new Date().toISOString();
  const undone = Object.fromEntries(keys.filter((k) => range.keys.includes(k)).map((k) => [k, at]));
  const ticksEntry = rewrite("ticks", keep, [...keys, ...legacy.map(([old]) => old)]);
  await writeJourney(wid, Object.keys(undone).length ? sql`${ticksEntry} || ${merge("uncarried", undone)}` : ticksEntry);
  go(back, { ok: JOURNEY_COPY.row.untick });
}

/** "Do this later": saved on the server, back before the next day starts. */
export async function laterStepAction(wid: string, key: string, fd: FormData) {
  await requireWorkspace(wid, "user");
  const back = backFor(wid, fd);
  const def = WEEK_STEPS.find((s) => s.key === key);
  if (!def?.canLater) go(back, { error: A.notLater });
  await writeJourney(wid, put("later", key, new Date().toISOString()));
  go(back, { ok: def.day < 7 ? fill(JOURNEY_COPY.later.saved, { next: def.day + 1 }) : JOURNEY_COPY.later.savedLastDay });
}

export async function unlaterStepAction(wid: string, key: string, fd: FormData) {
  await requireWorkspace(wid, "user");
  const back = backFor(wid, fd);
  if (!WEEK_STEPS.some((s) => s.key === key && s.canLater)) go(back, { error: A.notLater });
  await writeJourney(wid, drop("later", [key]));
  go(back, { ok: JOURNEY_COPY.later.back });
}

/** "Start Day 2 now", or "Start the checklist anyway" (day 1) on an older account. */
export async function startDayAction(wid: string, day: number, fd: FormData) {
  const { workspace } = await requireWorkspace(wid, "user");
  const back = backFor(wid, fd);
  const d = Math.trunc(Number(day));
  if (!(d >= 1 && d <= 7)) go(back);
  await writeJourney(wid, put("started", String(d), new Date().toISOString()));
  go(back, { ok: d === 1 && !workspace.settings.journey ? A.startedChecklist : fill(A.started, { day: d }) });
}

/** "They're live": the member says Meta finished checking, so the waiting row goes. */
export async function metaOkAction(wid: string, fd: FormData) {
  await requireWorkspace(wid, "user");
  const back = backFor(wid, fd);
  const db = await getDb();
  await db
    .update(workspaces)
    .set({ settings: sql`jsonb_set(coalesce(${workspaces.settings}, '{}'::jsonb), '{journey}', coalesce(${workspaces.settings}->'journey', '{}'::jsonb) || jsonb_build_object('metaOk', ${new Date().toISOString()}::text), true)` })
    .where(eq(workspaces.id, wid));
  revalidatePath(`/app/w/${wid}`, "layout");
  go(back, { ok: JOURNEY_COPY.waiting.liveOk });
}

/** Day 1's "Your group's link" box, right on the home card. */
export async function saveGroupLinkAction(wid: string, fd: FormData) {
  await requireWorkspace(wid, "user");
  const back = backFor(wid, fd);
  const url = field(fd, "skoolUrl", 300);
  if (!url) go(back, { error: A.groupEmpty });
  if (!isSkoolUrl(url)) go(back, { error: A.groupError });
  await setAccountSkoolUrl(wid, url);
  revalidatePath(`/app/w/${wid}`, "layout");
  go(back, { ok: stepDef("skool")!.win });
}

/**
 * Course unlocks: "Save my post link" on a day's post. The link is checked against the platform's
 * Skool group and saved; the post ticks and the next lesson opens in Skool (the owner's Zapier).
 * A link that looks reused is saved for the owner to look at, and nothing fires yet.
 */
export async function coursePostAction(wid: string, day: number, fd: FormData) {
  const { user, viewAs } = await requireWorkspace(wid, "user");
  const back = backFor(wid, fd);
  const d = Math.trunc(Number(day));
  if (viewAs) go(back, { error: "Preview only: nothing was saved. A member pastes their post link here and their next lesson opens in Skool." });
  const res = await claimCoursePost(wid, { email: user.email, name: user.name ?? "" }, d, field(fd, "postUrl", 500));
  if (!res.ok) go(back, { error: res.error });
  revalidatePath(`/app/w/${wid}`, "layout");
  if (res.flagged) go(back, { warn: fill(JOURNEY_COPY.post.linkFlagged, { reason: res.reason }) });
  const next = d < 7 ? JOURNEY_COPY.post.linkNext : JOURNEY_COPY.post.linkLast;
  go(back, { ok: [next, DAY_REWARDS[d]].filter(Boolean).join(" ") });
}
