import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, workspaces } from "@/lib/db/schema";
import { adReviewInputSchema, reviewMode, ruleReview, runAdReview, type AdReviewContext, type SkoolLinkCounts } from "@/server/ai/adReview";
import { isAdSource, saveCheckin } from "@/server/growth";
import { makeWorkspace } from "./helpers";

// Day 7 (lesson 2.6): ads point straight at the Skool link, so "Leads: 0 is fine". Each ad gets
// Keep / Fix: Hook / Fix: Door / Fix: About page / Kill / Too early, in the course's order.
const ad = (raw: Record<string, unknown>) => adReviewInputSchema.parse({ adName: "S1 Notes app", leads: "", ...raw });
// A healthy ad: 6 days, $12, 2,400 impressions, 36 clicks (1.5% CTR, $0.33 a click).
const healthy = { spend: 12, impressions: 2400, linkClicks: 36, days: 6 };
const counted = (c: Partial<SkoolLinkCounts> = {}): AdReviewContext => ({ link: { ready: true, adVisits: 30, days: 7, totalSpend: 12, ads: 1, ...c } });

describe("Ad review: Skool-link mode", () => {
  it("turns on when leads are 0 or blank, or when the ad points at the Skool link", () => {
    expect(reviewMode(ad({ ...healthy }))).toBe("skool");
    expect(reviewMode(ad({ ...healthy, destination: "optin", leads: "0" }))).toBe("skool");
    expect(reviewMode(ad({ ...healthy, destination: "skool", leads: "4" }))).toBe("skool");
    expect(reviewMode(ad({ ...healthy, destination: "optin", leads: "4" }))).toBe("funnel");
    // The choice defaults to the Skool link.
    expect(ad({ ...healthy }).destination).toBe("skool");
    // Leads 0 never gives the funnel's opt-in or cost-per-lead "fix".
    const r = ruleReview(ad({ ...healthy, members: "2" }), counted());
    expect(r.metrics.map((m) => m.name).join(" ")).not.toMatch(/opt-in|per lead/i);
    expect(r.call).toBe("keep");
  });

  it("Keep: steady visits at a cost you like, fed about 20% more", () => {
    const r = ruleReview(ad({ ...healthy, members: "2" }), { ...counted(), budgetPerDay: 10 });
    expect(r).toMatchObject({ mode: "skool", call: "keep", verdict: "Keep", budget: { now: 10, next: 12 }, nextBudgetUsdPerDay: 12 });
    expect(r.why).toMatch(/feed it slowly/);
    expect(r.actions[0].title).toBe("Keep it");
    expect(r.actions[1].detail).toContain("$10.00 → $12.00");
  });

  it("Too early: under 72 hours, hands off", () => {
    const r = ruleReview(ad({ ...healthy, days: 2 }), counted());
    expect(r).toMatchObject({ call: "too_early", verdict: "Too early" });
    expect(r.why).toMatch(/72 hours/);
    expect(r.metrics.find((m) => m.name === "Link click-through")?.status).toBe("wait");
  });

  it("Too early: Meta barely spent on it, so leave it on", () => {
    for (const raw of [
      { spend: 3, impressions: 600, linkClicks: 4, days: 6 }, // under 1,000 impressions
      { spend: 4, impressions: 1200, linkClicks: 5, days: 6 }, // under $5 and under 10 clicks
    ]) {
      const r = ruleReview(ad(raw), counted());
      expect(r.call, JSON.stringify(raw)).toBe("too_early");
      expect(r.why).toMatch(/barely spent on it.*leave it on/);
      expect(r.actions[0].title).toBe("Leave it on");
    }
    // Cheap but busy is not "barely spent": $3 for 2,000 impressions and 25 clicks gets judged.
    expect(ruleReview(ad({ spend: 3, impressions: 2000, linkClicks: 25, days: 6, members: "1" }), counted()).call).toBe("keep");
  });

  it("Fix: Hook: few clicks (low CTR) or dear ones, new on-image text and first line, same picture", () => {
    const low = ruleReview(ad({ spend: 15, impressions: 5000, linkClicks: 20, days: 6 }), counted()); // 0.4%
    expect(low).toMatchObject({ call: "fix_hook", verdict: "Fix: Hook" });
    expect(low.why).toMatch(/^Only 0\.40% of people who saw it clicked, so give it new on-image text and a new first line, same picture\.$/);
    const dear = ruleReview(ad({ spend: 75, impressions: 3000, linkClicks: 30, days: 6 }), counted()); // $2.50 a click
    expect(dear.call).toBe("fix_hook");
    expect(dear.why).toMatch(/\$2\.50/);
    // The first "no" picks the room: no clicks beats a broken Door.
    expect(ruleReview(ad({ spend: 15, impressions: 5000, linkClicks: 20, days: 6 }), counted({ ready: false })).call).toBe("fix_hook");
  });

  it("Fix: Door: clicks but the Skool link counted no ad visits, or has nowhere to go", () => {
    const r = ruleReview(ad({ ...healthy }), counted({ adVisits: 0 }));
    expect(r).toMatchObject({ call: "fix_door", verdict: "Fix: Door" });
    expect(r.why).toBe("Meta counted 36 link clicks but your Skool link counted no ad visits, so this ad's Website URL must be your Skool link.");
    expect(r.metrics.find((m) => m.name === "Skool link counted")).toMatchObject({ value: "0 ad visits", status: "fix" });
    const notReady = ruleReview(ad({ ...healthy }), counted({ ready: false, adVisits: 0 }));
    expect(notReady.call).toBe("fix_door");
    expect(notReady.actions[0].title).toBe("Add your Skool group link");
    // 20 clicks or fewer is too few to blame the Door.
    expect(ruleReview(ad({ spend: 6, impressions: 1500, linkClicks: 18, days: 6 }), counted({ adVisits: 0 })).call).toBe("keep");
  });

  it("Fix: About page: visits but no joins, fix the shopfront, not the ad", () => {
    const r = ruleReview(ad({ ...healthy, members: "0" }), counted({ adVisits: 34 }));
    expect(r).toMatchObject({ call: "fix_about", verdict: "Fix: About page" });
    expect(r.why).toBe("Your ads sent 34 people to your About page and nobody joined, so fix the shopfront, not the ad.");
    // Blank joins means "not sure": the About page isn't judged, and the plan asks for them next time.
    const blank = ruleReview(ad({ ...healthy, members: "" }), counted({ adVisits: 34 }));
    expect(blank.call).toBe("keep");
    expect(blank.actions.at(-1)?.title).toBe("Add your joins next time");
  });

  it("Kill: fixed twice and still the worst", () => {
    const r = ruleReview(ad({ spend: 15, impressions: 5000, linkClicks: 20, days: 6, fixes: "2" }), counted());
    expect(r).toMatchObject({ call: "kill", verdict: "Kill" });
    expect(r.why).toMatch(/^You've fixed it twice.*switch it off/);
    expect(r.actions[1].detail).toContain("Make my 5 statics");
    // Fixed once: still a fix. And a Door or About-page problem is never the ad's fault, so never a kill.
    expect(ruleReview(ad({ spend: 15, impressions: 5000, linkClicks: 20, days: 6, fixes: "1" }), counted()).call).toBe("fix_hook");
    expect(ruleReview(ad({ ...healthy, fixes: "2" }), counted({ adVisits: 0 })).call).toBe("fix_door");
  });

  it("labels its benchmarks rules of thumb and adds no new ones", () => {
    const r = ruleReview(ad({ ...healthy, members: "1" }), counted());
    for (const name of ["Link click-through", "Cost per click = cost per About-page visit"]) {
      expect(r.metrics.find((m) => m.name === name)?.note, name).toMatch(/Rule of thumb/);
    }
    expect(ruleReview(ad({ ...healthy, destination: "optin", leads: "5" })).metrics.every((m) => /Rule of thumb|Lower is better/.test(m.note))).toBe(true);
  });

  it("keeps the funnel review for ads that point at an opt-in page", () => {
    const r = ruleReview(ad({ spend: 30, impressions: 5000, linkClicks: 30, leads: "8", destination: "optin" }));
    expect(r.mode).toBe("funnel");
    expect(r.metrics.map((m) => m.name)).toContain("Page opt-in rate");
    expect(r.metrics[0].status).toBe("fix"); // 0.6% CTR
  });

  it("counts ad visits from ad sources only", () => {
    for (const s of ["meta-ad", "meta", "ads", "ad", "fb-ad", "s1-ad", "ad1", "facebook", "instagram", "paid"]) expect(isAdSource(s), s).toBe(true);
    for (const s of ["direct", "youtube", "tiktok", "lead", "head", "adam", "pain", "skool.com"]) expect(isAdSource(s), s).toBe(false);
  });
});

describe("Ad review, saved: what the Skool link counted", () => {
  it("shows the ad visits counted and cost per visit = total spend ÷ counted visits", async () => {
    const { ws } = await makeWorkspace();
    const db = await getDb();
    const visit = (source: string) => db.insert(activities).values({ workspaceId: ws.id, type: "skool_visit", data: { source } });
    for (const s of ["meta-ad", "meta-ad", "meta-ad", "ads", "ads", "youtube", "direct"]) await visit(s);
    await saveCheckin(ws.id, { aboutVisitors: 40, adSpendPerDay: 5 });

    const s1 = await runAdReview(ws.id, { adName: "S1 Notes app", spend: "4", impressions: "1200", linkClicks: "25", leads: "", days: "6", destination: "skool" });
    if (!s1.ok) throw new Error(s1.error);
    expect(s1.review).toMatchObject({ mode: "skool", call: "keep", adName: "S1 Notes app", counted: { ready: true, adVisits: 5, totalSpend: 4, ads: 1, costPerVisit: 0.8 } });
    expect(s1.review.metrics.find((m) => m.name === "Skool link counted")?.value).toBe("5 ad visits");
    expect(s1.review.metrics.find((m) => m.name === "Cost per visit, all ads")?.value).toBe("$0.80");
    expect(s1.review.budget).toEqual({ now: 5, next: 6 });

    // A second ad adds its spend; reviewing S1 again replaces S1's, so the week's total stays honest.
    const s2 = await runAdReview(ws.id, { adName: "S2 Checklist", spend: "6", impressions: "1500", linkClicks: "12", days: "6" });
    if (!s2.ok) throw new Error(s2.error);
    expect(s2.review.counted).toMatchObject({ totalSpend: 10, ads: 2, costPerVisit: 2 });
    const again = await runAdReview(ws.id, { adName: "s1 notes app", spend: "5", impressions: "1300", linkClicks: "27", days: "7" });
    if (!again.ok) throw new Error(again.error);
    expect(again.review.counted).toMatchObject({ totalSpend: 11, ads: 2 });
  });

  it("says Fix: Door when Meta counted clicks but the Skool link counted none", async () => {
    const { ws } = await makeWorkspace();
    const r = await runAdReview(ws.id, { adName: "S3", spend: "9", impressions: "2000", linkClicks: "30", leads: "0", days: "5" });
    if (!r.ok) throw new Error(r.error);
    expect(r.review).toMatchObject({ call: "fix_door", verdict: "Fix: Door", counted: { adVisits: 0, costPerVisit: null } });

    // No Skool group link saved: the Skool link has nowhere to go.
    const db = await getDb();
    await db.update(workspaces).set({ settings: { ...ws.settings, skoolUrl: "" } }).where(eq(workspaces.id, ws.id));
    const lost = await runAdReview(ws.id, { spend: "9", impressions: "2000", linkClicks: "30", days: "5" });
    if (!lost.ok) throw new Error(lost.error);
    expect(lost.review).toMatchObject({ call: "fix_door", counted: { ready: false } });
  });
});
