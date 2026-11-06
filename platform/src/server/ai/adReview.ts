import * as z from "zod/v4";
import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations, workspaces } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { latestCheckins, skoolAdVisits, skoolTargetFor } from "../growth";
import { VOICE_RULES, chargeAi, describeAiError, generateStructured, refundAi } from "./client";

// Ad review (lesson 2.6, then every Monday): one ad's numbers in, a verdict out.
//
// Two modes:
//   "skool"   The course's way (v5). The ad's Website URL is the Skool link (/go/<slug>), so every
//             click opens the Skool About page and there are no leads to count ("Leads: 0 is fine").
//             Judged on link CTR, cost per click (= cost per About-page visit), how much Meta spent,
//             the days running (the 72-hour rule) and the ad visits the Skool link counted.
//             On when leads are 0 or blank, or when the member says the ad points at their Skool link.
//   "funnel"  An ad that points at an opt-in page and has leads: opt-in rate and cost per lead.
//
// Every number here is a rule of thumb, never a promise. Don't add benchmarks that aren't below.

const blank = (v: unknown) => (v === "" || v === null ? undefined : v);

export const AD_DESTINATIONS = ["skool", "optin"] as const;

export const adReviewInputSchema = z.object({
  /** "S1 Notes app": the launch plan names each ad so Ad review is easy. */
  adName: z
    .string()
    .default("")
    .transform((s) => s.trim().slice(0, 80)),
  /** Where the ad sends people. The course (v5) points every ad at the Skool link. */
  destination: z.enum(AD_DESTINATIONS).catch("skool"),
  spend: z.coerce.number().min(0),
  impressions: z.coerce.number().int().min(0),
  linkClicks: z.coerce.number().int().min(0),
  leads: z.coerce.number().int().min(0).default(0),
  followers: z.coerce.number().int().min(0).default(0),
  /** New members (joins) since the ad went live. Blank means "not known", so the About page isn't judged. */
  members: z.preprocess(blank, z.coerce.number().int().min(0).optional()),
  /** How many times the member already fixed this ad: 0, 1 or 2 (twice or more). */
  fixes: z.coerce
    .number()
    .int()
    .min(0)
    .catch(0)
    .default(0)
    .transform((n) => Math.min(2, n)),
  days: z.coerce.number().int().min(1).max(90).default(3),
  goal: z.string().max(300).default(""),
  notes: z.string().max(1500).default(""),
});
export type AdReviewInput = z.infer<typeof adReviewInputSchema>;

export type AdReviewMode = "skool" | "funnel";
export const AD_CALLS = ["keep", "fix_hook", "fix_door", "fix_about", "kill", "too_early"] as const;
export type AdCall = (typeof AD_CALLS)[number];
/** The verdict word, as the course's keep-fix-kill figure says it. */
export const CALL_WORD: Record<AdCall, string> = {
  keep: "Keep",
  fix_hook: "Fix: Hook",
  fix_door: "Fix: Door",
  fix_about: "Fix: About page",
  kill: "Kill",
  too_early: "Too early",
};

export type MetricStatus = "good" | "ok" | "fix" | "wait";
export type AdMetric = { name: string; value: string; status: MetricStatus; note: string };
export type AdReview = {
  verdict: string;
  metrics: AdMetric[];
  actions: { title: string; detail: string }[];
  nextBudgetUsdPerDay: number;
  // Skool-link mode only. Reviews saved before it have none of these and show as the funnel review.
  mode?: AdReviewMode;
  call?: AdCall;
  /** One plain sentence: why this verdict. */
  why?: string;
  adName?: string;
  /** The member's daily budget (from the Monday check-in) and what to set it to. */
  budget?: { now: number; next: number } | null;
  /** What the Skool link counted, and cost per visit = total spend ÷ counted ad visits. */
  counted?: { ready: boolean; adVisits: number; days: number; totalSpend: number; ads: number; costPerVisit: number | null } | null;
};

