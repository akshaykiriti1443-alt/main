import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, aiGenerations, automations, contacts, emailSequences, emailSequenceSteps, sites, unlockClaims, users, workspaces } from "@/lib/db/schema";
import { hasFeature, PLANS } from "@/server/plans";
import { chargeUsage } from "@/server/wallet";
import { previewWorkspace } from "@/server/viewAs";
import { computePath, stageBadge } from "@/server/path";
import { createUnlock } from "@/server/unlocks";
import { saveCheckin } from "@/server/growth";
import { makeWorkspace } from "./helpers";

describe("the platform owner gets everything", () => {
  it("the Owner plan has every feature and is never billed", async () => {
    for (const f of PLANS.growth.features) expect(hasFeature("owner", f)).toBe(true);
    const { ws } = await makeWorkspace();
    const db = await getDb();
    await db.update(workspaces).set({ plan: "owner" }).where(eq(workspaces.id, ws.id));
    for (let i = 0; i < 5; i++) expect((await chargeUsage(ws.id, "ai_generation")).billedMicros).toBe(0);
  });

  it("the migration moves the owner's existing workspace to the Owner plan", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, user.id));
    const file = readFileSync(path.join(process.cwd(), "drizzle", "0008_owner_plan.sql"), "utf8");
    await db.execute(sql.raw(file));
    const [after] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(after).toMatchObject({ plan: "owner", accessSource: "admin", status: "active" });
    await db.update(users).set({ isPlatformAdmin: false }).where(eq(users.id, user.id));
  });
});

describe("View as: preview a member's experience", () => {
  it("adjusts plan, status and access for each kind of member without touching data", async () => {
    const { ws } = await makeWorkspace();
    const owner = { ...ws, plan: "owner" as const, accessSource: "admin" as const };
    expect(previewWorkspace(owner, "member")).toMatchObject({ plan: "starter", status: "active", accessSource: "member" });
    expect(hasFeature(previewWorkspace(owner, "member").plan, "automations")).toBe(false);
    expect(hasFeature(previewWorkspace(owner, "growth").plan, "automations")).toBe(true);
    expect(previewWorkspace(owner, "waiting")).toMatchObject({ status: "paused", pauseReason: "access", accessVerifiedUntil: null });
    expect(previewWorkspace(owner, "lapsed").status).toBe("grace");
    expect(previewWorkspace({ ...owner, settings: { entryClaimedAt: "x" } }, "entry").settings.entryClaimedAt).toBeUndefined();
    expect(owner.plan).toBe("owner");
  });
});

