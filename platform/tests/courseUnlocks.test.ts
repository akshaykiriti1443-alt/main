import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { readFileSync } from "node:fs";
import nodePath from "node:path";
import { and, eq, like } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobs, workspaces } from "@/lib/db/schema";
import type { WorkspaceSettings } from "@/lib/db/types";
import { env } from "@/lib/env";
import { AI_CONNECTOR_WIN, allWeekStrings, DAY_REWARDS, JOURNEY_COPY, WEEK_V5_SINCE } from "@/lib/week";
import { approveCoursePost, claimCoursePost, courseClaimStatus, getCourseUnlocks, listCourseClaims, missingCourseHooks, processCourseUnlockWebhook, resendCoursePost, setCourseUnlocks } from "@/server/courseUnlocks";
import { createConnectorToken, listConnectorTokens, resolveConnectorToken, revokeConnectorToken } from "@/server/connectors";
import { computePath, pathIntro } from "@/server/path";
import { workspaceNav } from "@/app/app/w/[wid]/nav";
import { makeWorkspace } from "./helpers";

// Course unlocks: each day's pasted post link ticks the post and opens the next lesson (and that day's
// bonus lesson) in Skool through the owner's Zapier. Nothing in the app is a reward: ReelVault and every
// tool are open from the start. The app never reads Skool.

const HOOK = (d: number) => `https://hooks.zapier.com/hooks/catch/123/day${d}/`;
const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const postUrl = () => `https://www.skool.com/the-community/my-day-post-${stamp()}`;
const member = (email: string) => ({ email, name: "Jo Member" });

async function on() {
  env.skoolGroupUrl = "https://www.skool.com/the-community/about";
  await setCourseUnlocks({ on: true, hooks: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [String(d), HOOK(d)])) });
}
const settingsOf = async (wid: string) => {
  const [row] = await (await getDb()).select().from(workspaces).where(eq(workspaces.id, wid));
  return row;
};
const hookJobs = async (wid: string) => (await getDb()).select().from(jobs).where(and(eq(jobs.type, "course.unlock"), like(jobs.dedupeKey, `course-unlock:${wid}:%`)));

afterEach(async () => {
  await setCourseUnlocks({ on: false, hooks: {} });
  env.skoolGroupUrl = "";
});

describe("course unlocks: the owner's switch", () => {
  it("is off until the owner turns it on, and only keeps public https hooks", async () => {
    expect(await getCourseUnlocks()).toEqual({ on: false, hooks: {}, since: null });
    env.skoolGroupUrl = "https://www.skool.com/the-community/about";
    await expect(setCourseUnlocks({ on: true, hooks: { "2": "http://localhost:3000/x" } })).rejects.toThrow(/Day 2/);
    await setCourseUnlocks({ on: true, hooks: { "1": HOOK(1), "3": "" } });
    expect(await getCourseUnlocks()).toEqual({ on: true, hooks: { "1": HOOK(1) }, since: expect.any(String) });
  });

  it("keeps the moment it went on while it stays on, and starts a new one after off and on again", async () => {
    env.skoolGroupUrl = "https://www.skool.com/the-community/about";
    await setCourseUnlocks({ on: true, hooks: {} });
    const first = (await getCourseUnlocks()).since!;
    await new Promise((r) => setTimeout(r, 5));
    await setCourseUnlocks({ on: true, hooks: { "1": HOOK(1) } });
    expect((await getCourseUnlocks()).since).toBe(first);
    await setCourseUnlocks({ on: false, hooks: {} });
    expect((await getCourseUnlocks()).since).toBeNull();
    await setCourseUnlocks({ on: true, hooks: {} });
    expect(Date.parse((await getCourseUnlocks()).since!)).toBeGreaterThan(Date.parse(first));
  });

  it("can't go on without SKOOL_GROUP_URL, and claims are refused kindly while it's missing", async () => {
    env.skoolGroupUrl = "";
    await expect(setCourseUnlocks({ on: true, hooks: {} })).rejects.toThrow(/SKOOL_GROUP_URL/);
    expect((await getCourseUnlocks()).on).toBe(false);
    // Off is always fine.
    await setCourseUnlocks({ on: false, hooks: { "1": HOOK(1) } });

    // Switched on while it was set, then the setting went away: nothing is accepted, any post link or not.
    await on();
    env.skoolGroupUrl = "";
    const { ws, user } = await makeWorkspace();
    const res = await claimCoursePost(ws.id, member(user.email), 1, "https://www.skool.com/any-group/some-post");
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/can't be checked right now/) });
    expect((await settingsOf(ws.id)).settings.journey?.posts).toBeUndefined();
    expect(await hookJobs(ws.id)).toHaveLength(0);
  });

  it("warns about Day 1 to 6 hooks left empty while it's on", () => {
    expect(missingCourseHooks({ on: true, hooks: { "1": HOOK(1), "3": HOOK(3), "7": HOOK(7) } })).toEqual([2, 4, 5, 6]);
    expect(missingCourseHooks({ on: true, hooks: Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [String(d), HOOK(d)])) })).toEqual([]);
    expect(missingCourseHooks({ on: false, hooks: {} })).toEqual([]);
  });

  it("its words press nobody either", () => {
    for (const s of allWeekStrings()) expect(s, s).not.toMatch(/—|journey|\bbadges?\b/i);
    expect(JOURNEY_COPY.post.opensToday).toBe("Opens when you post today's");
  });
});

