import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations, workspaces } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { chargeUsage } from "@/server/wallet";
import { listSites, publishSite } from "@/server/sites";
import { KIT_OUT_OF_RUNS, dealFor, kitWebsite, runLaunchKit, termsCheck } from "@/server/ai/launchKit";
import { STUDIO_NO_AI, STUDIO_NO_RUNS, adStudioDefaults, makeAdStudioPack, offerFor, studioOffers } from "@/server/ai/adStudio";
import { RESEARCH_NO_AI, RESEARCH_NO_RUNS, analyzeCompetitorAds, fallbackAnalysis } from "@/server/ai/adResearch";
import { aiRunsFor, aiRunsFrom, needsKey, runsLine } from "@/app/app/w/[wid]/ai/runs";
import { readDeal } from "@/app/app/w/[wid]/launch/deal";
import { makeWorkspace } from "./helpers";

const aiWas = env.aiEnabled;
afterEach(() => {
  env.aiEnabled = aiWas;
});

const kitAnswers = (over: Record<string, unknown> = {}) => ({
  businessName: "Fit Dads Club",
  ownerName: "Sam Owner",
  niche: "fat loss for busy dads",
  audience: "dads with desk jobs",
  outcome: "lose 10 lbs in 8 weeks",
  leadMagnetIdea: "The 7-Day Dad Reset",
  price: "$29",
  trialDays: 7,
  ...over,
});

/** Use up a starter account's included AI runs, the way three AI presses would. */
async function useAllRuns(workspaceId: string) {
  for (let i = 0; i < 3; i++) await chargeUsage(workspaceId, "ai_generation", 1, { description: "test" });
}

const JARGON = /server|platform owner|wallet|funds|generation|unlimited|ANTHROPIC|env/i;

describe("AI runs: the counter beside every AI button", () => {
  it("says which run this press is, and when a key is needed", () => {
    expect(aiRunsFrom({ provider: null, aiEnabled: true, included: 3, used: 1, canPay: false })).toEqual({ kind: "free", used: 1, total: 3, next: 2 });
    expect(runsLine({ kind: "free", used: 1, total: 3, next: 2 })).toBe("AI run 2 of 3 this month.");
    const out = aiRunsFrom({ provider: null, aiEnabled: true, included: 3, used: 3, canPay: false });
    expect(out).toEqual({ kind: "out", total: 3 });
    expect(needsKey(out)).toBe(true);
    expect(runsLine(out)).toBe("You've used your 3 free AI runs this month.");
    expect(aiRunsFrom({ provider: "gemini", aiEnabled: false, included: 3, used: 3, canPay: false })).toMatchObject({ kind: "own", label: "Google Gemini" });
    expect(runsLine(aiRunsFrom({ provider: "gemini", aiEnabled: true, included: 3, used: 9, canPay: false }))).toBe("Runs on your Google Gemini key.");
    expect(aiRunsFrom({ provider: null, aiEnabled: false, included: 3, used: 0, canPay: false }).kind).toBe("off");
    expect(aiRunsFrom({ provider: null, aiEnabled: true, included: 1e9, used: 50, canPay: false }).kind).toBe("unlimited");
    expect(aiRunsFrom({ provider: null, aiEnabled: true, included: 30, used: 30, canPay: true }).kind).toBe("paid");
    for (const kind of ["free", "out", "own", "off", "paid"] as const) {
      const r = aiRunsFrom({ provider: kind === "own" ? "gemini" : null, aiEnabled: kind !== "off", included: 3, used: kind === "free" ? 0 : 3, canPay: kind === "paid" });
      expect(runsLine(r)).not.toMatch(JARGON);
    }
  });

  it("counts the account's real runs this month, and stops counting once a key is saved", async () => {
    env.aiEnabled = true;
    const { ws } = await makeWorkspace();
    expect(await aiRunsFor(ws)).toEqual({ kind: "free", used: 0, total: 3, next: 1 });
    await chargeUsage(ws.id, "ai_generation", 1, { description: "test" });
    expect(await aiRunsFor(ws)).toMatchObject({ kind: "free", next: 2 });
    await chargeUsage(ws.id, "ai_generation", 2, { description: "test" });
    expect(await aiRunsFor(ws)).toEqual({ kind: "out", total: 3 });

    const db = await getDb();
    await db.update(workspaces).set({ settings: { ...ws.settings, aiProvider: "gemini", aiKeyEnc: encrypt("AIza-test"), aiKeyHint: "…test" } }).where(eq(workspaces.id, ws.id));
    expect(await aiRunsFor(ws)).toMatchObject({ kind: "own", provider: "gemini" });
  });
});

