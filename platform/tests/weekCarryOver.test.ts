import { describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations, sites, workspaces } from "@/lib/db/schema";
import type { Journey, WorkspaceSettings } from "@/lib/db/types";
import { untickStepAction } from "@/actions/journey";
import { CARRIED_WIN, carryRange, WEEK_V5_SINCE, withCarriedTicks } from "@/lib/week";
import { computePath } from "@/server/path";
import { makeWorkspace } from "./helpers";

// Carry-over: members who posted a day on the old day order (Day 1 = website, Pixel and 5 ads; Day 2 =
// the Skool-link ads) land on the first day they haven't posted, not back on the new Day 1.

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/tenancy", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/tenancy")>();
  return {
    ...real,
    requireWorkspace: async (wid: string) => {
      const { getDb: db } = await import("@/lib/db");
      const { workspaces: table } = await import("@/lib/db/schema");
      const { eq: is } = await import("drizzle-orm");
      const [workspace] = await (await db()).select().from(table).where(is(table.id, wid));
      if (!workspace) throw new Error("not found");
      return { workspace, user: { id: "u" }, role: "owner" };
    },
  };
});

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
async function run(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    const url = (e as { url?: string }).url;
    if (!url) throw e;
    const u = new URL(url, "http://x");
    return { path: u.pathname, ok: u.searchParams.get("ok"), error: u.searchParams.get("error") };
  }
  throw new Error("expected a redirect");
}

/** Before the switch to this day order, and after it. Fixed dates, so the tests don't depend on today. */
const OLD = new Date(WEEK_V5_SINCE.getTime() - 2 * 86_400_000).toISOString();
const NEW = new Date(WEEK_V5_SINCE.getTime() + 86_400_000).toISOString();

type W = Awaited<ReturnType<typeof makeWorkspace>>["ws"];
const withJourney = (ws: W, j: Journey, extra: Record<string, unknown> = {}) => ({ ...ws, settings: { ...ws.settings, ...extra, journey: j } });
const KEYED = { aiKeyEnc: "x", metaPixelId: "1234567890" };

/** What an old-week Day 1 left behind: a website, research and a website pack (no launch kit, so one carried step stays unseen). */
async function oldDay1Data(workspaceId: string) {
  const db = await getDb();
  await db.insert(aiGenerations).values({ workspaceId, kind: "ad_research", model: "rules" });
  await db.insert(aiGenerations).values({ workspaceId, kind: "ad_studio", model: "rules", input: { destination: "website" } });
  await db.insert(sites).values({ workspaceId, name: "Funnel", slug: `funnel-carry-${workspaceId}`, theme: {} as never, published: true });
}
async function saveJourney(wid: string, j: Journey) {
  const db = await getDb();
  await db.update(workspaces).set({ settings: sql`jsonb_set(${workspaces.settings}, '{journey}', ${JSON.stringify(j)}::jsonb, true)` }).where(eq(workspaces.id, wid));
}
const settingsOf = async (wid: string) => {
  const [row] = await (await getDb()).select().from(workspaces).where(eq(workspaces.id, wid));
  return row;
};