describe("course unlocks: pasting a day's post link", () => {
  it("ticks the post, fires that day's Zapier hook with email, name, day and post_url, and names the bonus lesson", async () => {
    // A member on this day order: their post goes in after it shipped, so nothing is carried over from the old one.
    vi.useFakeTimers({ toFake: ["Date"], now: Math.max(Date.now(), WEEK_V5_SINCE.getTime() + 3_600_000) });
    onTestFinished(() => void vi.useRealTimers());
    await on();
    const { ws, user } = await makeWorkspace();
    const url = postUrl();
    const before = await computePath(ws, user.id, { courseUnlocksOn: true });
    const post1 = before.days[0].steps.find((s) => s.key === "post1")!;
    expect(post1.postLink).toMatchObject({ next: JOURNEY_COPY.post.linkNext, reward: DAY_REWARDS[1] });
    expect(post1.why).toContain(JOURNEY_COPY.post.linkWhy);
    // Later days say when their lesson opens. Nothing in the app is locked.
    expect(before.days[1].opens).toBe(JOURNEY_COPY.post.opensToday);
    expect(before.days[2].opens).toBe(JOURNEY_COPY.post.opensAfter.replace("{day}", "2"));
    expect(before.days[6].opens).toBe(JOURNEY_COPY.post.opensAfter.replace("{day}", "6"));
    expect(before.days[0].opens).toBeUndefined();
    for (const s of before.days.flatMap((d) => d.steps)) expect(s).not.toHaveProperty("locked");

    // Not a post in the platform's group: refused, nothing saved.
    expect(await claimCoursePost(ws.id, member(user.email), 1, "https://www.skool.com/other-group/post")).toMatchObject({ ok: false });
    expect(await claimCoursePost(ws.id, member(user.email), 1, "https://www.skool.com/the-community/about")).toMatchObject({ ok: false });
    expect(await hookJobs(ws.id)).toHaveLength(0);

    expect(await claimCoursePost(ws.id, member(user.email), 1, `${url}#top`)).toEqual({ ok: true, already: false, flagged: false, reason: "", day: 1 });
    const row = await settingsOf(ws.id);
    const s = row.settings as WorkspaceSettings;
    expect(s.journey?.ticks?.post1).toMatchObject({ as: "link" });
    expect(s.journey?.posts?.["1"]).toMatchObject({ url, email: user.email, name: "Jo Member" });
    expect(s.journey?.posts?.["1"]?.flagged).toBeUndefined();

    const [job] = await hookJobs(ws.id);
    expect(job.payload).toEqual({ url: HOOK(1), email: user.email, name: "Jo Member", day: 1, postUrl: url, workspaceId: ws.id, attempt: 1 });
    expect(job.dedupeKey).toBe(`course-unlock:${ws.id}:1`);
    expect(s.journey?.posts?.["1"]?.hook).toMatchObject({ state: "queued", attempt: 1 });
    // Again: nothing fires twice.
    expect(await claimCoursePost(ws.id, member(user.email), 1, postUrl())).toMatchObject({ ok: true, already: true });
    expect(await hookJobs(ws.id)).toHaveLength(1);

    const after = await computePath(row, user.id, { courseUnlocksOn: true });
    const p1 = after.days[0].steps.find((x) => x.key === "post1")!;
    expect(p1.halves).toEqual({ posted: true, reviewed: false });
    expect(p1.postLink?.saved).toEqual({ url, flagged: false, reason: "" });
    expect(after.days[1].opens).toBeUndefined();
    expect(after.days[2].opens).toBe(JOURNEY_COPY.post.opensAfter.replace("{day}", "2"));
    const listed = (await listCourseClaims()).find((c) => c.workspaceId === ws.id);
    expect(listed).toMatchObject({ day: 1, url, email: user.email });
    expect(listed?.flagged).toBeFalsy();
  });

  it("the job posts exactly email, name, day and post_url to Zapier", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (u: string, init: RequestInit) => {
      calls.push({ url: u, body: JSON.parse(String(init.body)) });
      return new Response("ok");
    }) as typeof fetch;
    try {
      await processCourseUnlockWebhook({ url: HOOK(2), email: "a@example.com", name: "A", day: 2, postUrl: "https://www.skool.com/the-community/p" });
      await processCourseUnlockWebhook({ url: "http://127.0.0.1/hook", email: "a@example.com", day: 2 });
    } finally {
      globalThis.fetch = real;
    }
    expect(calls).toEqual([{ url: HOOK(2), body: { email: "a@example.com", name: "A", day: 2, post_url: "https://www.skool.com/the-community/p" } }]);
  });

  it("a link that looks reused is saved and flagged, fires nothing and opens nothing until the owner approves it", async () => {
    await on();
    const { ws, user } = await makeWorkspace();
    const day1 = postUrl();
    await claimCoursePost(ws.id, member(user.email), 1, day1);
    // Their own Day 1 link again, for Day 2.
    const again = await claimCoursePost(ws.id, member(user.email), 2, `${day1}?ref=x`);
    expect(again).toMatchObject({ ok: true, flagged: true, reason: "Same link as their Day 1 post" });
    let s = (await settingsOf(ws.id)).settings as WorkspaceSettings;
    expect(s.journey?.ticks?.post2).toBeUndefined();
    expect(s.journey?.posts?.["2"]).toMatchObject({ flagged: true });
    expect((await hookJobs(ws.id)).map((j) => j.dedupeKey)).toEqual([`course-unlock:${ws.id}:1`]);
    const path = await computePath(await settingsOf(ws.id), user.id, { courseUnlocksOn: true });
    expect(path.days[1].steps.find((x) => x.key === "post2")).toMatchObject({ halves: { posted: false }, postLink: { saved: { flagged: true, reason: "Same link as their Day 1 post" } } });

    // Someone else's post: flagged too, and nothing fires for them.
    const other = await makeWorkspace();
    expect(await claimCoursePost(other.ws.id, member(other.user.email), 1, day1)).toMatchObject({ ok: true, flagged: true, reason: "Same link as another member's post" });
    expect(await hookJobs(other.ws.id)).toHaveLength(0);
    expect((await listCourseClaims())[0]).toMatchObject({ flagged: true });

    // The owner looks, and it's fine: it counts and the hook fires.
    await approveCoursePost(ws.id, 2);
    s = (await settingsOf(ws.id)).settings as WorkspaceSettings;
    expect(s.journey?.ticks?.post2).toMatchObject({ as: "link" });
    expect(s.journey?.posts?.["2"]).toMatchObject({ approvedAt: expect.any(String) });
    expect(s.journey?.posts?.["2"]?.flagged).toBeUndefined();
    const fired = await hookJobs(ws.id);
    expect(fired.find((j) => j.dedupeKey === `course-unlock:${ws.id}:2`)?.payload).toMatchObject({ url: HOOK(2), day: 2, email: user.email });
  });

  it("off: no link form, and a post ticks on the member's word as before", async () => {
    const { ws, user } = await makeWorkspace();
    expect(await claimCoursePost(ws.id, member(user.email), 1, postUrl())).toMatchObject({ ok: false });
    const ticked = { ...ws, settings: { ...ws.settings, journey: { ticks: { post1: { at: new Date().toISOString() }, post1r: { at: new Date().toISOString() } } } } };
    const off = await computePath(ticked, user.id);
    const p1 = off.days[0].steps.find((x) => x.key === "post1")!;
    expect(p1).toMatchObject({ done: true, tick: "you", halves: { posted: true, reviewed: true } });
    expect(p1.postLink).toBeUndefined();
    expect(off.days.some((d) => d.opens)).toBe(false);

    // On, the same bare tick isn't a post link: the form asks for it.
    const onPath = await computePath(ticked, user.id, { courseUnlocksOn: true });
    expect(onPath.days[0].steps.find((x) => x.key === "post1")).toMatchObject({ done: false, halves: { posted: false, reviewed: true } });
  });
});