/** The funnel review the AI writes (opt-in page ads). */
const funnelSchema = z.object({
  verdict: z.string(),
  metrics: z.array(z.object({ name: z.string(), value: z.string(), status: z.enum(["good", "ok", "fix"]), note: z.string() })),
  actions: z.array(z.object({ title: z.string(), detail: z.string() })),
  nextBudgetUsdPerDay: z.number(),
});
/** In Skool-link mode the rules pick the verdict; the AI only words it. */
const skoolAiSchema = z.object({ why: z.string(), actions: z.array(z.object({ title: z.string(), detail: z.string() })) });

/**
 * Rules of thumb, in the course's order. Sources: the 72-hour rule; "$5 to $10 a day to start";
 * link CTR 1%+ good and under 0.8% means a new hook; cost per click $1 good, $2 OK; "clicks are
 * coming in" past 20; 10 clicks is the least that says anything (so 1,000 impressions, at 1%);
 * fixed twice and still failing means kill.
 */
export const RULES = {
  learnDays: 3,
  minImpressions: 1000,
  minSpend: 5,
  noiseClicks: 10,
  hookCtr: 0.8,
  goodCtr: 1,
  goodCpc: 1,
  okCpc: 2,
  visitsComing: 20,
  killAfterFixes: 2,
  feedPercent: 20,
} as const;

/** What the Skool link knows, for Skool-link mode. */
export type SkoolLinkCounts = {
  /** A Skool group link is saved, so /go/<slug> opens the About page. */
  ready: boolean;
  /** Ad visits the Skool link counted over the ad's days running (all ads together). */
  adVisits: number;
  days: number;
  /** This ad's spend plus the latest spend of every other ad reviewed this week. */
  totalSpend: number;
  ads: number;
};
export type AdReviewContext = { link?: SkoolLinkCounts | null; budgetPerDay?: number | null };

export function reviewMode(i: Pick<AdReviewInput, "destination" | "leads">): AdReviewMode {
  return i.destination === "optin" && i.leads > 0 ? "funnel" : "skool";
}

export function computeMetrics(i: Pick<AdReviewInput, "spend" | "impressions" | "linkClicks" | "leads" | "followers">) {
  const ctr = i.impressions ? (i.linkClicks / i.impressions) * 100 : 0;
  const cpm = i.impressions ? (i.spend / i.impressions) * 1000 : 0;
  const cpc = i.linkClicks ? i.spend / i.linkClicks : 0;
  const cpl = i.leads ? i.spend / i.leads : 0;
  const optIn = i.linkClicks ? (i.leads / i.linkClicks) * 100 : 0;
  const cpf = i.followers ? i.spend / i.followers : 0;
  return { ctr, cpm, cpc, cpl, optIn, cpf };
}

