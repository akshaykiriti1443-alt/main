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

describe("Your path: the course as a guided flow", () => {
  it("starts at the launch kit, ticks steps off from real data and moves the next step on", async () => {
    const { ws, user } = await makeWorkspace();
    const fresh = await computePath({ ...ws, settings: { ...ws.settings, skoolUrl: "" } }, user.id);
    // Connecting your AI is optional, so a new member starts on the launch kit.
    expect(fresh.next?.key).toBe("kit");
    expect(fresh.stages[0].steps.map((x) => x.key)).toEqual(["app", "kit", "skool", "publish", "pixel", "lead1"]);
    expect(fresh.stages[1].steps.map((x) => x.key)).toEqual(["research", "statics", "clicks"]);
    expect(fresh.stages.find((s) => s.key === "day2")?.steps.find((x) => x.key === "ai")).toMatchObject({ title: "Get your free AI key", lesson: "Day 2", done: false, locked: "Opens Day 2" });
    expect(fresh.total).toBe(28); // 29 with "Say hi"
    expect(fresh.loop).toEqual({ clicks: 0, leads: 0, customers: 0 });
    // Lead follow-ups need the Growth plan, like every automation.
    expect(fresh.stages.find((s) => s.key === "season2")?.steps.find((s) => s.key === "automations")).toMatchObject({
      title: "Switch on your lead follow-ups",
      lesson: "Season 2",
      href: `/app/w/${ws.id}/automations`,
      locked: "Growth plan",
      kind: "optional",
      done: false,
    });

    // A click on your own link (a "direct" visit) isn't traffic yet.
    const db = await getDb();
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "direct" } });
    const tested = await computePath(ws, user.id);
    expect(tested.stages.flatMap((s) => s.steps).find((s) => s.key === "clicks")?.done).toBe(false);
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "meta-ad" } });

    // A first customer is counted from the Monday check-in, not from the CRM.
    expect(tested.stages.flatMap((s) => s.steps).find((s) => s.key === "customer")?.done).toBe(false);
    await saveCheckin(ws.id, { aboutVisitors: 140, newPaid: 1, networkSignups: 0, linkInBio: true, skoolLevel: 2 });
    const later = await computePath(ws, user.id);
    const step = (k: string) => later.stages.flatMap((s) => s.steps).find((s) => s.key === k);
    for (const k of ["clicks", "customer", "checkin", "l2", "bio"]) expect(step(k)?.done, k).toBe(true);
    for (const k of ["visitors", "network", "l3", "weeks"]) expect(step(k)?.done, k).toBe(false);
    expect(later.next?.key).not.toBe("customer");
    expect(later.level).toBe(2);
    expect(later.done).toBeGreaterThan(fresh.done);
    expect(later.loop).toEqual({ clicks: 2, leads: 0, customers: 1 });

    // Any live automation ticks off the lead follow-ups.
    await db.insert(automations).values({ workspaceId: ws.id, name: "Warm-up new leads", trigger: { type: "lead_created", value: "" }, actions: [{ type: "add_tag", tag: "new-lead" }], active: true });
    expect((await computePath(ws, user.id)).stages.flatMap((s) => s.steps).find((s) => s.key === "automations")?.done).toBe(true);

    for (let i = 0; i < 3; i++) await saveCheckin(ws.id, { aboutVisitors: 3200, newPaid: 2, networkSignups: 12, linkInBio: true, skoolLevel: 2 });
    const month = await computePath(ws, user.id);
    const m = (k: string) => month.stages.flatMap((s) => s.steps).find((s) => s.key === k);
    for (const k of ["visitors", "network", "weeks"]) expect(m(k)?.done, k).toBe(true);
  });

  it("follows the course: Day 1 to Day 7, then Season 2, the agency last", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath({ ...ws, accessSource: "member" }, user.id, { entryTicketOn: true });
    const where = (k: string) => p.stages.find((s) => s.steps.some((x) => x.key === k));
    const all = p.stages.flatMap((s) => s.steps);
    expect(Object.fromEntries(all.map((x) => [x.key, x.lesson]))).toEqual({
      hello: "Day 1", app: "Day 1", kit: "Day 1", skool: "Day 1", publish: "Day 1", pixel: "Day 1", lead1: "Day 1",
      research: "Day 1", statics: "Day 1", clicks: "Day 1",
      ai: "Day 2", refresh: "Day 2",
      tracking: "Day 3",
      unlock: "Day 4",
      warm: "Day 5",
      review: "Day 6",
      checkin: "Day 7",
      l2: "Season 2", customer: "Season 2", claim1: "Season 2", email4: "Season 2", automations: "Season 2", weeks: "Season 2",
      bio: "Season 2", visitors: "Season 2", network: "Season 2", l3: "Season 2", l4: "Season 2",
      agency: "Bonus",
    });
    expect(p.total).toBe(29);
    expect(where("automations")?.key).toBe("season2");
    expect(p.stages.map((s) => s.key)).toEqual(["start", "ads", "day2", "day3", "day4", "day5", "day6", "day7", "season2", "second"]);
    expect(p.stages.map((s) => s.tag)).toEqual(["Day 1", "Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7", "Season 2", "Bonus"]);
    expect(p.stages.map((s) => s.steps.map((x) => x.key))).toEqual([
      ["hello", "app", "kit", "skool", "publish", "pixel", "lead1"],
      ["research", "statics", "clicks"],
      ["ai", "refresh"],
      ["tracking"],
      ["unlock"],
      ["warm"],
      ["review"],
      ["checkin"],
      ["l2", "customer", "claim1", "email4", "automations", "weeks", "bio", "visitors", "network", "l3", "l4"],
      ["agency"],
    ]);
    expect(all.find((x) => x.key === "research")?.title).toBe("Find ads that already work");
    expect(all.find((x) => x.key === "lead1")?.title).toBe("Be your own lead #1");
    // Optional steps and outcomes are marked, so Up next walks past them.
    expect(all.filter((x) => x.kind === "optional").map((x) => x.key)).toEqual(["automations", "agency"]);
    expect(all.filter((x) => x.kind === "outcome").map((x) => x.key)).toEqual(["l2", "customer", "claim1", "visitors", "network", "l3", "l4"]);
    // The agency step stays last.
    expect(all.at(-1)?.key).toBe("agency");
    // The Skool member CRM is gone: no member price or member sync step, and nothing links to it.
    const steps = p.stages.flatMap((s) => s.steps);
    expect(steps.map((x) => x.key)).not.toContain("price");
    expect(steps.map((x) => x.key)).not.toContain("sync");
    for (const x of steps) expect(x.href, x.key).not.toMatch(/\/skool(\/|$|[?#])/);
    expect(p.stages.map((s) => s.title)).toEqual([
      "Your whole machine goes live",
      "Your first 5 ads",
      "Five more ads, straight to Skool",
      "Walk through your own machine",
      "Furnish the room before guests arrive",
      "Your first 20 already know your name",
      "Your real numbers",
      "The scoreboard, and your decision",
      "After your free week",
      "Agency or software",
    ]);
    expect(all.find((x) => x.key === "hello")?.why).not.toMatch(/likes?/i);
  });

  it("ticks Be your own lead #1 at the first opt-in ever, not at any contact", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    const lead1 = async () => (await computePath(ws, user.id)).stages[0].steps.find((s) => s.key === "lead1");
    expect(await lead1()).toMatchObject({ title: "Be your own lead #1", lesson: "Day 1", href: `/app/w/${ws.id}/leads`, done: false });
    // An Unlock claim or an import makes a contact, but that isn't an opt-in.
    const [c] = await db.insert(contacts).values({ workspaceId: ws.id, email: `me-${Date.now()}@example.com`, source: "manual" }).returning();
    await db.insert(activities).values({ workspaceId: ws.id, contactId: c.id, type: "unlock_claim", data: {} });
    expect((await lead1())?.done).toBe(false);
    // A "lead" activity from long ago still counts: it's all time, unlike the 30-day Loop.
    await db.insert(activities).values({ workspaceId: ws.id, contactId: c.id, type: "lead", data: {}, createdAt: new Date(Date.now() - 90 * 86_400_000) });
    const p = await computePath(ws, user.id);
    expect(p.stages[0].steps.find((s) => s.key === "lead1")?.done).toBe(true);
    expect(p.loop.leads).toBe(0);
  });

  it("makes the Pixel a Day 1 to-do between publish and lead #1, and walks past outcomes, which still tick", async () => {
    const { ws: fresh, user } = await makeWorkspace();
    // Past every Opens Day, so no course day is still waiting.
    const ws = { ...fresh, createdAt: new Date(Date.now() - 19.5 * 86_400_000) };
    const db = await getDb();
    const steps = async (w = ws) => {
      const p = await computePath(w, user.id);
      return { p, s: (k: string) => p.stages.flatMap((x) => x.steps).find((x) => x.key === k) };
    };
    const gen = (kind: "launch_kit" | "ad_research" | "ad_studio" | "ad_review") => db.insert(aiGenerations).values({ workspaceId: ws.id, kind, model: "rules" });

    let { p, s } = await steps();
    const keys = p.stages[0].steps.map((x) => x.key);
    expect(keys.indexOf("pixel")).toBe(keys.indexOf("publish") + 1);
    expect(keys.indexOf("lead1")).toBe(keys.indexOf("pixel") + 1);
    expect(s("pixel")).toMatchObject({ title: "Connect your Meta Pixel", lesson: "Day 1", done: false });
    expect(s("pixel")?.kind).toBeUndefined();

    // Everything before it done: the Pixel is Up next, not skipped.
    await gen("launch_kit");
    await db.insert(sites).values({ workspaceId: ws.id, name: "Funnel", slug: `funnel-${Date.now()}`, theme: {} as never, published: true });
    ({ p } = await steps());
    expect(p.next?.key).toBe("pixel");

    const pixelled = { ...ws, settings: { ...ws.settings, metaPixelId: "1234567890" } };
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: {} });
    await gen("ad_research");
    await gen("ad_studio");
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "meta-ad" } });
    ({ p, s } = await steps(pixelled));
    expect(s("pixel")?.done).toBe(true);
    expect(p.next?.key).toBe("ai");
    expect(s("customer")).toMatchObject({ kind: "outcome", done: false });
    expect(s("l2")).toMatchObject({ kind: "outcome", done: false });
    const before = p.done;

    // Outcomes still tick when they happen, and never hold Up next.
    await saveCheckin(ws.id, { aboutVisitors: 60, newPaid: 1, networkSignups: 0, linkInBio: false, skoolLevel: 1 });
    ({ p, s } = await steps(pixelled));
    expect(s("customer")?.done).toBe(true);
    expect(s("checkin")?.done).toBe(true); // the check-in itself ticks too
    expect(p.done).toBe(before + 2);
    expect(p.next?.key).toBe("ai");
  });

  it("a step locked to another plan never holds Up next, but stays listed with its lock", async () => {
    const { ws: fresh, user } = await makeWorkspace(); // the $9 Member plan: no automations
    const ws = { ...fresh, createdAt: new Date(Date.now() - 19.5 * 86_400_000) }; // past every Opens Day
    const db = await getDb();
    const gen = (kind: "launch_kit" | "ad_research" | "ad_studio" | "ad_review") => db.insert(aiGenerations).values({ workspaceId: ws.id, kind, model: "rules" });
    // Every to-do through Day 7 done.
    for (const k of ["launch_kit", "ad_research", "ad_studio", "ad_studio", "ad_review"] as const) await gen(k);
    await db.insert(sites).values({ workspaceId: ws.id, name: "Funnel", slug: `funnel-lock-${Date.now()}`, theme: {} as never, published: true });
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: {} });
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: {} });
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "meta-ad" } });
    await db.insert(contacts).values({ workspaceId: ws.id, email: `warm-${Date.now()}@example.com`, source: "manual" });
    await saveCheckin(ws.id, { aboutVisitors: 60, newPaid: 0, networkSignups: 0, linkInBio: true, skoolLevel: 1 });
    const ready = { ...ws, settings: { ...ws.settings, metaPixelId: "1234567890", aiKeyEnc: "x" } };

    const member = await computePath(ready, user.id);
    const follow = member.stages.flatMap((s) => s.steps).find((s) => s.key === "automations");
    expect(follow).toMatchObject({ title: "Switch on your lead follow-ups", locked: "Growth plan", done: false });
    // "Create your first Unlock" is Up next, not the locked follow-ups.
    expect(member.next?.key).toBe("unlock");
    await createUnlock(ws.id, { title: "Hook Vault", reward: "100 hooks", rewardUrl: "https://docs.example.com/hooks", action: "comment", instructions: "Comment your niche.", skoolPostUrl: "", zapierWebhookUrl: "" });
    // ...then "Add email 4", walking past the locked follow-ups beside it.
    expect((await computePath(ready, user.id)).next?.key).toBe("email4");

    // On the Growth plan the step isn't locked, but it stays optional, so it still never holds Up next.
    const growth = await computePath({ ...ready, plan: "growth" }, user.id);
    expect(growth.stages.flatMap((s) => s.steps).find((s) => s.key === "automations")).toMatchObject({ kind: "optional", done: false });
    expect(growth.stages.flatMap((s) => s.steps).find((s) => s.key === "automations")?.locked).toBeUndefined();
    expect(growth.next?.key).toBe("email4");
  });

  it("ticks the new v6 steps from real data: a second pack, a claim, a fourth email", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    const step = async (k: string) => (await computePath(ws, user.id)).stages.flatMap((s) => s.steps).find((s) => s.key === k);
    const gen = () => db.insert(aiGenerations).values({ workspaceId: ws.id, kind: "ad_studio", model: "rules" });

    // One Ad studio pack ticks Day 1's statics. Only a second one is "fresh".
    await gen();
    expect((await step("statics"))?.done).toBe(true);
    expect((await step("refresh"))?.done).toBe(false);
    await gen();
    expect((await step("refresh"))?.done).toBe(true);

    // A claim on one of this workspace's Unlocks.
    expect((await step("claim1"))?.done).toBe(false);
    const made = await createUnlock(ws.id, { title: "Hook Vault", reward: "100 hooks", rewardUrl: "https://docs.example.com/hooks", action: "comment", instructions: "Comment your niche.", skoolPostUrl: "", zapierWebhookUrl: "" });
    expect((await step("unlock"))?.done).toBe(true);
    expect((await step("claim1"))?.done).toBe(false);
    await db.insert(unlockClaims).values({ unlockId: made.id, workspaceId: ws.id, email: "ben@example.com", postUrl: "https://www.skool.com/fit-dads/post-1" });
    expect((await step("claim1"))?.done).toBe(true);

    // Any sequence with four emails. Three in each of two sequences isn't it.
    const [a] = await db.insert(emailSequences).values({ workspaceId: ws.id, name: "Kit" }).returning();
    const [b] = await db.insert(emailSequences).values({ workspaceId: ws.id, name: "Other" }).returning();
    const email = (sequenceId: string, position: number) => ({ sequenceId, position, subject: `Email ${position}`, body: "Hi" });
    await db.insert(emailSequenceSteps).values([email(a.id, 0), email(a.id, 1), email(a.id, 2), email(b.id, 0), email(b.id, 1), email(b.id, 2)]);
    expect((await step("email4"))?.done).toBe(false);
    await db.insert(emailSequenceSteps).values(email(b.id, 3));
    expect(await step("email4")).toMatchObject({ title: "Add email 4", lesson: "Season 2", href: `/app/w/${ws.id}/emails`, done: true });
  });

  it("numbers each day, and Season 2 gets a flag so it never reads as Level 2", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath(ws, user.id);
    expect(Object.fromEntries(p.stages.map((s) => [s.key, stageBadge(s)]))).toEqual({
      start: { num: "1" },
      ads: { num: "1" },
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
