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
    expect(fresh.stages[0].steps.map((x) => x.key)).toEqual(["app", "kit", "skool", "publish", "lead1"]);
    expect(fresh.stages[1].steps.map((x) => x.key)).toEqual(["research", "statics", "clicks", "pixel"]);
    expect(fresh.stages.find((s) => s.key === "day8")?.steps.find((x) => x.key === "ai")).toMatchObject({ title: "Connect your AI (optional)", lesson: "3.1", kind: "optional", done: false });
    expect(fresh.total).toBe(26); // 27 with "Say hi"
    expect(fresh.loop).toEqual({ clicks: 0, leads: 0, customers: 0 });
    // Lead follow-ups need the Growth plan, like every automation.
    expect(fresh.stages.find((s) => s.key === "rhythm")?.steps.find((s) => s.key === "automations")).toMatchObject({
      title: "Switch on your lead follow-ups",
      lesson: "6.1",
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

  it("follows the course (v6): Day 1, Launch Week, then the after-trial modules, the agency last", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath({ ...ws, accessSource: "member" }, user.id, { entryTicketOn: true });
    const where = (k: string) => p.stages.find((s) => s.steps.some((x) => x.key === k));
    const all = p.stages.flatMap((s) => s.steps);
    expect(Object.fromEntries(all.map((x) => [x.key, x.lesson]))).toEqual({
      hello: "1.1", app: "1.3", kit: "1.3", skool: "1.3", publish: "1.4", lead1: "1.4",
      research: "1.5", statics: "1.6", clicks: "1.7", pixel: "1.7",
      checkin: "2.6", review: "2.6",
      ai: "3.1", refresh: "3.1",
      l2: "4.1", customer: "4.2",
      unlock: "5.2", claim1: "5.2",
      email4: "6.1", automations: "6.1", weeks: "6.2",
      bio: "7.1", visitors: "7.1", network: "7.2", l3: "7.2", l4: "7.2",
      agency: "B.1",
    });
    expect(p.total).toBe(27);
    expect(where("automations")?.key).toBe("rhythm");
    expect(p.stages.map((s) => s.key)).toEqual(["start", "ads", "launch", "day8", "level2", "talk", "rhythm", "upper", "second"]);
    expect(p.stages.map((s) => s.tag)).toEqual(["Day 1", "Day 1", "Days 2–7", "Day 8", "Level 2", "Talk", "Rhythm", "Season 2", "Bonus"]);
    expect(p.stages.map((s) => s.steps.map((x) => x.key))).toEqual([
      ["hello", "app", "kit", "skool", "publish", "lead1"],
      ["research", "statics", "clicks", "pixel"],
      ["checkin", "review"],
      ["ai", "refresh"],
      ["l2", "customer"],
      ["unlock", "claim1"],
      ["email4", "automations", "weeks"],
      ["bio", "visitors", "network", "l3", "l4"],
      ["agency"],
    ]);
    expect(all.find((x) => x.key === "research")?.title).toBe("Find ads that already work");
    expect(all.find((x) => x.key === "lead1")?.title).toBe("Be your own lead #1");
    // Optional steps and outcomes are marked, so Up next walks past them.
    expect(all.filter((x) => x.kind === "optional").map((x) => x.key)).toEqual(["pixel", "ai", "refresh", "automations", "agency"]);
    expect(all.filter((x) => x.kind === "outcome").map((x) => x.key)).toEqual(["l2", "customer", "claim1", "visitors", "network", "l3", "l4"]);
    // The agency step stays last.
    expect(all.at(-1)?.key).toBe("agency");
    // The Skool member CRM is gone: no member price or member sync step, and nothing links to it.
    const steps = p.stages.flatMap((s) => s.steps);
    expect(steps.map((x) => x.key)).not.toContain("price");
    expect(steps.map((x) => x.key)).not.toContain("sync");
    for (const x of steps) expect(x.href, x.key).not.toMatch(/\/skool(\/|$|[?#])/);
    expect(p.stages.map((s) => s.title)).toEqual([
      "Open the shop",
      "Five ads live",
      "Launch Week",
      "Keep, fix or kill",
      "Wake up Printy",
      "Give them a reason to post",
      "Half a boring hour a week",
      "The upper rungs",
      "Agency or software",
    ]);
    expect(all.find((x) => x.key === "hello")?.why).not.toMatch(/likes?/i);
  });

  it("ticks Be your own lead #1 at the first opt-in ever, not at any contact", async () => {
    const { ws, user } = await makeWorkspace();
    const db = await getDb();
    const lead1 = async () => (await computePath(ws, user.id)).stages[0].steps.find((s) => s.key === "lead1");
    expect(await lead1()).toMatchObject({ title: "Be your own lead #1", lesson: "1.4", href: `/app/w/${ws.id}/leads`, done: false });
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
    const keys = p.stages[1].steps.map((x) => x.key);
    expect(keys.indexOf("pixel")).toBe(keys.indexOf("clicks") + 1);
    expect(s("pixel")).toMatchObject({ title: "Connect your Meta Pixel (optional)", lesson: "1.7", kind: "optional", done: false });

    // Day 1 done except the Pixel: Up next goes to Launch Week, not Settings › Tracking.
    await gen("launch_kit");
    await db.insert(sites).values({ workspaceId: ws.id, name: "Funnel", slug: `funnel-${Date.now()}`, theme: {} as never, published: true });
    await db.insert(activities).values({ workspaceId: ws.id, type: "lead", data: {} });
    await gen("ad_research");
    await gen("ad_studio");
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "meta-ad" } });
    ({ p, s } = await steps());
    expect(p.stages.slice(0, 2).flatMap((st) => st.steps).filter((x) => !x.done).map((x) => x.key)).toEqual(["pixel"]);
    expect(p.next?.key).toBe("checkin");

    // Check-in and review done, no customer yet: Up next skips the optional Day 8 steps, Level 2 and "Land your first paying member".
    await saveCheckin(ws.id, { aboutVisitors: 40, newPaid: 0, networkSignups: 0, linkInBio: false, skoolLevel: 1 });
    await gen("ad_review");
    ({ p, s } = await steps());
    expect(s("customer")).toMatchObject({ kind: "outcome", done: false });
    expect(s("l2")).toMatchObject({ kind: "outcome", done: false });
    expect(s("refresh")).toMatchObject({ kind: "optional", done: false });
    expect(p.next?.key).toBe("unlock");
    const before = p.done;

    // Outcomes and optional steps still tick when they happen.
    await saveCheckin(ws.id, { aboutVisitors: 60, newPaid: 1, networkSignups: 0, linkInBio: false, skoolLevel: 1 });
    ({ p, s } = await steps({ ...ws, settings: { ...ws.settings, metaPixelId: "1234567890" } }));
    expect(s("customer")?.done).toBe(true);
    expect(s("pixel")?.done).toBe(true);
    expect(p.done).toBe(before + 2);
    expect(p.next?.key).toBe("unlock");
  });

  it("a step locked to another plan never holds Up next, but stays listed with its lock", async () => {
    const { ws, user } = await makeWorkspace(); // the $9 Member plan: no automations
    const db = await getDb();
    const gen = (kind: "launch_kit" | "ad_research" | "ad_studio" | "ad_review") => db.insert(aiGenerations).values({ workspaceId: ws.id, kind, model: "rules" });
    // Every to-do up to "Create your first Unlock" done.
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
    // ...then "Add email 4", walking past the locked follow-ups beside it.
    expect((await computePath(ws, user.id)).next?.key).toBe("email4");

    // On the Growth plan the step isn't locked, but it stays optional, so it still never holds Up next.
    const growth = await computePath({ ...ws, plan: "growth" }, user.id);
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
    expect(await step("email4")).toMatchObject({ title: "Add email 4", lesson: "6.1", href: `/app/w/${ws.id}/emails`, done: true });
  });

  it("gives Launch Week its own stage badge, so it never reads as Level 2", async () => {
    const { ws, user } = await makeWorkspace();
    const p = await computePath(ws, user.id);
    expect(Object.fromEntries(p.stages.map((s) => [s.key, stageBadge(s)]))).toEqual({
      start: { num: "1" },
      ads: { num: "1" },
      launch: { icon: "calendar" },
      day8: { num: "8" },
      level2: { num: "2" },
      talk: { icon: "flag" },
      rhythm: { icon: "flag" },
      upper: { icon: "flag" }, // "Season 2" must never show as a 2
      second: { icon: "flag" },
    });
    // Any other range ("Weeks 2–3") would never show its first number either.
    expect(stageBadge({ key: "x", tag: "Weeks 2–3" })).toEqual({ icon: "calendar" });
  });
});