describe("AI launch kit: price and trial are required, and the thank-you page states them", () => {
  it("reads the price and trial boxes, and refuses a kit without them", () => {
    expect(readDeal("29", "7")).toEqual({ ok: true, price: "$29", trialDays: 7 });
    expect(readDeal("$29/month", "0")).toEqual({ ok: true, price: "$29", trialDays: 0 });
    expect(readDeal("£19 a month", "14")).toEqual({ ok: true, price: "£19", trialDays: 14 });
    expect(readDeal("", "7").ok).toBe(false);
    expect(readDeal("0", "7").ok).toBe(false);
    expect(readDeal("free", "7").ok).toBe(false);
    expect(readDeal("29", "").ok).toBe(false);
    expect(readDeal("29", "seven").ok).toBe(false);
    expect(readDeal("29", "120").ok).toBe(false);
  });

  it("puts the price, the trial length and how to cancel on the thank-you page, and names the checklist", async () => {
    const { ws } = await makeWorkspace();
    const res = await runLaunchKit(ws.id, kitAnswers());
    expect(res.ok).toBe(true);
    const web = await kitWebsite(ws.id);
    const text = web?.thankYou?.text ?? "";
    expect(termsCheck(text, { price: "$29", days: 7 })).toEqual({ price: true, trial: true, cancel: true, how: true });
    // Typed as "The 7-Day Dad Reset": pages say "Get the free 7-Day Dad Reset".
    expect(web?.site.leadMagnetName).toBe("7-Day Dad Reset");
    const db = await getDb();
    const [w] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, ws.id));
    expect(w.settings.offer).toBe("$29 a month with a 7-day free trial");
  });

  it("says plainly when there is no free trial", async () => {
    const { ws } = await makeWorkspace();
    await runLaunchKit(ws.id, kitAnswers({ price: "49", trialDays: 0 }));
    const text = (await kitWebsite(ws.id))?.thankYou?.text ?? "";
    expect(text).toContain("$49 a month");
    expect(text).toContain("There is no free trial.");
    expect(termsCheck(text, { price: "$49", days: 0 }).how).toBe(true);
  });

  it("building again rewrites the same website instead of making a second one", async () => {
    const { ws } = await makeWorkspace();
    const first = await runLaunchKit(ws.id, kitAnswers());
    if (!first.ok) throw new Error(first.error);
    expect(first.replaced).toBe(false);
    const second = await runLaunchKit(ws.id, kitAnswers({ price: "39", leadMagnetIdea: "The Desk Dad Plan" }));
    if (!second.ok) throw new Error(second.error);
    expect(second.replaced).toBe(true);
    expect(second.siteId).toBe(first.siteId);
    expect(await listSites(ws.id)).toHaveLength(1);
    const web = await kitWebsite(ws.id);
    expect(web?.thankYou?.text).toContain("$39");
    expect(web?.site.leadMagnetName).toBe("Desk Dad Plan");
  });

  it("out of runs: stops with one plain message and builds nothing; the starter template still works", async () => {
    env.aiEnabled = true;
    const { ws } = await makeWorkspace();
    await useAllRuns(ws.id);
    const res = await runLaunchKit(ws.id, kitAnswers());
    expect(res).toEqual({ ok: false, code: "no_runs", error: KIT_OUT_OF_RUNS });
    expect(KIT_OUT_OF_RUNS).toContain("Gemini key in Your AI");
    expect(KIT_OUT_OF_RUNS).not.toMatch(JARGON);
    expect(await listSites(ws.id)).toHaveLength(0);

    const starter = await runLaunchKit(ws.id, kitAnswers(), { useAi: false });
    expect(starter.ok).toBe(true);
    if (starter.ok) expect(starter.warning).not.toMatch(JARGON);
  });

  it("with no AI anywhere, the kit's note points at the free key, in plain words", async () => {
    env.aiEnabled = false;
    const { ws } = await makeWorkspace();
    const res = await runLaunchKit(ws.id, kitAnswers());
    if (!res.ok) throw new Error(res.error);
    expect(res.warning).toContain("free Gemini key in Your AI");
    expect(res.warning).not.toMatch(JARGON);
  });
});