const usd = (n: number) => `$${n < 100 ? n.toFixed(2) : Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${n.toFixed(2)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The keep-fix-kill call for an ad pointed at the Skool link. "The first no picks the room." */
export function skoolLinkCall(i: AdReviewInput, link?: SkoolLinkCounts | null): { call: AdCall; learning: boolean; barely: boolean } {
  const m = computeMetrics(i);
  const learning = i.days < RULES.learnDays;
  const barely = i.impressions < RULES.minImpressions || (i.spend < RULES.minSpend && i.linkClicks < RULES.noiseClicks);
  if (learning || barely) return { call: "too_early", learning, barely };
  // 1. Getting clicks? Few (low CTR) or dear ones: the Hook. Fixed twice and still failing: kill.
  if (m.ctr < RULES.hookCtr || m.cpc > RULES.okCpc) return { call: i.fixes >= RULES.killAfterFixes ? "kill" : "fix_hook", learning, barely };
  // 2. About-page visits? Clicks coming in but the Skool link counted none (or has nowhere to go): the Door.
  if (link && (!link.ready || (i.linkClicks > RULES.visitsComing && link.adVisits === 0))) return { call: "fix_door", learning, barely };
  // 3. People joining? Visits but no joins: the About page, not the ad.
  const visits = link && link.adVisits > 0 ? link.adVisits : i.linkClicks;
  if (i.members === 0 && visits > RULES.visitsComing) return { call: "fix_about", learning, barely };
  return { call: "keep", learning, barely };
}

/** Ad review for an ad that points at the Skool link (the course's way). */
export function skoolLinkReview(i: AdReviewInput, ctx: AdReviewContext = {}): AdReview {
  const m = computeMetrics(i);
  const link = ctx.link ?? null;
  const { call, learning, barely } = skoolLinkCall(i, link);
  const early = call === "too_early";
  const judged = (s: MetricStatus): MetricStatus => (early ? "wait" : s);
  const clicksIn = i.linkClicks > RULES.visitsComing;
  const visits = link && link.adVisits > 0 ? link.adVisits : i.linkClicks;
  const costPerVisit = link && link.adVisits > 0 ? link.totalSpend / link.adVisits : null;
  const now = ctx.budgetPerDay && ctx.budgetPerDay > 0 ? ctx.budgetPerDay : null;
  const feed = 1 + RULES.feedPercent / 100;
  const budget = now ? { now, next: round2(call === "keep" ? now * feed : now) } : null;
  const pace = i.spend / i.days;

  const metrics: AdMetric[] = [
    {
      name: "Link click-through",
      value: pct(m.ctr),
      status: judged(m.ctr >= RULES.goodCtr ? "good" : m.ctr >= RULES.hookCtr ? "ok" : "fix"),
      note: "Rule of thumb: 1% or more is good. Under 0.8%, fix the Hook.",
    },
    {
      name: "Cost per click = cost per About-page visit",
      value: i.linkClicks ? usd(m.cpc) : "no clicks yet",
      status: judged(!i.linkClicks ? "fix" : m.cpc <= RULES.goodCpc ? "good" : m.cpc <= RULES.okCpc ? "ok" : "fix"),
      note: "Each click on your Skool link opens your About page. Rule of thumb: $1 or less is good, up to $2 is OK.",
    },
    {
      name: "What Meta spent on it",
      value: usd(i.spend),
      status: barely ? "wait" : "good",
      note: `${plural(i.impressions, "impression")}. ${barely ? "Meta barely spent on it, so it hasn't lost yet. Rule of thumb: judge it after 1,000 impressions." : "Enough to judge. Rule of thumb: 1,000 impressions or more."}`,
    },
    {
      name: "Days running",
      value: plural(i.days, "day"),
      status: learning ? "wait" : "good",
      note: "The 72-hour rule: no edits till your alarm rings.",
    },
  ];
  if (link) {
    metrics.push({
      name: "Skool link counted",
      value: plural(link.adVisits, "ad visit"),
      status: !link.ready || (clicksIn && link.adVisits === 0) ? "fix" : link.adVisits ? "good" : "wait",
      note: link.ready
        ? `All your ads together, last ${plural(link.days, "day")}. Meta counted ${plural(i.linkClicks, "link click")} on this ad.`
        : "Your Skool link has nowhere to go yet: add your Skool group link in Settings.",
    });
    if (costPerVisit !== null) {
      metrics.push({
        name: "Cost per visit, all ads",
        value: usd(costPerVisit),
        status: judged(costPerVisit <= RULES.goodCpc ? "good" : costPerVisit <= RULES.okCpc ? "ok" : "fix"),
        note:
          link.ads > 1
            ? `Total spend of the ${link.ads} ads you reviewed this week (${usd(link.totalSpend)}) ÷ ${plural(link.adVisits, "ad visit")} counted.`
            : `This ad's spend ÷ every ad visit counted. Review each ad by name (S1, S2…) and the total adds up.`,
      });
    }
  }
  if (i.members !== undefined) {
    metrics.push({
      name: "New members",
      value: String(i.members),
      status: i.members > 0 ? "good" : judged(visits > RULES.visitsComing ? "fix" : "wait"),
      note: "From Skool. Visits but no joins means the About page, not the ad.",
    });
  }

  const ctrWords = i.linkClicks ? `only ${pct(m.ctr)} of people who saw it clicked` : `nobody clicked in ${plural(i.impressions, "impression")}`;
  const hookWhy = m.ctr < RULES.hookCtr ? ctrWords : `each click costs ${usd(m.cpc)}`;
  const why: Record<AdCall, string> = {
    too_early: learning
      ? "It's been under 72 hours and new ads are toddlers learning to walk, so hands off till your alarm rings."
      : `Meta barely spent on it (${usd(i.spend)}, ${plural(i.impressions, "impression")}), so it hasn't lost yet: leave it on.`,
    fix_hook: `${hookWhy[0].toUpperCase()}${hookWhy.slice(1)}, so give it new on-image text and a new first line, same picture.`,
    kill: `You've fixed it twice and ${hookWhy}, so switch it off and give its slot to a fresh static.`,
    fix_door:
      link && !link.ready
        ? "Your Skool link doesn't know where your group lives yet, so people can't reach your About page."
        : `Meta counted ${plural(i.linkClicks, "link click")} but your Skool link counted no ad visits, so this ad's Website URL must be your Skool link.`,
    fix_about: `Your ads sent ${plural(visits, "person", "people")} to your About page and nobody joined, so fix the shopfront, not the ad.`,
    keep: `${pct(m.ctr)} of people clicked and each visit costs ${usd(m.cpc)}, so keep it and feed it slowly.`,
  };

  const handsOff = { title: "Hands off for 72 hours", detail: "A change restarts Meta's learning. Judge it again when the alarm rings." };
  const actions: Record<AdCall, AdReview["actions"]> = {
    too_early: learning
      ? [
          { title: "Hands off till 72 hours", detail: "No edits, no pausing, no new ads. Every change restarts Meta's learning." },
          { title: "Then come back", detail: "Paste this ad's numbers again after 72 hours (Ads Manager, date range Maximum)." },
        ]
      : [
          { title: "Leave it on", detail: "Meta leans towards one ad first. This one hasn't had its turn yet, so it hasn't lost." },
          { title: "Look again next Monday", detail: "Review it at your next weigh-in. Judge the ads Meta did spend on first." },
        ],
    fix_hook: [
      { title: "Fix the Hook", detail: "New on-image text and a new first line. Keep the same picture, the Turn and the Door." },
      { title: "Swap the words, not the picture", detail: "Same image with new words on it (Canva is free), then edit the first line of Primary text in Ads Manager." },
      handsOff,
    ],
    kill: [
      { title: "Switch it off", detail: "In Ads Manager, turn this ad off. Leave the others alone." },
      { title: "A fresh face in its slot", detail: "Ad studio › Make my 5 statics. Add the one that looks least like what's running to the same ad set." },
      handsOff,
    ],
    fix_door:
      link && !link.ready
        ? [
            { title: "Add your Skool group link", detail: "Settings › Your business: paste your skool.com group link. Your Skool link then opens your About page." },
            { title: "Check the Website URL", detail: "In Ads Manager, the ad's Website URL must be your Skool link (Copy link, in Ad studio's launch plan)." },
          ]
        : [
            { title: "Fix the Door", detail: "In Ads Manager, open the ad and paste your Skool link (Copy link, in Ad studio's launch plan) into Website URL." },
            { title: "Test it on your phone", detail: "Tap the ad's link: it should open your Skool About page." },
            { title: "Leave the rest alone", detail: "People click, so the Hook works. Only the link changes." },
          ],
    fix_about: [
      { title: "Fix the About page, not the ad", detail: "The ad works: people click and land. Make the first line of your About page the result, in your member's words." },
      { title: "Borrow from your launch kit", detail: "It wrote you a Skool About page. Paste its top lines in." },
      { title: "Keep the ad running", detail: "Don't touch the ad while you fix the page." },
    ],
    keep: [
      { title: "Keep it", detail: "Don't touch the ad itself." },
      {
        title: "Feed it slowly",
        detail: budget
          ? `Raise the daily budget about 20% wherever it lives (${usd(budget.now)} → ${usd(budget.next)} a day), then wait 2 to 3 days.`
          : "Raise the daily budget about 20% wherever it lives, then wait 2 to 3 days.",
      },
      ...(i.members === undefined ? [{ title: "Add your joins next time", detail: "Put in New members from Skool and Ad review checks your About page too." }] : []),
    ],
  };

  return {
    mode: "skool",
    call,
    verdict: CALL_WORD[call],
    why: why[call],
    adName: i.adName || undefined,
    metrics,
    actions: actions[call],
    budget,
    counted: link ? { ready: link.ready, adVisits: link.adVisits, days: link.days, totalSpend: round2(link.totalSpend), ads: link.ads, costPerVisit: costPerVisit === null ? null : round2(costPerVisit) } : null,
    nextBudgetUsdPerDay: budget ? budget.next : round2(call === "keep" ? pace * feed : pace),
  };
}

