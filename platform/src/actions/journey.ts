"use server";

import { revalidatePath } from "next/cache";
import { eq, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import type { WorkspaceSettings } from "@/lib/db/types";
import { AI_RUNS_WIN, fill, JOURNEY_COPY, POST_KEYS, POST_REVIEW_KEYS, REVIEW_WAITING_WIN, SELF_TICK_KEYS, stepDef, WEEK_STEPS } from "@/lib/week";
import { isSkoolUrl } from "@/server/growth";
import { setAccountSkoolUrl } from "@/server/sites";
import { requireWorkspace } from "@/server/tenancy";
import { field, go } from "./helpers";

// Your path's own ticks: the member's word for what the app can't see (Skool, Ads Manager, a
// text). Every write touches only settings.journey, in one statement, so it can't overwrite a
// settings save running at the same moment.

type Branch = "ticks" | "later" | "started";
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
  await writeJourney(wid, put("ticks", key, { at: new Date().toISOString(), ...(waiting ? { as: "waiting" } : {}) }));
  go(back, { ok: tickedMessage(key, workspace.settings, waiting) });
}

/** "You ticked this · Undo". both=1 on a post step clears both halves. */
export async function untickStepAction(wid: string, key: string, fd: FormData) {
  await requireWorkspace(wid, "user");
  const back = backFor(wid, fd);
  if (!SELF_TICK_KEYS.includes(key)) go(back, { error: A.notYours });
  const keys = POST_KEYS.includes(key) && field(fd, "both", 2) === "1" ? [key, `${key}r`] : [key];
  await writeJourney(wid, drop("ticks", keys));
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