describe("ReelVault is open from the start, never a reward", () => {
  const src = (f: string) => readFileSync(nodePath.join(process.cwd(), "src", f), "utf8");

  it("no day's reward is ReelVault or anything in the app: they're bonus lessons in Skool", () => {
    expect(Object.keys(DAY_REWARDS).map(Number)).toEqual([1, 2, 3, 4, 5, 7]);
    for (const d of [1, 2, 3, 4, 5]) expect(DAY_REWARDS[d], `Day ${d}`).toMatch(/^Your reward: the bonus lesson ".+" opens in Skool too\.$/);
    expect(DAY_REWARDS[1]).toContain("Steal the Hook");
    expect(DAY_REWARDS[2]).toContain("Ten Posts From One Reel");
    expect(DAY_REWARDS[3]).toContain("The Text That Gets a Reply");
    expect(DAY_REWARDS[4]).toContain("The About Page Swipe");
    expect(DAY_REWARDS[5]).toContain("Your Second Week");
    expect(DAY_REWARDS[6]).toBeUndefined();
    expect(DAY_REWARDS[7]).toContain("weekly live call");
    for (const r of Object.values(DAY_REWARDS)) expect(r).not.toMatch(/ReelVault|menu|in the app/i);
  });

  it("nothing gates it on a post: not the menu, not its page, not the ticket route", () => {
    expect(src("app/app/w/[wid]/layout.tsx")).not.toMatch(/reelVaultLocked|reelVaultRewardOpen/);
    expect(src("app/app/w/[wid]/reelvault/layout.tsx")).not.toMatch(/courseUnlocks|reelVaultRewardOpen|lockedTitle/);
    expect(src("server/reelvault.ts")).not.toMatch(/courseUnlocks|reelVaultRewardOpen/);
    expect(src("server/courseUnlocks.ts")).not.toContain("reelVaultRewardOpen");
    // Still only shown once ONEX_SSO_SECRET is set.
    expect(src("app/app/w/[wid]/layout.tsx")).toContain("reelVault: reelVaultConfigured()");
    expect(src("app/app/w/[wid]/reelvault/layout.tsx")).toContain("if (!reelVaultConfigured())");
  });

  it("the menu shows it open, with its sub-pages, whenever it's switched on, and hides it when it isn't", () => {
    const rv = (reelVault: boolean) =>
      workspaceNav({ base: "/app/w/x", plan: "starter", unread: 0, reelVault, member: true, mode: "week", nextHref: null })
        .flatMap((g) => g.items)
        .find((i) => i.label === "ReelVault");
    expect(rv(true)?.locked).toBeUndefined();
    expect(rv(true)?.children?.length).toBeGreaterThan(0);
    expect(rv(false)).toBeUndefined();
  });
});