/** Ad review for an ad that points at an opt-in page and has leads. */
export function funnelReview(i: AdReviewInput): AdReview {
  const m = computeMetrics(i);
  const metrics: AdMetric[] = [
    { name: "Link click-through", value: pct(m.ctr), status: m.ctr >= 1 ? "good" : m.ctr >= 0.8 ? "ok" : "fix", note: "Rule of thumb: 1% or more. Under 0.8% means a new hook." },
    { name: "Cost per click", value: usd(m.cpc), status: m.cpc && m.cpc <= 1 ? "good" : m.cpc <= 2 ? "ok" : "fix", note: "Lower is better. New creatives bring it down." },
    { name: "Page opt-in rate", value: `${m.optIn.toFixed(1)}%`, status: m.optIn >= 25 ? "good" : m.optIn >= 15 ? "ok" : "fix", note: "Rule of thumb: 25%+. Under 15% means a new headline." },
    { name: "Cost per lead", value: i.leads ? usd(m.cpl) : "no leads yet", status: i.leads && m.cpl <= 5 ? "good" : i.leads && m.cpl <= 10 ? "ok" : "fix", note: "Rule of thumb: under $5 to start." },
  ];
  if (i.followers) {
    metrics.push({ name: "Cost per follower", value: usd(m.cpf), status: m.cpf <= 0.5 ? "good" : m.cpf <= 1 ? "ok" : "fix", note: "Rule of thumb: under $0.50." });
  }
  const actions: AdReview["actions"] = [];
  if (m.ctr < 0.8) actions.push({ title: "Fix the Hook", detail: "Few people stop to click. Keep the Turn and the Door. Test 3 new first lines (or first 2 seconds of video)." });
  if (m.optIn < 15 && i.linkClicks > 20) actions.push({ title: "Fix the page's headline", detail: "Clicks come in but few people sign up. Make the headline the result, in your reader's words." });
  if (i.leads && m.cpl <= 5) actions.push({ title: "Keep it and scale", detail: "This one works. Raise its budget by about 20% every 2-3 days. Don't touch the ad itself." });
  if (!actions.length) actions.push({ title: "Hands off for 3 more days", detail: "The 72-hour rule: let it learn before you change anything. Then fix one thing only." });
  const perDay = i.spend / i.days;
  return {
    mode: "funnel",
    adName: i.adName || undefined,
    verdict: i.leads && m.cpl <= 5 ? "Your funnel works. Scale it slowly." : "Fix the weakest number first, then scale.",
    metrics,
    actions,
    nextBudgetUsdPerDay: round2(i.leads && m.cpl <= 5 ? perDay * 1.2 : perDay),
  };
}