describe("carry-over from the old day order", () => {
  it("lands a member who posted Days 1 and 2 on the old week on Day 3", async () => {
    const { ws, user } = await makeWorkspace();
    await oldDay1Data(ws.id);
    // Old Day 2's Skool-link pack.
    await (await getDb()).insert(aiGenerations).values({ workspaceId: ws.id, kind: "ad_studio", model: "rules", input: { destination: "skool" } });
    // Old Day 1: post1 and "I pressed Publish" (clicks). Old Day 2: post2 and the second campaign (live2).
    const ticks = { post1: { at: OLD }, post1r: { at: OLD }, clicks: { at: OLD }, post2: { at: OLD }, post2r: { at: OLD }, live2: { at: OLD } };
    const p = await computePath(withJourney(ws, { ticks }, KEYED), user.id);
    expect(p.days[0].complete).toBe(true);
    expect(p.days[1].complete).toBe(true);
    expect(p.dayNow).toBe(3);
    expect(p.current).toMatchObject({ key: "lead1", day: 3 });
    expect(p.state).toBe("doing");
    // New steps read as done on the member's word, with a win that claims nothing the app saw.
    for (const k of ["reel1", "firstpost", "pages", "planweek"]) {
      const s = p.days.flatMap((d) => d.steps).find((x) => x.key === k);
      expect(s, k).toMatchObject({ done: true, tick: "you", win: CARRIED_WIN });
    }
    // An app step the app hasn't seen (no launch kit) is carried as the member's word, never "Seen by the app".
    expect(p.days[0].steps.find((s) => s.key === "kit")).toMatchObject({ done: true, tick: "you", win: CARRIED_WIN });
    // What the app does see still shows as seen.
    expect(p.days[1].steps.find((s) => s.key === "publish")).toMatchObject({ done: true, tick: "app" });
    // Real ticks keep their own win.
    expect(p.days[1].steps.find((s) => s.key === "clicks")?.win).toBe("Done: you pressed Publish. Now it's Meta's turn.");
  });

  it("lands a member who posted only Day 1 on the old week on Day 2's first new step", async () => {
    const { ws, user } = await makeWorkspace();
    await oldDay1Data(ws.id);
    const ticks = { post1: { at: OLD }, post1r: { at: OLD }, clicks: { at: OLD } };
    const p = await computePath(withJourney(ws, { ticks }, KEYED), user.id);
    expect(p.days[0].complete).toBe(true);
    expect(p.current).toMatchObject({ key: "pages", day: 2, n: 1 });
    // Day 2 is not carried: only its new steps and its post are left.
    expect(p.days[1].steps.filter((s) => !s.done).map((s) => s.key)).toEqual(["pages", "planweek", "post2"]);
    // A post link saved before the switch counts the same as a ticked post.
    expect(carryRange({}, { "1": { url: "https://www.skool.com/x/post", at: OLD } }).day).toBe(1);
    expect(carryRange({}, { "1": { url: "https://www.skool.com/x/post", at: OLD, flagged: true } }).day).toBe(0);
  });

  it("leaves a member who started after the switch alone", async () => {
    const { ws, user } = await makeWorkspace();
    const ticks = { post1: { at: NEW }, post1r: { at: NEW } };
    const p = await computePath(withJourney(ws, { ticks }, KEYED), user.id);
    expect(p.days[0].complete).toBe(false);
    expect(p.current).toMatchObject({ key: "reel1", day: 1 });
    expect(p.days.flatMap((d) => d.steps).some((s) => s.win === CARRIED_WIN)).toBe(false);
    expect(carryRange(ticks)).toEqual({ day: 0, at: "", keys: [] });
    // Nobody to carry: no ticks, a waiting clock, or a member already on this order before it shipped (a preview).
    expect(withCarriedTicks({})).toEqual({});
    expect(carryRange({ post1: { at: OLD, as: "waiting" } }).day).toBe(0);
    expect(carryRange({ reel1: { at: OLD }, post1: { at: OLD } }).day).toBe(0);
  });

  it("lets Undo take a carried-over step back off, without crashing", async () => {
    const { ws, user } = await makeWorkspace();
    const back = `/app/w/${ws.id}`;
    await oldDay1Data(ws.id);
    await saveJourney(ws.id, { ticks: { post1: { at: OLD }, post1r: { at: OLD }, clicks: { at: OLD } } });

    // A word-only step that was carried.
    expect((await run(untickStepAction(ws.id, "firstpost", form({ back })))).ok).toBe("Unticked. It's back on your list.");
    let row = await settingsOf(ws.id);
    const j = (row.settings as WorkspaceSettings).journey!;
    expect(Object.keys(j.uncarried ?? {})).toEqual(["firstpost"]);
    // The post that carried it over is untouched.
    expect(j.ticks?.post1).toEqual({ at: OLD });
    let p = await computePath({ ...row, settings: { ...(row.settings as WorkspaceSettings), ...KEYED } } as W, user.id);
    expect(p.days[0].steps.find((s) => s.key === "firstpost")).toMatchObject({ done: false, tick: null });
    expect(p.current?.key).toBe("firstpost");

    // An app step that was carried (no launch kit seen) can be undone too; an app step that wasn't can't.
    expect((await run(untickStepAction(ws.id, "kit", form({ back })))).ok).toBe("Unticked. It's back on your list.");
    expect((await run(untickStepAction(ws.id, "refresh", form({ back })))).error).toBe("That step ticks itself when the app sees it done.");

    // Undo on a real tick inside a carried day keeps it off, rather than carrying it straight back.
    await saveJourney(ws.id, { ticks: { post1: { at: OLD }, post1r: { at: OLD }, post2: { at: OLD }, post2r: { at: OLD }, clicks: { at: OLD } } });
    await run(untickStepAction(ws.id, "clicks", form({ back })));
    row = await settingsOf(ws.id);
    p = await computePath({ ...row, settings: { ...(row.settings as WorkspaceSettings), ...KEYED } } as W, user.id);
    expect(p.days[1].steps.find((s) => s.key === "clicks")).toMatchObject({ done: false });
    expect(p.current?.key).toBe("clicks");

    // Undo on the post that carried it all: the carry-over falls back to the post before it.
    await run(untickStepAction(ws.id, "post2", form({ back, both: "1" })));
    row = await settingsOf(ws.id);
    p = await computePath({ ...row, settings: { ...(row.settings as WorkspaceSettings), ...KEYED } } as W, user.id);
    expect(p.days[0].complete).toBe(true);
    expect(p.current?.key).toBe("pages");
  });
});
