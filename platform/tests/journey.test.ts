import { describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import type { WorkspaceSettings } from "@/lib/db/types";
import { laterStepAction, metaOkAction, saveGroupLinkAction, startDayAction, tickStepAction, unlaterStepAction, untickStepAction } from "@/actions/journey";
import { AI_RUNS_WIN, SELF_TICK_KEYS, WEEK_STEPS } from "@/lib/week";
import { pickWin } from "@/components/journey/wins";
import { makeWorkspace } from "./helpers";

// Your path's own ticks: the member's word for what the app can't see, written in place.

const h = vi.hoisted(() => ({ stale: null as null | Record<string, unknown> }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// The session check needs a request. Here it returns the workspace (or a stale copy of it, to
// prove the write doesn't put an old read of the settings back).
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
      return { workspace: h.stale ?? workspace, user: { id: "u" }, role: "owner" };
    },
  };
});

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
/** Run an action and return where it redirected, with its ?ok= or ?error=. */
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
const settingsOf = async (wid: string) => {
  const [row] = await (await getDb()).select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, wid));
  return row.settings as WorkspaceSettings;
};

describe("journey actions", () => {
  it("refuses to tick a step the app sees for itself", async () => {
    const { ws } = await makeWorkspace();
    const back = `/app/w/${ws.id}`;
    // ("ai" isn't here: a member with no free key may tick "I'll use my 3 included runs".)
    for (const key of ["kit", "publish", "research", "skool", "pixel", "statics", "checkin", "nonsense"]) {
      const r = await run(tickStepAction(ws.id, key, form({ back })));
      expect(r.error, key).toBe("That step ticks itself when the app sees it done.");
    }
    // The verdicts step takes the member's word only as "None at 1,000 yet".
    expect((await run(tickStepAction(ws.id, "review", form({ back })))).error).toBeTruthy();
    expect((await settingsOf(ws.id)).journey).toBeUndefined();
    const waiting = await run(tickStepAction(ws.id, "review", form({ back, as: "waiting" })));
    expect(waiting.ok).toBe("Your numbers need more time. That's normal this early.");
    expect((await settingsOf(ws.id)).journey?.ticks?.review).toMatchObject({ as: "waiting" });
  });

  it("only offers self-ticks for what the app can't see", () => {
    for (const s of WEEK_STEPS.filter((x) => x.tick === "app")) expect(SELF_TICK_KEYS, s.key).not.toContain(s.key);
    for (const k of ["ai", "clicks", "live2", "events", "welcome", "lesson", "warm", "decide", "post1", "post1r", "post7r", "review"]) expect(SELF_TICK_KEYS).toContain(k);
  });

  it("takes 'I'll use my 3 included runs' on the AI step, and never says a key was saved", async () => {
    const { ws } = await makeWorkspace();
    const r = await run(tickStepAction(ws.id, "ai", form({ back: `/app/w/${ws.id}` })));
    expect(r.ok).toBe(AI_RUNS_WIN);
    expect(r.ok).not.toContain("key is saved");
    expect(Object.keys((await settingsOf(ws.id)).journey?.ticks ?? {})).toEqual(["ai"]);
  });

  it("writes only the journey key, so other settings survive even a stale read", async () => {
    const { ws } = await makeWorkspace();
    const db = await getDb();
    h.stale = ws; // what the action read: no Pixel yet
    try {
      // Saved by another screen after that read.
      await db.update(workspaces).set({ settings: sql`${workspaces.settings} || '{"metaPixelId":"123456789012345"}'::jsonb` }).where(eq(workspaces.id, ws.id));
      const r = await run(tickStepAction(ws.id, "clicks", form({ back: `/app/w/${ws.id}` })));
      expect(r).toMatchObject({ path: `/app/w/${ws.id}`, ok: "Done: you pressed Publish. Now it's Meta's turn." });
      await run(tickStepAction(ws.id, "post1", form({ back: `/app/w/${ws.id}` })));
    } finally {
      h.stale = null;
    }
    const s = await settingsOf(ws.id);
    expect(s.skoolUrl).toBe("https://www.skool.com/fit-dads");
    expect(s.metaPixelId).toBe("123456789012345");
    expect(s.businessName).toBe("Fit Dads Club");
    expect(Object.keys(s.journey?.ticks ?? {}).sort()).toEqual(["clicks", "post1"]);
    expect(Date.parse(s.journey!.ticks!.clicks.at)).toBeGreaterThan(Date.now() - 60_000);
  });

  it("a settings screen saving an older copy of the settings never wipes a fresh tick", async () => {
    const { ws } = await makeWorkspace();
    const stale = ws.settings; // what Settings, say, read before the member ticked
    await run(tickStepAction(ws.id, "events", form({ back: `/app/w/${ws.id}` })));
    const { setAccountSkoolUrl } = await import("@/server/sites");
    const { updateWorkspaceSettings } = await import("@/server/workspace");
    const { settingsKeepingJourney } = await import("@/server/settingsWrite");
    await setAccountSkoolUrl(ws.id, "https://www.skool.com/after-tick");
    await updateWorkspaceSettings(ws.id, { niche: "fitness for dads" });
    const db = await getDb();
    await db.update(workspaces).set({ settings: settingsKeepingJourney({ ...stale, businessName: "Renamed", journey: {} }) }).where(eq(workspaces.id, ws.id));
    const s = await settingsOf(ws.id);
    expect(s.businessName).toBe("Renamed");
    expect(Object.keys(s.journey?.ticks ?? {})).toEqual(["events"]);
    // An account with no journey yet keeps having none (it decides the veteran check).
    const fresh = await makeWorkspace();
    await updateWorkspaceSettings(fresh.ws.id, { niche: "x" });
    expect((await settingsOf(fresh.ws.id)).journey).toBeUndefined();
  });

  it("says which half of a post is left, and the whole win when both are in", async () => {
    const { ws } = await makeWorkspace();
    const back = `/app/w/${ws.id}`;
    expect((await run(tickStepAction(ws.id, "post2r", form({ back })))).ok).toBe("Ticked: you reviewed one. Next, post your own.");
    expect((await run(tickStepAction(ws.id, "post2", form({ back })))).ok).toBe("Done: posted and reviewed. Your audit comes as a reply on your post.");
    // Undo on the done row clears both halves.
    await run(untickStepAction(ws.id, "post2", form({ back, both: "1" })));
    expect((await settingsOf(ws.id)).journey?.ticks).toEqual({});
    expect((await run(tickStepAction(ws.id, "post2", form({ back })))).ok).toBe("Ticked: you posted yours. Next, review the post right before it.");
  });

  it("sends a back address outside this account to its dashboard", async () => {
    const { ws } = await makeWorkspace();
    const other = await makeWorkspace();
    for (const back of [`/app/w/${other.ws.id}`, "https://evil.example.com", `/app/w/${ws.id}//evil.example.com`, `/app/w/${ws.id}x`, `/app/w/${ws.id}/path?x=1`, ""]) {
      expect((await run(tickStepAction(ws.id, "events", form({ back })))).path, back).toBe(`/app/w/${ws.id}`);
    }
    expect((await run(tickStepAction(ws.id, "events", form({ back: `/app/w/${ws.id}/path` })))).path).toBe(`/app/w/${ws.id}/path`);
    expect((await run(tickStepAction(ws.id, "events", form({ back: `/app/w/${ws.id}/ads/studio` })))).path).toBe(`/app/w/${ws.id}/ads/studio`);
  });

  it("saves for later only the steps that allow it, and brings them back", async () => {
    const { ws } = await makeWorkspace();
    const back = `/app/w/${ws.id}`;
    expect((await run(laterStepAction(ws.id, "kit", form({ back })))).error).toBeTruthy();
    expect((await run(laterStepAction(ws.id, "post1", form({ back })))).error).toBeTruthy();
    expect((await run(laterStepAction(ws.id, "pixel", form({ back })))).ok).toBe("Saved for later. It comes back before Day 2 starts.");
    expect((await settingsOf(ws.id)).journey?.later?.pixel).toBeTruthy();
    await run(unlaterStepAction(ws.id, "pixel", form({ back })));
    expect((await settingsOf(ws.id)).journey?.later).toEqual({});
  });

  it("starts a day, marks Meta done checking, and keeps every branch apart", async () => {
    const { ws } = await makeWorkspace();
    const back = `/app/w/${ws.id}`;
    expect((await run(startDayAction(ws.id, 2, form({ back })))).ok).toBe("Day 2 is open. Here's its first step.");
    expect((await run(startDayAction(ws.id, 9, form({ back })))).ok).toBeNull();
    await run(metaOkAction(ws.id, form({ back })));
    await run(tickStepAction(ws.id, "decide", form({ back })));
    const j = (await settingsOf(ws.id)).journey!;
    expect(Object.keys(j.started ?? {})).toEqual(["2"]);
    expect(j.metaOk).toBeTruthy();
    expect(Object.keys(j.ticks ?? {})).toEqual(["decide"]);
    // The decision itself is never stored: only when it was ticked.
    expect(JSON.stringify(j.ticks)).not.toMatch(/stay|leave|cancel/i);
  });

  it("saves the group's link from the home card, and only a skool.com one", async () => {
    const { ws } = await makeWorkspace();
    const back = `/app/w/${ws.id}`;
    expect((await run(saveGroupLinkAction(ws.id, form({ back, skoolUrl: "" })))).error).toBeTruthy();
    expect((await run(saveGroupLinkAction(ws.id, form({ back, skoolUrl: "https://example.com/group" })))).error).toBe("Your Skool link must be a skool.com link, like https://www.skool.com/your-group");
    const ok = await run(saveGroupLinkAction(ws.id, form({ back, skoolUrl: "https://www.skool.com/new-group" })));
    expect(ok.ok).toBe("Done: your group's link is saved. Every Join button now goes there.");
    expect((await settingsOf(ws.id)).skoolUrl).toBe("https://www.skool.com/new-group");
  });
});

describe("the home page's win line", () => {
  it("seeds silently on a first visit, then shows only what's new, and keeps it until the next one", () => {
    expect(pickWin(["skool"], undefined)).toEqual({ show: null, write: "|skool" });
    expect(pickWin(["skool", "kit"], "|skool")).toEqual({ show: "kit", write: "kit|skool,kit" });
    expect(pickWin(["skool", "kit"], "kit|skool,kit")).toEqual({ show: "kit", write: "kit|skool,kit" });
    expect(pickWin(["skool", "kit", "ev:adLead"], "kit|skool,kit").show).toBe("ev:adLead");
    // An undone step's win goes with it.
    expect(pickWin(["skool"], "kit|skool,kit").show).toBeNull();
  });
});