/** The rule-based review: Skool-link mode unless the ad points at an opt-in page and has leads. */
export function ruleReview(i: AdReviewInput, ctx: AdReviewContext = {}): AdReview {
  return reviewMode(i) === "skool" ? skoolLinkReview(i, ctx) : funnelReview(i);
}

/** What the Skool link counted over the ad's days running, plus this week's other reviewed ads. */
async function skoolLinkContext(workspaceId: string, input: AdReviewInput, skoolUrl?: string): Promise<AdReviewContext> {
  const db = await getDb();
  const days = Math.min(90, input.days + 1);
  const [target, adVisits, checkins, recent] = await Promise.all([
    skoolTargetFor(workspaceId, skoolUrl),
    skoolAdVisits(workspaceId, days),
    latestCheckins(workspaceId, 1),
    db
      .select({ input: aiGenerations.input, output: aiGenerations.output })
      .from(aiGenerations)
      .where(and(eq(aiGenerations.workspaceId, workspaceId), eq(aiGenerations.kind, "ad_review"), gte(aiGenerations.createdAt, new Date(Date.now() - 7 * 86_400_000))))
      .orderBy(desc(aiGenerations.createdAt))
      .limit(50),
  ]);
  // Cost per visit = total spend ÷ the ad visits counted (lesson 2.6). Total spend: this ad, plus
  // the latest review of every other ad reviewed by name this week.
  const key = (s: unknown) => String(s ?? "").trim().toLowerCase();
  const seen = new Set([key(input.adName)]);
  let others = 0;
  let ads = 1;
  for (const r of recent) {
    const name = key(r.input?.adName);
    if (!name || seen.has(name) || (r.output as unknown as AdReview | null)?.mode !== "skool") continue;
    seen.add(name);
    others += Number(r.input?.spend) || 0;
    ads += 1;
  }
  return {
    link: { ready: Boolean(target), adVisits, days, totalSpend: input.spend + others, ads },
    budgetPerDay: checkins[0]?.adSpendPerDay || null,
  };
}