describe("Your path: the week as a checklist", () => {
  const all = (p: Awaited<ReturnType<typeof computePath>>) => p.days.flatMap((d) => d.steps);

  it("starts at the member's Claude, ticks steps off from real data and moves the next step on", async () => {
    const { ws, user } = await makeWorkspace();
    const fresh = await computePath({ ...ws, settings: { ...ws.settings, skoolUrl: "" } }, user.id);
    expect(fresh.current?.key).toBe("ai");
    // Day 1 is the first win: Claude, a reel that works, a carousel, the post, then the group and kit.
    // Day 2 is the shop window and the ads: profile, website (half-time), Pixel, 5 ads, this week's posts.
    expect(fresh.days[0].steps.map((x) => x.key)).toEqual(["ai", "reel1", "carousel", "firstpost", "skool", "kit", "post1"]);
    expect(fresh.days[1].steps.map((x) => x.key)).toEqual(["pages", "publish", "pixel", "research", "statics", "clicks", "planweek", "post2"]);
    expect(fresh.days[2].steps.map((x) => x.key)).toEqual(["refresh", "live2", "lead1", "skoolvisit", "events", "post3"]);
    expect(fresh.total).toBe(32); // 33 with "Say hi"
    expect(fresh.loop).toEqual({ clicks: 0, leads: 0, customers: 0 });
    // No always-done "Open your app", and no Day 3 tracking bundle.
    for (const k of ["app", "tracking"]) expect(all(fresh).map((x) => x.key)).not.toContain(k);

    // A click on your own link (a "direct" visit) isn't an ad click.
    const db = await getDb();
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "direct" } });
    const tested = await computePath(ws, user.id);
    expect(all(tested).find((s) => s.key === "live2")?.done).toBe(false);
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "meta-ad" } });

    // A first customer is counted from the Monday check-in, not from the CRM.
    expect(tested.after.find((s) => s.key === "customer")?.done).toBe(false);
    await saveCheckin(ws.id, { aboutVisitors: 140, newPaid: 1, networkSignups: 0, linkInBio: true, skoolLevel: 2 });
    const later = await computePath(ws, user.id);
    for (const k of ["live2", "skoolvisit", "checkin"]) expect(all(later).find((s) => s.key === k)?.done, k).toBe(true);
    const after = (k: string) => later.after.find((s) => s.key === k);
    for (const k of ["customer", "l2", "bio"]) expect(after(k)?.done, k).toBe(true);
    for (const k of ["visitors", "network", "l3", "weeks"]) expect(after(k)?.done, k).toBe(false);
    expect(later.current?.key).toBe("ai");
    expect(later.level).toBe(2);
    expect(later.done).toBeGreaterThan(fresh.done);
    expect(later.loop).toEqual({ clicks: 2, leads: 0, customers: 1 });

    for (let i = 0; i < 3; i++) await saveCheckin(ws.id, { aboutVisitors: 3200, newPaid: 2, networkSignups: 12, linkInBio: true, skoolLevel: 2 });
    const month = await computePath(ws, user.id);
    for (const k of ["visitors", "network", "weeks"]) expect(month.after.find((s) => s.key === k)?.done, k).toBe(true);
  });

  it("follows the course: Day 1 to Day 7, each ending on its Skool post, then a closed list after the week", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath({ ...ws, accessSource: "member", settings: { ...ws.settings, entryClaimedAt: new Date().toISOString() } }, user.id, { entryTicketOn: true });
    expect(p.days.map((d) => d.steps.map((x) => x.key))).toEqual([
      ["hello", "ai", "reel1", "carousel", "firstpost", "skool", "kit", "post1"],
      ["pages", "publish", "pixel", "research", "statics", "clicks", "planweek", "post2"],
      ["refresh", "live2", "lead1", "skoolvisit", "events", "post3"],
      ["welcome", "unlock", "lesson", "post4"],
      ["warm", "post5"],
      ["review", "post6"],
      ["checkin", "decide", "post7"],
    ]);
    expect(p.total).toBe(33);
    expect(p.days.map((d) => d.title)).toEqual([
      "Your first win",
      "Your shop window and your first ads",
      "A second road, and a stranger's eyes",
      "Furnish the room before guests arrive",
      "Five real conversations",
      "Your ad numbers, in plain words",
      "The Level 2 checkpoint, and your decision",
    ]);
    expect(p.stages.map((s) => s.key)).toEqual(["day1", "day2", "day3", "day4", "day5", "day6", "day7", "season2", "second"]);
    expect(p.stages.map((s) => s.tag)).toEqual(["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7", "Season 2", "Bonus"]);
    expect(p.after.map((s) => s.key)).toEqual(["l2", "customer", "claim1", "email4", "weeks", "bio", "visitors", "network", "l3", "l4", "agency"]);
    expect(p.after.filter((x) => x.kind === "outcome").map((x) => x.key)).toEqual(["l2", "customer", "claim1", "visitors", "network", "l3", "l4"]);
    expect(p.after.at(-1)?.key).toBe("agency");
    // The Skool member CRM is gone: no member price or member sync step, and nothing links to it.
    const keys = all(p).map((x) => x.key);
    expect(keys).not.toContain("price");
    expect(keys).not.toContain("sync");
    for (const x of p.stages.flatMap((s) => s.steps)) expect(x.href, x.key).not.toMatch(/\/skool(\/|$|[?#])/);
    // Every day ends on its post, in its own section, and the post link opens the next day.
    for (const d of p.days) {
      const post = d.steps.findIndex((x) => x.key === `post${d.day}`);
      expect(d.steps[post], `Day ${d.day}`).toMatchObject({ key: `post${d.day}`, section: d.section, selfLabel: "I posted mine", reviewLabel: "I reviewed the one before me" });
      expect(post, `Day ${d.day}`).toBe(d.steps.length - 1);
    }
    expect(p.days.slice(0, 2).map((d) => d.section)).toEqual(["Day 1: My First Post", "Day 2: Website + Ads Live"]);
    expect(all(p).find((x) => x.key === "hello")?.why).not.toMatch(/likes?|usually|same day/i);
  });

  it("ticks 'Sign up on your own website' at the first opt-in ever, not at any contact", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    const lead1 = async () => (await computePath(ws, user.id)).days[2].steps.find((s) => s.key === "lead1");
    expect(await lead1()).toMatchObject({ title: "Sign up on your own website", day: 3, done: false });
    // An Unlock claim or an import makes a contact, but that isn't an opt-in.
    const [c] = await db.insert(contacts).values({ workspaceId: ws.id, email: `me-${Date.now()}@example.com`, source: "manual" }).returning();
    await db.insert(activities).values({ workspaceId: ws.id, contactId: c.id, type: "unlock_claim", data: {} });
    expect((await lead1())?.done).toBe(false);
    // A "lead" activity from long ago still counts: it's all time, unlike the 30-day Loop.
    await db.insert(activities).values({ workspaceId: ws.id, contactId: c.id, type: "lead", data: {}, createdAt: new Date(Date.now() - 90 * 86_400_000) });
    const p = await computePath(ws, user.id);
    expect(p.days[2].steps.find((s) => s.key === "lead1")).toMatchObject({ done: true, tick: "app" });
    expect(p.loop.leads).toBe(0);
  });

  it("makes the Pixel a Day 2 to-do right after the website, and walks past outcomes, which still tick", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    const gen = (kind: "launch_kit" | "ad_research" | "ad_studio" | "ad_review") => db.insert(aiGenerations).values({ workspaceId: ws.id, kind, model: "rules" });
    const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const now = new Date().toISOString();
    // Day 1's word-only steps done two days ago (the first post through the old video1 key), and Day 2's Page today.
    const ticks = { reel1: { at: old }, video1: { at: old }, post1: { at: old }, post1r: { at: old }, pages: { at: now } };
    const keyed = { ...ws, settings: { ...ws.settings, aiKeyEnc: "x", journey: { ticks } } };

    let p = await computePath(keyed, user.id);
    const keys = p.days[1].steps.map((x) => x.key);
    expect(keys.indexOf("pixel")).toBe(keys.indexOf("publish") + 1);
    expect(p.days[1].steps.find((s) => s.key === "pixel")).toMatchObject({ title: "Connect your Meta Pixel", day: 2, done: false, canLater: true });

    // Everything before it done: the Pixel is the next step, not skipped.
    await gen("launch_kit");
    await db.insert(sites).values({ workspaceId: ws.id, name: "Funnel", slug: `funnel-${Date.now()}`, theme: {} as never, published: true });
    p = await computePath(keyed, user.id);
    expect(p.current?.key).toBe("pixel");

    const pixelled = { ...keyed, settings: { ...keyed.settings, metaPixelId: "1234567890" } };
    await gen("ad_research");
    p = await computePath(pixelled, user.id);
    expect(p.current?.key).toBe("statics");
    const before = p.done;

    // Outcomes tick when they happen, and are never the next step or counted.
    await saveCheckin(ws.id, { aboutVisitors: 60, newPaid: 1, networkSignups: 0, linkInBio: false, skoolLevel: 1 });
    p = await computePath(pixelled, user.id);
    expect(p.after.find((s) => s.key === "customer")?.done).toBe(true);
    expect(p.days[6].steps.find((s) => s.key === "checkin")?.done).toBe(true); // the check-in step itself ticks too
    expect(p.done).toBe(before + 1);
    expect(p.current?.key).toBe("statics");
  });

  it("has no locks and no 'Opens Day', and hides the lead follow-ups on the Member plan", async () => {
    const { ws, user } = await makeWorkspace(); // the $9 Member plan: no automations
    const member = await computePath(ws, user.id);
    expect(member.after.map((s) => s.key)).not.toContain("automations");
    expect(JSON.stringify(member)).not.toMatch(/Opens Day|Growth plan|"locked"/);

    const growth = await computePath({ ...ws, plan: "growth" }, user.id);
    expect(growth.after.find((s) => s.key === "automations")).toMatchObject({ title: "Switch on your lead follow-ups", kind: "optional", done: false, href: `/app/w/${ws.id}/automations` });
    // Any live automation ticks it, and it's never the next step.
    const db = await getDb();
    await db.insert(automations).values({ workspaceId: ws.id, name: "Warm-up new leads", trigger: { type: "lead_created", value: "" }, actions: [{ type: "add_tag", tag: "new-lead" }], active: true });
    const live = await computePath({ ...ws, plan: "growth" }, user.id);
    expect(live.after.find((s) => s.key === "automations")?.done).toBe(true);
    expect(live.current?.key).toBe("ai");
  });

  it("ticks from real data: a website pack, a Skool-link pack, an Unlock, a claim, a fourth email", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    const step = async (k: string) => all(await computePath(ws, user.id)).find((s) => s.key === k);
    const after = async (k: string) => (await computePath(ws, user.id)).after.find((s) => s.key === k);

    await db.insert(aiGenerations).values({ workspaceId: ws.id, kind: "ad_studio", model: "rules", input: { destination: "website" } });
    expect((await step("statics"))?.done).toBe(true);
    expect((await step("refresh"))?.done).toBe(false);
    await db.insert(aiGenerations).values({ workspaceId: ws.id, kind: "ad_studio", model: "rules", input: { destination: "skool" } });
    expect((await step("refresh"))?.done).toBe(true);

    expect((await after("claim1"))?.done).toBe(false);
    const made = await createUnlock(ws.id, { title: "Hook Vault", reward: "100 hooks", rewardUrl: "https://docs.example.com/hooks", action: "comment", instructions: "Comment your niche.", skoolPostUrl: "", zapierWebhookUrl: "" });
    expect((await step("unlock"))?.done).toBe(true);
    expect((await after("claim1"))?.done).toBe(false);
    await db.insert(unlockClaims).values({ unlockId: made.id, workspaceId: ws.id, email: "ben@example.com", postUrl: "https://www.skool.com/fit-dads/post-1" });
    expect((await after("claim1"))?.done).toBe(true);
    expect((await computePath(ws, user.id)).events.claim).toBe(true);

    // Any sequence with four emails. Three in each of two sequences isn't it.
    const [a] = await db.insert(emailSequences).values({ workspaceId: ws.id, name: "Kit" }).returning();
    const [b] = await db.insert(emailSequences).values({ workspaceId: ws.id, name: "Other" }).returning();
    const email = (sequenceId: string, position: number) => ({ sequenceId, position, subject: `Email ${position}`, body: "Hi" });
    await db.insert(emailSequenceSteps).values([email(a.id, 0), email(a.id, 1), email(a.id, 2), email(b.id, 0), email(b.id, 1), email(b.id, 2)]);
    expect((await after("email4"))?.done).toBe(false);
    await db.insert(emailSequenceSteps).values(email(b.id, 3));
    expect(await after("email4")).toMatchObject({ title: "Add email 4", lesson: "Season 2", href: `/app/w/${ws.id}/emails`, done: true });
  });

  it("numbers each day, and Season 2 gets a flag so it never reads as Level 2", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath(ws, user.id);
    expect(Object.fromEntries(p.stages.map((s) => [s.key, stageBadge(s)]))).toEqual({
      day1: { num: "1" },
      day2: { num: "2" },
      day3: { num: "3" },
      day4: { num: "4" },
      day5: { num: "5" },
      day6: { num: "6" },
      day7: { num: "7" },
      season2: { icon: "flag" }, // "Season 2" must never show as a 2
      second: { icon: "flag" },
    });
    // Any other range ("Weeks 2–3") would never show its first number either.
    expect(stageBadge({ key: "x", tag: "Weeks 2–3" })).toEqual({ icon: "calendar" });
  });
});
