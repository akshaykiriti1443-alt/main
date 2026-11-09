import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, aiGenerations, contacts, sites, workspaces } from "@/lib/db/schema";
import { parseCsvRows, toCsv } from "@/lib/csv";
import { canBeUpNext } from "@/lib/guides";
import { CANCEL_ROUTE, IF_YOU_CANCEL } from "@/lib/leaving";
import { firstEightDayMembers } from "@/server/admin";
import { runAdReview } from "@/server/ai/adReview";
import { buildPrompt, fallbackKit } from "@/server/ai/launchKit";
import { fallbackReply } from "@/server/ai/replies";
import { DEFAULT_SEQUENCE } from "@/server/defaults";
import { leadsCsv } from "@/server/contacts";
import { saveCheckin } from "@/server/growth";
import { buildShelf, computePath } from "@/server/path";
import { makeWorkspace } from "./helpers";

// The free week. The app can't see a Skool trial, a charge or a cancel, so it may only say what's
// true whichever way those went. Lesson numbers and days match the course.

const DAY = 86_400_000;
const onDay = <T extends { createdAt: Date }>(ws: T, n: number) => ({ ...ws, createdAt: new Date(Date.now() - (n - 0.5) * DAY) });
const source = (file: string) => readFileSync(path.join(process.cwd(), "src", file), "utf8");
const NO_PRESSURE = /\b(hurry|last chance|don't miss|you'd lose|you will lose|act now|lock it in|goes up soon)\b|\d+ days? left|\bcountdown\b/i;

async function finishDay1(workspaceId: string) {
  const db = await getDb();
  for (const kind of ["launch_kit", "ad_research", "ad_studio"] as const) await db.insert(aiGenerations).values({ workspaceId, kind, model: "rules" });
  await db.insert(sites).values({ workspaceId, name: "Funnel", slug: `funnel-trial-${workspaceId}`, theme: {} as never, published: true });
  await db.insert(activities).values({ workspaceId, type: "lead", data: {} });
}

describe("lessons Skool hasn't opened can't be Up next", () => {
  const stepsOn = async (n: number) => {
    const { ws, user } = await makeWorkspace();
    await finishDay1(ws.id);
    await (await getDb()).insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "meta-ad" } });
    await saveCheckin(ws.id, { aboutVisitors: 30, newPaid: 0, networkSignups: 0, linkInBio: false, skoolLevel: 1 });
    await (await getDb()).insert(aiGenerations).values({ workspaceId: ws.id, kind: "ad_review", model: "rules" });
    const p = await computePath(onDay(ws, n), user.id);
    return { p, step: (k: string) => p.stages.flatMap((s) => s.steps).find((s) => s.key === k) };
  };

  it("Day 8 points at the Teardown Room, never at lesson 5.2", async () => {
    const { p, step } = await stepsOn(8);
    expect(p.today?.lesson).toBe("3.1");
    expect(step("unlock")).toMatchObject({ locked: "Opens Day 12", done: false });
    expect(step("email4")?.locked).toBe("Opens Day 15");
    expect(step("weeks")?.locked).toBe("Opens Day 15");
    expect(step("bio")?.locked).toBe("Opens Day 18");
    expect(p.next).toBeNull();
    expect(canBeUpNext(step("unlock")!)).toBe(false);
  });

  it("opens each one on the course's own day", async () => {
    expect((await stepsOn(11)).step("unlock")?.locked).toBe("Opens Day 12");
    const twelve = await stepsOn(12);
    expect(twelve.step("unlock")?.locked).toBeUndefined();
    expect(twelve.p.next?.key).toBe("unlock");
  });

  it("still ticks a locked step when someone does it early", async () => {
    const { ws, user } = await makeWorkspace();
    await saveCheckin(ws.id, { aboutVisitors: 30, newPaid: 0, networkSignups: 0, linkInBio: true, skoolLevel: 1 });
    const p = await computePath(onDay(ws, 8), user.id);
    expect(p.stages.flatMap((s) => s.steps).find((s) => s.key === "bio")).toMatchObject({ done: true, locked: "Opens Day 18" });
  });
});

