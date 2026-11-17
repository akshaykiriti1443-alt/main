import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, workspaces } from "@/lib/db/schema";
import { adReviewInputSchema, adTotals, doNextNote, reviewMode, ruleReview, runAdReview, spendFrom, twoSums, type AdReviewContext, type SkoolLinkCounts } from "@/server/ai/adReview";
import { isAdSource, saveCheckin } from "@/server/growth";
import { makeWorkspace } from "./helpers";

// Day 6. A Skool-link ad has no leads to count, so "Leads: 0 is fine" there. Each ad gets
// Keep / Fix: Hook / Fix: Door / Fix: About page / Kill / Too early, in the course's order.
const ad = (raw: Record<string, unknown>) => adReviewInputSchema.parse({ adName: "S1 Notes app", leads: "", ...raw });
// A healthy ad: 6 days, $12, 2,400 impressions, 36 clicks (1.5% CTR, $0.33 a click).
const healthy = { spend: 12, impressions: 2400, linkClicks: 36, days: 6 };
const counted = (c: Partial<SkoolLinkCounts> = {}): AdReviewContext => ({ link: { ready: true, adVisits: 30, days: 7, totalSpend: 12, ads: 1, ...c } });

describe("Ad review: Skool-link mode", () => {
  it("turns on for an ad pointed at the Skool link, whatever the leads say", () => {
    expect(reviewMode(ad({ ...healthy }))).toBe("skool");
    expect(reviewMode(ad({ ...healthy, destination: "optin", leads: "0" }))).toBe("funnel");
    expect(reviewMode(ad({ ...healthy, destination: "skool", leads: "4" }))).toBe("skool");
    expect(reviewMode(ad({ ...healthy, destination: "optin", leads: "4" }))).toBe("funnel");
    // The choice defaults to the Skool link.
    expect(ad({ ...healthy }).destination).toBe("skool");
    // A Skool-link ad never gets the funnel's opt-in or cost-per-lead "fix".
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

  it("Too early: Meta barely spent on it, so leave it running, said as the normal answer it is", () => {
    for (const raw of [
      { spend: 3, impressions: 600, linkClicks: 4, days: 6 }, // under 1,000 impressions
      { spend: 4, impressions: 1200, linkClicks: 5, days: 6 }, // under $5 and under 10 clicks
    ]) {
      const r = ruleReview(ad(raw), counted());
      expect(r.call, JSON.stringify(raw)).toBe("too_early");
      expect(r.why).toMatch(/^Too early to tell: .*hasn't lost\. Leave it running\. In week one, that's the usual answer\.$/);
      expect(r.actions.map((a) => a.title)).toEqual(["Leave it running", "Look again in a week"]);
    }
    expect(ruleReview(ad({ spend: 3, impressions: 600, linkClicks: 4, days: 6 }), counted()).why).toContain("shown it 600 times and spent $3.00");
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

  it("Fix: About page: 100 or more visits and no joins, fix the shopfront, not the ad", () => {
    const r = ruleReview(ad({ ...healthy, members: "0" }), counted({ adVisits: 120 }));
    expect(r).toMatchObject({ call: "fix_about", verdict: "Fix: About page" });
    expect(r.why).toBe("Your ads sent 120 people to your About page and nobody joined, so fix the shopfront, not the ad.");
    expect(ruleReview(ad({ ...healthy, members: "0" }), counted({ adVisits: 100 })).call).toBe("fix_about");
    // Blank joins means "not sure": the About page isn't judged, and the plan asks for them next time.
    const blank = ruleReview(ad({ ...healthy, members: "" }), counted({ adVisits: 120 }));
    expect(blank.call).toBe("keep");
    expect(blank.actions.at(-1)?.title).toBe("Add your joins next time");
  });

  it("doesn't judge an About page on a first week's handful of visits", () => {
    const r = ruleReview(ad({ ...healthy, members: "0" }), counted({ adVisits: 34 }));
    expect(r.call).toBe("keep");
    expect(r.metrics.find((m) => m.name === "New members")?.status).not.toBe("fix");
    expect(ruleReview(ad({ ...healthy, members: "0" }), counted({ adVisits: 99 })).call).toBe("keep");
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

  it("gives opt-in ads the same Day 6 verdicts, and never tells them to use the Skool link", () => {
    const optin = (raw: Record<string, unknown>) => ruleReview(ad({ destination: "optin", days: 5, ...raw }));
    expect(optin({ spend: 3, impressions: 600, linkClicks: 4 })).toMatchObject({ mode: "funnel", call: "too_early", verdict: "Too early" });
    expect(optin({ spend: 12, impressions: 2400, linkClicks: 36, leads: "6" })).toMatchObject({ call: "keep", verdict: "Keep" });
    expect(optin({ spend: 15, impressions: 5000, linkClicks: 20 })).toMatchObject({ call: "fix_hook" });
    expect(optin({ spend: 15, impressions: 5000, linkClicks: 20, fixes: "2" })).toMatchObject({ call: "kill", verdict: "Kill" });
    // Clicks and no sign-ups: the page, and 0 leads doesn't turn it into a Skool-link review.
    const page = optin({ spend: 12, impressions: 2400, linkClicks: 36, leads: "0" });
    expect(page).toMatchObject({ mode: "funnel", call: "fix_door" });
    expect(page.why).toMatch(/headline/);
    expect(JSON.stringify(page)).not.toMatch(/Skool link/);
  });

  it("reads a blank Leads box as not known, never as 0 sign-ups", () => {
    expect(ad({ ...healthy }).leads).toBeUndefined();
    expect(ad({ ...healthy, leads: "0" }).leads).toBe(0);
    // The same busy website ad: blank leads keeps it (the page isn't judged), 0 leads says fix the page.
    const blank = ruleReview(ad({ ...healthy, destination: "optin" }));
    expect(blank).toMatchObject({ mode: "funnel", call: "keep" });
    expect(blank.metrics.find((m) => m.name === "Page opt-in rate")).toMatchObject({ value: "not given", status: "wait" });
    expect(blank.metrics.find((m) => m.name === "Cost per lead")).toMatchObject({ value: "not given", status: "wait" });
    expect(blank.actions.map((a) => a.title)).toContain("Add its leads next time");
    expect(ruleReview(ad({ ...healthy, destination: "optin", leads: "0" })).call).toBe("fix_door");
    expect(ruleReview(ad({ ...healthy, destination: "optin", leads: "9" })).actions.map((a) => a.title)).not.toContain("Add its leads next time");
  });

  it("week one is hands-off: the page says change nothing today, and Too early is a good answer", () => {
    const page = readFileSync(path.join(process.cwd(), "src/app/app/w/[wid]/ads/page.tsx"), "utf8");
    expect(page).toContain('lesson="Day 6"');
    expect(page).toContain("Week one: change nothing today. Too early means leave it running, and a Fix or a Keep goes on next week's list.");
    expect(page).toContain("Too early to tell, leave it running. A normal answer, not a bad one.");
    // The three numbers, and where they live, in words.
    for (const words of ["Impressions", "Link clicks", "Amount spent", "Maximum", "Performance and clicks"]) expect(page).toContain(words);
    // The website choice uses the same name as Ad studio.
    expect(page).toContain("My website");
    expect(page).not.toContain("An opt-in page");
    for (const text of [page, readFileSync(path.join(process.cwd(), "src/server/ai/adReview.ts"), "utf8")]) {
      expect(text).not.toMatch(/Day 7|Day 9|your alarm|alarm rings|lesson \d\.\d|next Monday/);
    }
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

    // A broken link is setup, not an ad change: it's fixed today, even in week one.
    for (const review of [r.review, lost.review]) {
      const note = doNextNote(review, true);
      expect(note).toMatch(/^This one is a setup fix, not an ad change\. Do it today/);
      expect(note).not.toMatch(/change nothing/i);
      expect(doNextNote(review, false)).toBe(note);
    }
    expect(doNextNote(r.review, true)).toContain("Website URL");
    expect(doNextNote(lost.review, true)).toContain("Settings");
  });
});

describe("Ad review: the week-one note above Do this next", () => {
  const verdict = (raw: Record<string, unknown>) => ruleReview(ad(raw), counted());
  it("holds every ad change till next week, and says nothing after week one", () => {
    const hook = verdict({ spend: 12, impressions: 2400, linkClicks: 10, days: 6 });
    expect(hook.call).toBe("fix_hook");
    expect(doNextNote(hook, true)).toBe("This is next week's list. Today, change nothing.");
    expect(doNextNote(hook, false)).toBeNull();
    expect(doNextNote(verdict({ ...healthy, members: "2" }), true)).toBe("This is next week's list. Today, change nothing.");
    const kill = verdict({ spend: 12, impressions: 2400, linkClicks: 10, days: 6, fixes: "2" });
    expect(kill.call).toBe("kill");
    expect(doNextNote(kill, true)).toBe("Switching it off is your call. Change nothing else today.");
    expect(doNextNote(verdict({ ...healthy, days: 2 }), true)).toBeNull();
    // An opt-in page's Fix: Door is the page's headline, an ordinary fix that waits like the rest.
    const page = ruleReview(ad({ ...healthy, destination: "optin", leads: "0" }));
    expect(page.call).toBe("fix_door");
    expect(doNextNote(page, true)).toBe("This is next week's list. Today, change nothing.");
  });
});

describe("Ad review: your two prices", () => {
  it("reads a typed total, and leaves an empty or odd box out", () => {
    expect(spendFrom("50")).toBe(50);
    expect(spendFrom("$1,234.50")).toBe(1234.5);
    for (const raw of ["", "  ", undefined, null, "abc", "-3"]) expect(spendFrom(raw), String(raw)).toBeNull();
  });

  it("divides each campaign's spend by what the app counted, with no benchmark attached", () => {
    const both = twoSums({ webSpend: 50, skoolSpend: 20, adLeads: 4, adVisits: 18 });
    expect(both.lead).toMatchObject({ spend: 50, count: 4, cost: 12.5, line: "Website ads: $50.00 spent ÷ 4 leads = $12.50 a lead" });
    expect(both.visit).toMatchObject({ spend: 20, count: 18, cost: 1.11, line: "Skool ads: $20.00 spent ÷ 18 ad visits = $1.11 a visit" });
    expect(both.post).toBe(`${both.lead?.line}\n${both.visit?.line}`);
    expect(JSON.stringify(both)).not.toMatch(/good|bad|rule of thumb/i);

    // Zero is an answer: no dividing by it.
    const zero = twoSums({ webSpend: 35, skoolSpend: 15, adLeads: 0, adVisits: 0 });
    expect(zero.lead).toMatchObject({ cost: null, line: "Website ads: $35.00 spent, 0 leads so far" });
    expect(zero.visit).toMatchObject({ cost: null, line: "Skool ads: $15.00 spent, 0 ad visits so far" });

    // Only the campaigns they typed.
    const one = twoSums({ webSpend: null, skoolSpend: 12, adLeads: 3, adVisits: 1 });
    expect(one.lead).toBeNull();
    expect(one.post).toBe("Skool ads: $12.00 spent ÷ 1 ad visit = $12.00 a visit");
    expect(twoSums({ webSpend: null, skoolSpend: null, adLeads: 3, adVisits: 4 }).post).toBe("");
  });

  it("counts leads that came from a Meta ad and the Skool link's ad visits, nothing else", async () => {
    const { ws } = await makeWorkspace();
    const db = await getDb();
    await db.insert(activities).values([
      { workspaceId: ws.id, type: "lead", data: { utm: { fbclid: "abc" } } },
      { workspaceId: ws.id, type: "lead", data: { utm: {} } }, // their own test sign-up
      { workspaceId: ws.id, type: "lead", data: {} },
      { workspaceId: ws.id, type: "skool_visit", data: { source: "meta-ad" } },
      { workspaceId: ws.id, type: "skool_visit", data: { source: "ads" } },
      { workspaceId: ws.id, type: "skool_visit", data: { source: "text" } },
      // Older than 30 days still counts: the spend it's divided by is lifetime (date range Maximum).
      { workspaceId: ws.id, type: "skool_visit", data: { source: "meta-ad" }, createdAt: new Date(Date.now() - 60 * 86_400_000) },
      { workspaceId: ws.id, type: "lead", data: { utm: { fbclid: "old" } }, createdAt: new Date(Date.now() - 60 * 86_400_000) },
    ]);
    expect(await adTotals(ws.id)).toEqual({ adLeads: 2, adVisits: 3 });
  });

  it("the panel says 'No leads yet' instead of a price, and doesn't overclaim what it counts", () => {
    const page = readFileSync(path.join(process.cwd(), "src/app/app/w/[wid]/ads/page.tsx"), "utf8");
    expect(page).toContain('none="No leads yet"');
    expect(page).toContain('none="No visits yet"');
    expect(page).not.toContain('"0 so far"');
    expect(page).toContain("nearly always your ads");
    expect(page).not.toContain("only counts sign-ups that came in from a Meta ad");
    // Lifetime spend over lifetime visits: no 30-day window in the Skool sum.
    expect(page).not.toContain("visits from ads, last 30 days");
    expect(page).toContain("A broken link is the one thing to fix today.");
  });
});