describe("course unlocks: Your path's intro says what's true", () => {
  it("says lessons open one post at a time when on, keeps 'nothing locks' when off, and never locks the tools", async () => {
    const { ws, user } = await makeWorkspace();
    const off = await computePath(ws, user.id);
    expect(off.courseUnlocks).toBe(false);
    expect(pathIntro(off)).toBe("Seven days, in the same order as your lessons in Skool. Go at your own speed. Nothing locks and nothing closes.");

    const on = await computePath(ws, user.id, { courseUnlocksOn: true });
    expect(on.courseUnlocks).toBe(true);
    expect(pathIntro(on)).toBe(
      "Seven days, in the same order as your lessons in Skool. Go at your own speed. Each day's lesson opens in Skool when you paste the link to your post from the day before. The app's tools never lock.",
    );
    expect(pathIntro(on)).not.toMatch(/nothing locks/i);

    // Agency accounts aren't in the community, so the switch doesn't reach them.
    const agency = await computePath({ ...ws, accessSource: "agency" }, user.id, { courseUnlocksOn: true });
    expect(pathIntro(agency)).toBe(JOURNEY_COPY.path.sub);
  });
});

describe("Day 1's AI step: a connected Claude counts", () => {
  it("ticks once Claude has used a connector link, not when the link is only made, and stops when it's revoked", async () => {
    const { ws, user } = await makeWorkspace();
    const ai = async () => (await computePath(ws, user.id)).days[0].steps.find((s) => s.key === "ai")!;
    expect(await ai()).toMatchObject({ done: false, tick: null });
    const { token } = await createConnectorToken(ws.id, user.id, "Claude");
    expect(await ai()).toMatchObject({ done: false, tick: null });
    expect(await resolveConnectorToken(token)).toMatchObject({ workspaceId: ws.id });
    expect(await ai()).toMatchObject({ done: true, tick: "app", win: AI_CONNECTOR_WIN });
    const [made] = await listConnectorTokens(ws.id);
    await revokeConnectorToken(ws.id, made.id);
    expect(await ai()).toMatchObject({ done: false, tick: null });
  });
});