describe("Your shelf, Days 6 to 8", () => {
  const blank = { kit: false, funnel: false, research: false, statics: false, adClicks: 0, verdicts: 0, aboutVisitors: null };

  it("only shows up on Days 6 to 8", async () => {
    const { ws, user } = await makeWorkspace();
    expect((await computePath(onDay(ws, 5), user.id)).shelf).toBeNull();
    for (const d of [6, 7, 8]) expect((await computePath(onDay(ws, d), user.id)).shelf, `Day ${d}`).not.toBeNull();
    expect((await computePath(onDay(ws, 9), user.id)).shelf).toBeNull();
  });

  it("reads real data: an ad click counts, your own test click doesn't", async () => {
    const { ws, user } = await makeWorkspace();
    await finishDay1(ws.id);
    const db = await getDb();
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "direct" } });
    const before = await computePath(onDay(ws, 7), user.id);
    expect(before.shelf?.items.find((x) => x.key === "clicks")).toMatchObject({ have: false, note: "0 so far. Meta may still be warming up" });
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "meta-ad" } });
    const after = await computePath(onDay(ws, 7), user.id);
    expect(after.shelf?.items.find((x) => x.key === "clicks")).toMatchObject({ have: true, note: "1" });
    expect(after.shelf?.items.find((x) => x.key === "kit")).toMatchObject({ have: true, note: "Built" });
  });

  it("says written, not live, and labels what the member typed", () => {
    const shelf = buildShelf({ ...blank, statics: true, verdicts: 3, aboutVisitors: 22 });
    expect(shelf.items.find((x) => x.key === "statics")?.note).toBe("Written. The app can't see if they went live");
    expect(shelf.items.find((x) => x.key === "verdicts")?.note).toBe("3, from the numbers you typed");
    expect(shelf.items.find((x) => x.key === "checkin")?.note).toBe("22 About-page visitors, you typed this");
    expect(shelf.empty).toBe(false);
  });

  it("has a kind zero state and mentions nothing it can't see", () => {
    const shelf = buildShelf(blank);
    expect(shelf.empty).toBe(true);
    for (const item of shelf.items) {
      expect(`${item.label} ${item.note}`, item.key).not.toMatch(/\blikes?\b|like level|Growth Level|lesson|streak|buddy|posted|Win #|—/i);
      expect(item.note, item.key).not.toMatch(NO_PRESSURE);
    }
  });
});

describe("Ad review's optional total", () => {
  it("uses Ads Manager's total when typed, and pools the reviewed ads when blank", async () => {
    const { ws } = await makeWorkspace();
    const db = await getDb();
    for (const s of ["meta-ad", "meta-ad", "meta-ad", "meta-ad"]) await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: s } });
    const pooled = await runAdReview(ws.id, { adName: "S1", spend: "4", impressions: "1200", linkClicks: "25", leads: "", days: "6", destination: "skool" });
    if (!pooled.ok) throw new Error(pooled.error);
    expect(pooled.review.counted).toMatchObject({ totalSpend: 4, costPerVisit: 1, spendTyped: false });

    const typed = await runAdReview(ws.id, { adName: "S2", spend: "4", impressions: "1200", linkClicks: "25", leads: "", days: "6", destination: "skool", totalSpent: "10" });
    if (!typed.ok) throw new Error(typed.error);
    expect(typed.review.counted).toMatchObject({ totalSpend: 10, costPerVisit: 2.5, spendTyped: true });
    expect(typed.review.metrics.find((m) => m.name === "Cost per visit, all ads")?.note).toBe("The $10.00 you typed ÷ 4 ad visits counted.");
  });
});

describe("Leads CSV", () => {
  it("quotes what needs it and stays readable by our own importer", () => {
    const text = toCsv([["Name", "Note"], ['Sam "the man"', "line one\nline two, more"]]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(parseCsvRows(text)).toEqual([["Name", "Note"], ['Sam "the man"', "line one\nline two, more"]]);
  });

  it("defuses a formula typed into a sign-up form, and leaves a phone number alone", () => {
    const text = toCsv([["=HYPERLINK(1)", "+44 7700 900123", "@cmd", "-5", "plain"]]);
    expect(parseCsvRows(text)).toEqual([["'=HYPERLINK(1)", "+44 7700 900123", "'@cmd", "-5", "plain"]]);
  });

  it("downloads every lead in this workspace and nobody else's", async () => {
    const { ws } = await makeWorkspace();
    const other = await makeWorkspace();
    const db = await getDb();
    await db.insert(contacts).values({ workspaceId: ws.id, email: "jo@example.com", firstName: "Jo", lastName: "Lee", phone: "+15551234567", tags: ["warm", "dad"], unsubscribed: true });
    await db.insert(contacts).values({ workspaceId: other.ws.id, email: "not-yours@example.com", firstName: "Nope" });
    const rows = parseCsvRows(await leadsCsv(ws.id));
    expect(rows[0].slice(0, 4)).toEqual(["First name", "Last name", "Email", "Phone"]);
    expect(rows.length).toBe(2);
    expect(rows[1].slice(0, 4)).toEqual(["Jo", "Lee", "jo@example.com", "+15551234567"]);
    expect(rows[1][7]).toBe("warm; dad");
    expect(rows[1][8]).toBe("yes");
    expect(JSON.stringify(rows)).not.toContain("not-yours");
  });
});

describe("Admin: In their first 8 days", () => {
  it("lists members up to their Day 8 with real ticks", async () => {
    const { ws } = await makeWorkspace();
    const older = await makeWorkspace();
    const db = await getDb();
    await db.update(workspaces).set({ createdAt: new Date(Date.now() - 2.5 * DAY) }).where(eq(workspaces.id, ws.id));
    await db.update(workspaces).set({ createdAt: new Date(Date.now() - 9 * DAY) }).where(eq(workspaces.id, older.ws.id));
    await db.insert(aiGenerations).values({ workspaceId: ws.id, kind: "launch_kit", model: "rules" });
    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "direct" } });

    const list = await firstEightDayMembers();
    const row = list.find((m) => m.id === ws.id);
    expect(row).toMatchObject({ day: 3, kit: true, statics: false, funnel: false, checkin: false, adClick: false });
    expect(list.some((m) => m.id === older.ws.id)).toBe(false);

    await db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source: "meta-ad" } });
    expect((await firstEightDayMembers()).find((m) => m.id === ws.id)?.adClick).toBe(true);
  });
});