const SKOOL_SYSTEM = `You are a Meta ads coach for Skool community owners who grow with small paid ads, not social media.
This ad points at the owner's Skool link: every click opens their Skool About page. There is no opt-in page, so leads don't matter here. Never judge it on opt-in rate or cost per lead.
Every ad has a Hook (on-image text and first line), a Turn (the "wait, what?" line) and a Door (one way in: the Skool link).
The verdict comes from these rules, in this order. The first "no" picks the room:
1. Under 72 hours running: Too early. Hands off till the alarm rings.
2. Meta barely spent on it (under 1,000 impressions, or under $5 spent with under 10 link clicks): Too early. Leave it on. It hasn't lost.
3. Getting clicks? Link CTR under 0.8%, or clicks dearer than $2: Fix: Hook. New on-image text and first line, same picture. Fixed twice already and still failing: Kill. Switch it off and put a fresh static in its slot.
4. About-page visits? Over 20 link clicks but the Skool link counted no ad visits, or the Skool link has no group link yet: Fix: Door. The Website URL must be the Skool link.
5. People joining? Over 20 visits and no new members: Fix: About page. Fix the shopfront, not the ad.
6. Otherwise: Keep. Feed it slowly: about 20% more budget every 2 to 3 days.
Rules of thumb, never promises: link CTR 1% or more is good. Cost per click is the cost per About-page visit: $1 or less is good, up to $2 is OK. Use no other benchmarks.
You are given the verdict. Don't change it. Write:
- why: one plain sentence that explains the verdict with their own numbers.
- actions: 2 to 4 short steps for that one room only (or for hands off, or for feeding the winner).
${VOICE_RULES}`;

