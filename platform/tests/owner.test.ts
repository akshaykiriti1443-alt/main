import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, aiGenerations, automations, contacts, sites, users, workspaces } from "@/lib/db/schema";
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
    expect(fresh.stages[0].steps.map((x) => x.key)).toEqual(["app", "ai", "kit", "skool", "publish", "lead1", "research", "statics", "clicks", "pixel"]);
    expect(fresh.stages[0].steps.find((x) => x.key === "ai")).toMatchObject({ title: "Connect your AI (optional)", lesson: "1.2", kind: "optional", done: false });
    expect(fresh.total).toBe(23); // 24 with "Say hi"
    expect(fresh.loop).toEqual({ clicks: 0, leads: 0, customers: 0 });
    // Lead follow-ups need the Growth plan, like every automation.
    expect(fresh.stages.find((s) => s.key === "leads")?.steps.find((s) => s.key === "automations")).toMatchObject({
      title: "Switch on your lead follow-ups",
      lesson: "7.1",
      href: `/app/w/${ws.id}/automations`,
      locked: "Growth plan",
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

  it("follows the course (v5): Day 1, Launch Week, then the after-trial modules, the agency last", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath({ ...ws, accessSource: "member" }, user.id, { entryTicketOn: true });
    const where = (k: string) => p.stages.find((s) => s.steps.some((x) => x.key === k));
    const all = p.stages.flatMap((s) => s.steps);
    expect(Object.fromEntries(all.map((x) => [x.key, x.lesson]))).toEqual({
      app: "1.2", hello: "1.2", ai: "1.2", kit: "1.2", skool: "1.2", publish: "1.2", lead1: "1.2",
      research: "1.3", statics: "1.4", clicks: "1.4", pixel: "1.4",
      checkin: "2.6", review: "2.6", customer: "2.5",
      l2: "4.2", bio: "5.1", visitors: "5.2", network: "5.3", l3: "5.3", l4: "6.2",
      automations: "7.1", unlock: "7.2", weeks: "8.1", agency: "8.2",
    });
    expect(p.total).toBe(24);
    expect(where("automations")?.key).toBe("leads");
    expect(p.stages.map((s) => s.tag)).toEqual(["Day 1", "Days 2–7", "Level 2", "Level 3", "Boost & Level 4", "Leads", "Rhythm", "Optional"]);
    expect(p.stages.map((s) => s.steps.map((x) => x.key))).toEqual([
      ["app", "hello", "ai", "kit", "skool", "publish", "lead1", "research", "statics", "clicks", "pixel"],
      ["checkin", "review", "customer"],
      ["l2"],
      ["bio", "visitors", "network", "l3"],
      ["l4"],
      ["automations", "unlock"],
      ["weeks"],
      ["agency"],
    ]);
    expect(all.find((x) => x.key === "research")?.title).toBe("Find ads that already work");
    expect(all.find((x) => x.key === "lead1")?.title).toBe("Be your own lead #1");
    // Optional steps and outcomes are marked, so Up next walks past them.
    expect(all.filter((x) => x.kind === "optional").map((x) => x.key)).toEqual(["ai", "pixel", "agency"]);
    expect(all.filter((x) => x.kind === "outcome").map((x) => x.key)).toEqual(["customer", "l2", "visitors", "network", "l3", "l4"]);
    // The agency step stays last.
    expect(all.at(-1)?.key).toBe("agency");
    // The Skool member CRM is gone: no member price or member sync step, and nothing links to it.
    const steps = p.stages.flatMap((s) => s.steps);
    expect(steps.map((x) => x.key)).not.toContain("price");
    expect(steps.map((x) => x.key)).not.toContain("sync");
    for (const x of steps) expect(x.href, x.key).not.toMatch(/\/skool(\/|$|[?#])/);
    expect(p.stages.map((s) => s.title)).toEqual([
      "Open the shop tonight",
      "Launch Week",
      "Wake up Printy",
      "The 3,000 club",
      "Spending Sam's money",
      "Plug the leaky bucket",
      "Half a boring hour a week",
      "Agency or software",
    ]);
  });

  it("ticks Be your own lead #1 at the first opt-in ever, not at any contact", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    const lead1 = async () => (await computePath(ws, user.id)).stages[0].steps.find((s) => s.key === "lead1");
    expect(await lead1()).toMatchObject({ title: "Be your own lead #1", lesson: "1.2", href: `/app/w/${ws.id}/leads`, done: false });
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

  it("Up next walks past the optional Pixel and outcome steps, which still tick when they happen", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    const steps = async (w = ws) => {
      const p = await computePath(w, user.id);
      return { p, s: (k: string) => p.stages.flatMap((x) => x.steps).find((x) => x.key === k) };
    };
    const gen = (kind: "launch_kit" | "ad_research" | "ad_studio" | "ad_review") => db.insert(aiGenerations).values({ workspaceId: ws.id, kind, model: "rules" });

    // The Pixel is optional and comes right after the Skool-link clicks.
    let { p, s } = await steps();
    const keys = p.stages[0].steps.map((x) => x.key);
    expect(keys.indexOf("pixel")).toBe(keys.indexOf("clicks") + 1);
    expect(s("pixel")).toMatchObject({ title: "Connect your Meta Pixel (optional)", lesson: "1.4", kind: "optional", done: false });

    // Day 1 done except the Pixel (and your own AI): Up next goes to Launch Week, not Settings › Tracking.
    await gen("launch_kit");
    await db.insert(sites).values({ workspaceId: ws.id, name: "Funnel", slug: `funnel-${Date.now()}`, theme: {} as never, published: true });
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: {} });
    await gen("ad_research");
    await gen("ad_studio");
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "meta-ad" } });
    ({ p, s } = await steps());
    expect(p.stages[0].steps.filter((x) => !x.done).map((x) => x.key)).toEqual(["ai", "pixel"]);
    expect(p.next?.key).toBe("checkin");

    // Check-in and review done, no customer yet: Up next skips "Land your first paying member" and Level 2.
    await saveCheckin(ws.id, { aboutVisitors: 40, newPaid: 0, networkSignups: 0, linkInBio: false, skoolLevel: 1 });
    await gen("ad_review");
    ({ p, s } = await steps());
    expect(s("customer")).toMatchObject({ kind: "outcome", done: false });
    expect(s("l2")).toMatchObject({ kind: "outcome", done: false });
    expect(p.next?.key).toBe("bio");
    const before = p.done;

    // Outcomes and optional steps still tick when they happen.
    await saveCheckin(ws.id, { aboutVisitors: 60, newPaid: 1, networkSignups: 0, linkInBio: false, skoolLevel: 1 });
    ({ p, s } = await steps({ ...ws, settings: { ...ws.settings, metaPixelId: "1234567890" } }));
    expect(s("customer")?.done).toBe(true);
    expect(s("pixel")?.done).toBe(true);
    expect(p.done).toBe(before + 2);
    expect(p.next?.key).toBe("bio");
  });

  it("a step locked to another plan never holds Up next, but stays listed with its lock", async () => {
    const { ws, user } = await makeWorkspace(); // the $9 Member plan: no automations
    const db = await getDb();
    const gen = (kind: "launch_kit" | "ad_research" | "ad_studio" | "ad_review") => db.insert(aiGenerations).values({ workspaceId: ws.id, kind, model: "rules" });
    // Every to-do up to "Plug the leaky bucket" done.
    for (const k of ["launch_kit", "ad_research", "ad_studio", "ad_review"] as const) await gen(k);
    await db.insert(sites).values({ workspaceId: ws.id, name: "Funnel", slug: `funnel-lock-${Date.now()}`, theme: {} as never, published: true });
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: {} });
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "meta-ad" } });
    await saveCheckin(ws.id, { aboutVisitors: 60, newPaid: 0, networkSignups: 0, linkInBio: true, skoolLevel: 1 });

    const member = await computePath(ws, user.id);
    const follow = member.stages.flatMap((s) => s.steps).find((s) => s.key === "automations");
    expect(follow).toMatchObject({ title: "Switch on your lead follow-ups", locked: "Growth plan", done: false });
    // "Create your first Unlock" is Up next, not the locked follow-ups.
    expect(member.next?.key).toBe("unlock");
    await createUnlock(ws.id, { title: "Hook Vault", reward: "100 hooks", rewardUrl: "https://docs.example.com/hooks", action: "comment", instructions: "Comment your niche.", skoolPostUrl: "", zapierWebhookUrl: "" });
    // ...then "Do four Monday check-ins".
    expect((await computePath(ws, user.id)).next?.key).toBe("weeks");

    // On the Growth plan the same step isn't locked, so it is Up next again.
    const growth = await computePath({ ...ws, plan: "growth" }, user.id);
    expect(growth.stages.flatMap((s) => s.steps).find((s) => s.key === "automations")?.locked).toBeUndefined();
    expect(growth.next?.key).toBe("automations");
  });

  it("gives Launch Week its own stage badge, so it never reads as Level 2", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath(ws, user.id);
    expect(Object.fromEntries(p.stages.map((s) => [s.tag, stageBadge(s)]))).toEqual({
      "Day 1": { num: "1" },
      "Days 2–7": { icon: "calendar" },
      "Level 2": { num: "2" },
      "Level 3": { num: "3" },
      "Boost & Level 4": { num: "4" },
      Leads: { icon: "flag" },
      Rhythm: { icon: "flag" },
      Optional: { icon: "flag" },
    });
    // Any other range ("Weeks 2–3") would never show its first number either.
    expect(stageBadge({ key: "x", tag: "Weeks 2–3" })).toEqual({ icon: "calendar" });
  });
});