describe("Ad studio: the offer follows where the ads go", () => {
  it("website ads offer the free checklist; Skool-link ads offer the trial", () => {
    const deal = dealFor({ offer: "", price: "$29", trialDays: 7 });
    expect(offerFor("website", { checklist: "The 7-Day Dad Reset", deal, group: "Fit Dads Club" })).toBe("Free checklist: The 7-Day Dad Reset");
    expect(offerFor("skool", { checklist: "The 7-Day Dad Reset", deal, group: "Fit Dads Club" })).toBe("7-day free trial of Fit Dads Club, then $29 a month");
    expect(offerFor("skool", { checklist: "", deal: { price: "$29", days: 0 }, group: "Fit Dads Club" })).toBe("Fit Dads Club on Skool, $29 a month");
    // Nothing invented when the member hasn't told us.
    expect(offerFor("skool", { checklist: "", deal: null, group: "Fit Dads Club" })).toBe("Fit Dads Club on Skool");
    expect(offerFor("website", { checklist: "", deal: null, group: "Fit Dads Club" })).toBe("A free checklist");
  });

  it("fills each pack's offer from the launch kit, never from yesterday's pack", async () => {
    const { ws } = await makeWorkspace();
    const kit = await runLaunchKit(ws.id, kitAnswers());
    if (!kit.ok) throw new Error(kit.error);
    await publishSite(ws.id, kit.siteId);
    const db = await getDb();
    const [fresh] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(await studioOffers(fresh)).toEqual({ website: "Free checklist: 7-Day Dad Reset", skool: "7-day free trial of Fit Dads Club, then $29 a month", price: 29 });
    expect(await adStudioDefaults(fresh)).toMatchObject({ destination: "website", offer: "", price: 29 });

    const day1 = await makeAdStudioPack(ws.id, { budget: 10 });
    if (!day1.ok) throw new Error(day1.error);
    expect(day1.pack.destination).toBe("website");
    const day2 = await makeAdStudioPack(ws.id, { budget: 5 });
    if (!day2.ok) throw new Error(day2.error);
    expect(day2.pack.destination).toBe("skool");
    const rows = await db.select({ id: aiGenerations.id, input: aiGenerations.input }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, ws.id), eq(aiGenerations.kind, "ad_studio")));
    const offerOf = (id: string) => rows.find((r) => r.id === id)?.input.offer;
    expect(offerOf(day1.id)).toBe("Free checklist: 7-Day Dad Reset");
    expect(offerOf(day2.id)).toBe("7-day free trial of Fit Dads Club, then $29 a month");
    // A typed offer still wins.
    const typed = await makeAdStudioPack(ws.id, { budget: 5, offer: "Free 5-day challenge" });
    if (!typed.ok) throw new Error(typed.error);
    expect((await db.select({ input: aiGenerations.input }).from(aiGenerations).where(eq(aiGenerations.id, typed.id)))[0].input.offer).toBe("Free 5-day challenge");
  });

  it("won't make a Skool-link pack until a Skool link is saved", async () => {
    const { ws } = await makeWorkspace();
    const db = await getDb();
    await db.update(workspaces).set({ settings: { businessName: "Fit Dads Club" } }).where(eq(workspaces.id, ws.id));
    const res = await makeAdStudioPack(ws.id, { budget: 5, destination: "skool" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Skool group link");
    expect(await db.select().from(aiGenerations).where(and(eq(aiGenerations.workspaceId, ws.id), eq(aiGenerations.kind, "ad_studio")))).toHaveLength(0);
  });

  it("says when a pack isn't written by AI, and how to fix it, in plain words", async () => {
    const { ws } = await makeWorkspace();
    env.aiEnabled = false;
    const off = await makeAdStudioPack(ws.id, { budget: 5 });
    expect(off.ok && off.warning).toBe(STUDIO_NO_AI);
    env.aiEnabled = true;
    await useAllRuns(ws.id);
    const out = await makeAdStudioPack(ws.id, { budget: 5 });
    expect(out.ok && out.warning).toBe(STUDIO_NO_RUNS);
    for (const m of [STUDIO_NO_AI, STUDIO_NO_RUNS]) {
      expect(m).toContain("free Gemini key in Your AI");
      expect(m).not.toMatch(JARGON);
    }
  });
});

describe("Ad research: the quick read says what it is", () => {
  it("names the free key when there's no AI run to use, without jargon", async () => {
    const ads = [{ page: "Rival", text: "Tired of guessing what to eat? Join us.", daysRunning: 62 }];
    const { ws } = await makeWorkspace();
    env.aiEnabled = false;
    const off = await analyzeCompetitorAds(ws.id, { ads, query: "pasted" });
    expect(off.ok && off.warning).toBe(RESEARCH_NO_AI);
    env.aiEnabled = true;
    await useAllRuns(ws.id);
    const out = await analyzeCompetitorAds(ws.id, { ads, query: "pasted" });
    expect(out.ok && out.warning).toBe(RESEARCH_NO_RUNS);
    for (const m of [RESEARCH_NO_AI, RESEARCH_NO_RUNS, fallbackAnalysis(ads, "").summary]) expect(m).not.toMatch(JARGON);
    // The paid deal belongs behind the door, not in a "Picture…" hook.
    const dream = fallbackAnalysis(ads, "$29 a month with a 7-day free trial").drafts[1];
    expect(dream.hook).not.toContain("$29");
    expect(dream.door).toContain("$29 a month");
  });
});