const FUNNEL_SYSTEM = `You are a Meta ads coach for Skool community owners who grow with small paid ads, not social media. This ad points at an opt-in page. Review a beginner's numbers and give a short, specific plan.
Use the course's words: every ad has a Hook (first line or first 2 seconds), a Turn (the "wait, what?" line) and a Door (one way in). Say which ONE thing to fix: no clicks (low CTR) means the Hook; clicks but few sign-ups means the page's headline. Mention the 72-hour rule if the ad is under 3 days old. Budget tiers: $5-$10 a day to start, $30-$50 is the sweet spot.
Rules of thumb to judge against (never promises): link CTR 1%+ is good (under 0.8% needs a new hook); landing page opt-in 25%+ is good (under 15% needs a new headline); cost per lead under $5 is a good start; cost per follower under $0.50 is good. Scale winners by 20% every 2-3 days. Use no other benchmarks.
${VOICE_RULES}
Give 3 to 5 actions.`;

export async function runAdReview(workspaceId: string, raw: unknown) {
  const parsed = adReviewInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Check your numbers and try again." };
  const input = parsed.data;
  const mode = reviewMode(input);
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const ctx = mode === "skool" ? await skoolLinkContext(workspaceId, input, ws?.settings.skoolUrl) : {};
  let review = ruleReview(input, ctx);
  let model = "rules";
  let warning: string | undefined;
  const charge = await chargeAi(workspaceId, "ai_generation", "AI ad review");
  if (env.aiEnabled && !charge) warning = "You've used this month's AI generations, so this is the rule-based review.";
  if (charge) {
    try {
      const m = computeMetrics(input);
      const business = `Business: ${ws?.settings.businessName ?? ""} (${ws?.settings.niche ?? "coaching"}).`;
      const numbers = `${input.adName ? `Ad: ${input.adName}. ` : ""}${input.days} days running: spend $${input.spend}, impressions ${input.impressions}, link clicks ${input.linkClicks}, leads ${input.leads}, new members ${input.members ?? "not given"}, times already fixed ${input.fixes}.
Computed: CTR ${m.ctr.toFixed(2)}%, CPM $${m.cpm.toFixed(2)}, cost per click $${m.cpc.toFixed(2)}.`;
      const owner = `Goal: ${input.goal || "more paying members"}.
Notes from the owner: ${input.notes || "none"}`;
      if (review.mode === "skool") {
        const c = review.counted;
        const res = await generateStructured({
          workspaceId,
          creds: charge.creds,
          effort: "medium",
          maxTokens: 4000,
          schema: skoolAiSchema,
          system: SKOOL_SYSTEM,
          prompt: `${business}
${numbers}
Skool link: ${c ? (c.ready ? `counted ${c.adVisits} ad visits in the last ${c.days} days (all ads together)${c.costPerVisit !== null ? `, cost per visit $${c.costPerVisit.toFixed(2)}` : ""}` : "no Skool group link saved yet") : "not known"}.
Verdict (from the rules): ${review.verdict}. ${review.why}
${owner}`,
        });
        const actions = res.data.actions.filter((a) => a.title.trim() && a.detail.trim()).slice(0, 4);
        review = { ...review, why: res.data.why.trim() || review.why, actions: actions.length ? actions : review.actions };
        model = res.usage.model;
      } else {
        const res = await generateStructured({
          workspaceId,
          creds: charge.creds,
          effort: "medium",
          maxTokens: 8000,
          schema: funnelSchema,
          system: FUNNEL_SYSTEM,
          prompt: `${business}
${numbers} Opt-in ${m.optIn.toFixed(1)}%, cost per lead ${input.leads ? `$${m.cpl.toFixed(2)}` : "n/a"}, new followers ${input.followers}.
${owner}`,
        });
        review = { ...res.data, mode: "funnel", adName: input.adName || undefined };
        model = res.usage.model;
      }
    } catch (err) {
      await refundAi(workspaceId, "ai_generation", charge, "Refund: AI ad review failed");
      warning = `${describeAiError(err)} Showing the rule-based review instead.`;
    }
  }
  const [row] = await db
    .insert(aiGenerations)
    .values({ workspaceId, kind: "ad_review", input, output: review as unknown as Record<string, unknown>, model })
    .returning({ id: aiGenerations.id });
  return { ok: true as const, id: row.id, review, warning };
}