describe("honest about money, across the app", () => {
  it("the If you cancel words match the course and press nobody", () => {
    expect(CANCEL_ROUTE).toContain("Manage membership");
    expect(IF_YOU_CANCEL.how).toContain("Press cancel, not leave");
    expect(IF_YOU_CANCEL.app).toContain("at least a week");
    expect(IF_YOU_CANCEL.bill).toContain("the app can't see");
    for (const [k, v] of Object.entries(IF_YOU_CANCEL)) {
      expect(v, k).not.toMatch(NO_PRESSURE);
      expect(v, k).not.toMatch(/—/);
    }
  });

  it("the welcome banner doesn't run a clock on someone who just joined", () => {
    const layout = source("app/app/w/[wid]/layout.tsx");
    expect(layout).not.toContain("Your free days end");
    expect(layout).toContain("Your app is on while we match you to your Skool membership.");
    expect(layout).toContain("Join here");
  });

  it("the sales page states the bill plainly, with the real seat count only", () => {
    const page = source("app/skool/page.tsx");
    expect(page).toContain("Skool bills you automatically unless you cancel");
    expect(page).toContain("What happens when the free week ends?");
    expect(page).toContain("IF_YOU_CANCEL.how");
    expect(page).toContain("first 100 founding members");
    expect(page).not.toMatch(NO_PRESSURE);
    expect(page).toContain("Count your shelf, do one sum");
    expect(page).not.toContain("a verdict on every ad");
  });

  describe("a free trial on a member's own group is optional (lesson 1.2)", () => {
    const CLAIMS_TRIAL = /free trial|free days|7 free|try it free|free for \d|cancel before/i;
    const input = { businessName: "Fit Dads", ownerName: "Sam Owner", niche: "fitness for dads", audience: "busy dads", outcome: "lose the dad belly", leadMagnetIdea: "", offer: "", skoolUrl: "", tone: "friendly" as const, brandColor: "#2A44EE" };

    it("a blank offer tells the AI nothing about a trial", () => {
      const prompt = buildPrompt(input);
      expect(prompt).not.toContain("7-day free trial");
      expect(prompt).toContain("(a paid Skool membership, no details given)");
      expect(prompt).toContain("only if the offer line above states it");
    });

    it("the offer a member typed goes to the AI in their words", () => {
      expect(buildPrompt({ ...input, offer: "$19/month with a 3-day free trial" })).toContain("Offer inside the Skool group: $19/month with a 3-day free trial");
    });

    it("the template kit, the starter emails and the reply draft claim no trial", () => {
      const kit = fallbackKit(input);
      expect(kit.skoolAboutPage).not.toMatch(CLAIMS_TRIAL);
      for (const e of [...kit.emails, ...DEFAULT_SEQUENCE.steps]) expect(`${e.subject} ${e.body}`, e.subject).not.toMatch(CLAIMS_TRIAL);
      expect(fallbackReply({ firstName: "Jo", businessName: "Fit Dads", skoolUrl: "https://www.skool.com/x", lastInbound: "how much is it?" })).not.toMatch(CLAIMS_TRIAL);
    });

    it("the template About page keeps an offer the member typed", () => {
      expect(fallbackKit({ ...input, offer: "$19/month with a 3-day free trial" }).skoolAboutPage).toContain("$19/month with a 3-day free trial");
    });

    it("the reply and scoring prompts only state a trial from the member's own offer", () => {
      for (const file of ["server/ai/replies.ts", "server/ai/scoring.ts"]) expect(source(file), file).not.toMatch(/start the free trial|with a free trial/);
    });
  });

  it("the default follow-up email sets no deadline nobody set", () => {
    expect(source("server/defaults.ts")).not.toMatch(NO_PRESSURE);
  });
});