describe("course unlocks: switching on never moves anyone backwards", () => {
  it("posts ticked before the switch went on still count; days ticked after it need a link", async () => {
    await on();
    const { since } = await getCourseUnlocks();
    const { ws, user } = await makeWorkspace();
    const before = new Date(Date.parse(since!) - 3_600_000).toISOString();
    const after = new Date(Date.parse(since!) + 1000).toISOString();
    const ticked = { ...ws, settings: { ...ws.settings, journey: { ticks: { post1: { at: before }, post1r: { at: before }, post2: { at: after }, post2r: { at: after } } } } };
    const path = await computePath(ticked, user.id, { courseUnlocksOn: true, courseUnlocksSince: since });
    expect(path.days[0].steps.find((x) => x.key === "post1")).toMatchObject({ done: true, halves: { posted: true, reviewed: true } });
    expect(path.days[1].steps.find((x) => x.key === "post2")).toMatchObject({ done: false, halves: { posted: false, reviewed: true } });
    // Day 2's post is the first still to paste, so Day 3 onwards wait.
    expect(path.days[1].opens).toBeUndefined();
    expect(path.days[2].opens).toBeDefined();
  });

  it("a pre-switch tick with no link saved still asks for the link, and pasting it opens the next lesson", async () => {
    await on();
    const { since } = await getCourseUnlocks();
    const { ws, user } = await makeWorkspace();
    const before = new Date(Date.parse(since!) - 3_600_000).toISOString();
    const db = await getDb();
    await db
      .update(workspaces)
      .set({ settings: { ...ws.settings, journey: { ticks: { post1: { at: before }, post1r: { at: before } } } } })
      .where(eq(workspaces.id, ws.id));
    const step = async () => (await computePath(await settingsOf(ws.id), user.id, { courseUnlocksOn: true, courseUnlocksSince: since })).days[0].steps.find((x) => x.key === "post1")!;

    // Counts for progress, but no post record and no send yet: the form stays up with the catch-up line.
    const pre = await step();
    expect(pre).toMatchObject({ done: true, halves: { posted: true, reviewed: true } });
    expect(pre.postLink?.saved).toBeUndefined();
    expect(pre.postLink?.catchUp).toBe("Paste your Day 1 post link to open your next lesson in Skool.");
    expect(await hookJobs(ws.id)).toHaveLength(0);

    // Pasting creates the record and fires the hook as normal; the catch-up line goes.
    expect(await claimCoursePost(ws.id, member(user.email), 1, postUrl())).toMatchObject({ ok: true, already: false, flagged: false });
    const post = await step();
    expect(post.postLink?.saved?.url).toBeTruthy();
    expect(post.postLink?.catchUp).toBeUndefined();
    expect(post).toMatchObject({ done: true, halves: { posted: true } });
    expect(await hookJobs(ws.id)).toHaveLength(1);
  });

  it("no catch-up line for a link-ticked post or with the switch off", async () => {
    await on();
    const { since } = await getCourseUnlocks();
    const { ws, user } = await makeWorkspace();
    const before = new Date(Date.parse(since!) - 3_600_000).toISOString();
    const ticked = { ...ws, settings: { ...ws.settings, journey: { ticks: { post1: { at: before } } } } };
    const off = await computePath(ticked, user.id, { courseUnlocksOn: false, courseUnlocksSince: since });
    expect(off.days[0].steps.find((x) => x.key === "post1")?.postLink).toBeUndefined();
    const linked = { ...ws, settings: { ...ws.settings, journey: { ticks: { post1: { at: before, as: "link" as const } } } } };
    const on1 = await computePath(linked, user.id, { courseUnlocksOn: true, courseUnlocksSince: since });
    expect(on1.days[0].steps.find((x) => x.key === "post1")?.postLink?.catchUp).toBeUndefined();
  });
});

describe("course unlocks: who's in the course", () => {
  it("a lifetime-granted account is in it like a member; an agency account can't claim or fire the hook", async () => {
    await on();
    const db = await getDb();
    const granted = await makeWorkspace();
    await db.update(workspaces).set({ accessSource: "admin" }).where(eq(workspaces.id, granted.ws.id));
    const row = await settingsOf(granted.ws.id);
    const path = await computePath(row, granted.user.id, { courseUnlocksOn: true });
    expect(path.courseUnlocks).toBe(true);
    expect(path.days[0].steps.find((x) => x.key === "post1")?.postLink).toBeDefined();
    expect(await claimCoursePost(granted.ws.id, member(granted.user.email), 1, postUrl())).toMatchObject({ ok: true, already: false });

    const agency = await makeWorkspace();
    await db.update(workspaces).set({ accessSource: "agency" }).where(eq(workspaces.id, agency.ws.id));
    expect(await claimCoursePost(agency.ws.id, member(agency.user.email), 1, postUrl())).toEqual({ ok: false, error: expect.stringMatching(/isn't in the course/) });
    expect(await hookJobs(agency.ws.id)).toHaveLength(0);
    expect(((await settingsOf(agency.ws.id)).settings as WorkspaceSettings).journey?.posts).toBeUndefined();
  });
});

describe("course unlocks: every send is tracked and can go again", () => {
  const withFetch = async (answer: number | "throw", fn: () => Promise<void>) => {
    const real = globalThis.fetch;
    globalThis.fetch = (async () => {
      if (answer === "throw") throw new Error("network down");
      return new Response("x", { status: answer });
    }) as typeof fetch;
    try {
      await fn();
    } finally {
      globalThis.fetch = real;
    }
  };
  const postOf = async (wid: string, day: number) => ((await settingsOf(wid)).settings as WorkspaceSettings).journey?.posts?.[String(day)];
  const jobFor = async (wid: string, key: string) => (await hookJobs(wid)).find((j) => j.dedupeKey === key)!;

  it("the job records sent, retrying and failed on the member's post, and the owner sees the real state", async () => {
    await on();
    const { ws, user } = await makeWorkspace();
    await claimCoursePost(ws.id, member(user.email), 1, postUrl());
    const job = await jobFor(ws.id, `course-unlock:${ws.id}:1`);

    // A retry is still coming: queued, with the error kept.
    await withFetch(500, async () => {
      await expect(processCourseUnlockWebhook(job.payload, { attempts: 1, maxAttempts: 5 })).rejects.toThrow(/500/);
    });
    expect((await postOf(ws.id, 1))?.hook).toMatchObject({ state: "queued", attempt: 1, error: expect.stringMatching(/500/) });
    // The last try fails: failed.
    await withFetch("throw", async () => {
      await expect(processCourseUnlockWebhook(job.payload, { attempts: 5, maxAttempts: 5 })).rejects.toThrow(/network down/);
    });
    let claim = (await listCourseClaims()).find((c) => c.workspaceId === ws.id)!;
    expect(claim.hook).toMatchObject({ state: "failed", error: "network down" });
    expect(courseClaimStatus(claim)).toMatchObject({ label: "Failed", canResend: true });

    // The member pastes the day again: the failed send goes again under a fresh key, not "already".
    expect(await claimCoursePost(ws.id, member(user.email), 1, postUrl())).toMatchObject({ ok: true, already: false, resent: true });
    const second = await jobFor(ws.id, `course-unlock:${ws.id}:1:2`);
    expect(second.payload).toMatchObject({ attempt: 2, day: 1, workspaceId: ws.id });
    expect((await postOf(ws.id, 1))?.hook).toMatchObject({ state: "queued", attempt: 2 });

    // A stale run of the first job can't overwrite the newer send's state.
    await withFetch(200, async () => processCourseUnlockWebhook(job.payload, { attempts: 1, maxAttempts: 5 }));
    expect((await postOf(ws.id, 1))?.hook).toMatchObject({ state: "queued", attempt: 2 });
    await withFetch(200, async () => processCourseUnlockWebhook(second.payload, { attempts: 1, maxAttempts: 5 }));
    claim = (await listCourseClaims()).find((c) => c.workspaceId === ws.id)!;
    expect(claim.hook).toMatchObject({ state: "sent", attempt: 2 });
    expect(claim.hook?.error).toBeUndefined();
    expect(courseClaimStatus(claim)).toMatchObject({ label: "Sent", tone: "success" });

    // Sent: pasting again fires nothing.
    expect(await claimCoursePost(ws.id, member(user.email), 1, postUrl())).toMatchObject({ ok: true, already: true });
    expect(await hookJobs(ws.id)).toHaveLength(2);

    // The owner's Send again always queues a fresh job.
    await resendCoursePost(ws.id, 1);
    expect(await jobFor(ws.id, `course-unlock:${ws.id}:1:3`)).toBeDefined();
    expect(courseClaimStatus({ ...claim, hook: (await postOf(ws.id, 1))!.hook })).toMatchObject({ label: "Sending", canResend: false });
  });

  it("a day with no Zapier link says so, and goes once the link is added", async () => {
    env.skoolGroupUrl = "https://www.skool.com/the-community/about";
    await setCourseUnlocks({ on: true, hooks: { "2": HOOK(2) } });
    const { ws, user } = await makeWorkspace();
    expect(await claimCoursePost(ws.id, member(user.email), 1, postUrl())).toMatchObject({ ok: true, already: false });
    expect(await hookJobs(ws.id)).toHaveLength(0);
    const claim = (await listCourseClaims()).find((c) => c.workspaceId === ws.id)!;
    expect(claim.hook).toMatchObject({ state: "no-hook", attempt: 0 });
    expect(courseClaimStatus(claim)).toMatchObject({ label: "Not sent: no Zapier link for Day 1", canResend: true });
    await expect(resendCoursePost(ws.id, 1)).rejects.toThrow(/no Zapier link for Day 1/);
    // Re-pasting while there's still no link: nothing to send.
    expect(await claimCoursePost(ws.id, member(user.email), 1, postUrl())).toMatchObject({ ok: true, already: true });

    await setCourseUnlocks({ on: true, hooks: { "1": HOOK(1), "2": HOOK(2) } });
    await resendCoursePost(ws.id, 1);
    // Its first real send keeps the plain key.
    expect((await jobFor(ws.id, `course-unlock:${ws.id}:1`)).payload).toMatchObject({ url: HOOK(1), attempt: 1 });
    expect((await postOf(ws.id, 1))?.hook).toMatchObject({ state: "queued", attempt: 1 });
  });

  it("a link saved before sends were tracked can be sent again under a new key", async () => {
    await on();
    const { ws, user } = await makeWorkspace();
    await claimCoursePost(ws.id, member(user.email), 3, postUrl());
    // Strip the tracking, as on a link saved before it existed.
    const db = await getDb();
    const s = (await settingsOf(ws.id)).settings as WorkspaceSettings;
    const { hook: _h, ...legacy } = s.journey!.posts!["3"];
    await db.update(workspaces).set({ settings: { ...s, journey: { ...s.journey, posts: { "3": legacy } } } }).where(eq(workspaces.id, ws.id));
    const claim = (await listCourseClaims()).find((c) => c.workspaceId === ws.id)!;
    expect(courseClaimStatus(claim)).toMatchObject({ label: "Queued (not tracked)", canResend: true });
    await resendCoursePost(ws.id, 3);
    expect(await jobFor(ws.id, `course-unlock:${ws.id}:3:2`)).toBeDefined();
  });

  it("a flagged link shows its reason and can't be sent again until it's approved", () => {
    expect(courseClaimStatus({ day: 2, flagged: true, reason: "Same link as their Day 1 post" })).toEqual({ label: "Same link as their Day 1 post", tone: "warning", canResend: false });
  });
});
