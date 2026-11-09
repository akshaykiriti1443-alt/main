import * as z from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations, workspaces } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { VOICE_RULES, chargeAi, describeAiError, generateStructured, refundAi } from "./client";
import { AD_ANGLES, AD_FRAMEWORK_RULES, ANGLE_LABEL, type AdAngle } from "./adFramework";
import type { ResearchAd } from "./adResearch";
import { latestCheckins, skoolLinkFor } from "../growth";

// The Ad studio: a beginner's first ads, the same day. Statics first (the safest bet); the video is
// recorded on Day 8 and goes live on Day 9 with fresh statics. Four parts, in the course's words:
//   Your numbers           budget → About-page visits → days to Skool's Level 2 (100 visitors).
//   Your 5 statics         five genuinely different image ads. Meta's Andromeda system groups
//                          near-identical ads and treats them as one, so every pair differs in at
//                          least two of: format, persona, angle, benefit.
//   Your launch plan       one Traffic campaign, one broad ad set, all 5 statics, the Skool link.
//   Video script (later)   a 20–30 second selfie script on the winning angle.
// AI writes the creative (on the member's own AI when connected); the numbers and the click-steps
// are rules, so they are never made up. Without AI, a rule-based pack still gives all of it.

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const STATIC_FORMATS = ["text_on_colour", "photo_overlay", "notes_app", "before_after", "checklist", "quote_card"] as const;
export type StaticFormat = (typeof STATIC_FORMATS)[number];

export const FORMAT_LABEL: Record<StaticFormat, string> = {
  text_on_colour: "Big text on colour",
  photo_overlay: "Photo with a text box",
  notes_app: "Notes-app screenshot",
  before_after: "Before / after split",
  checklist: "Checklist",
  quote_card: "Member quote card",
};

const FORMAT_BRIEF: Record<StaticFormat, string> = {
  text_on_colour: "huge words on one bold solid colour, nothing else",
  photo_overlay: "a candid, real-looking photo with a short text box on top",
  notes_app: "a realistic iPhone Notes screenshot with a short list",
  before_after: "a split screen: old way vs new way, shown as routines or to-do lists (never bodies or faces)",
  checklist: "a clean checklist or simple infographic",
  quote_card: "a real member's words in a speech bubble (only when a real result is given)",
};

export const STATIC_CTAS = ["Learn more", "Sign up", "Subscribe", "Apply now"] as const;
export type StaticCta = (typeof STATIC_CTAS)[number];

export const STUDIO_TONES = ["friendly", "bold", "calm"] as const;
export type StudioTone = (typeof STUDIO_TONES)[number];

export const STUDIO_COUNTRIES: [code: string, label: string][] = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["NZ", "New Zealand"],
  ["IE", "Ireland"],
  ["IN", "India"],
  ["ZA", "South Africa"],
  ["AE", "United Arab Emirates"],
  ["SG", "Singapore"],
  ["PH", "Philippines"],
  ["NG", "Nigeria"],
  ["DE", "Germany"],
  ["NL", "Netherlands"],
  ["FR", "France"],
  ["ES", "Spain"],
  ["IT", "Italy"],
  ["BR", "Brazil"],
  ["MX", "Mexico"],
];
export const countryLabel = (code: string) => STUDIO_COUNTRIES.find(([c]) => c === code)?.[1] ?? code;

/** A first ad's cost per About-page visit, until the member has their own number. */
export const ASSUMED_CPV = { low: 0.5, high: 1.5 } as const;
/** Skool's Level 2 needs 100 About-page visitors in the last 30 days. */
export const LEVEL2_VISITORS = 100;
export const STATICS_PER_PACK = 5;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const researchAdSchema = z.object({ page: z.string().max(80), text: z.string().max(1200), daysRunning: z.number().int().min(0).max(5000) });

export const adStudioInputSchema = z.object({
  businessName: z.string().trim().max(80).default(""),
  niche: z.string().trim().max(160).default(""),
  offer: z.string().trim().max(200).default(""),
  /** Who it's for, in the owner's own words. */
  audience: z.string().trim().max(200).default(""),
  /** The result they promise. */
  promise: z.string().trim().max(200).default(""),
  /** A real member result. Only this unlocks a Proof ad. */
  proof: z.string().trim().max(400).default(""),
  /** Skool price per month, if they told us. */
  price: z.coerce.number().min(0).max(100_000).default(0),
  budget: z.coerce.number().min(1).max(10_000).default(5),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default("US"),
  tone: z.enum(STUDIO_TONES).default("friendly"),
  competitorAds: z.array(researchAdSchema).max(10).default([]),
});
export type AdStudioInput = z.infer<typeof adStudioInputSchema>;

// ---------------------------------------------------------------------------
// Your numbers
// ---------------------------------------------------------------------------

export type RealCpv = { cpv: number; source: "ad_review" | "checkin"; at: string };
export type StudioNumbers = {
  budget: number;
  cpvLow: number;
  cpvHigh: number;
  cpvSource: "assumption" | RealCpv["source"];
  cpvAt?: string;
  /** About-page visits a day (raw, not rounded). */
  visitsPerDay: { low: number; high: number };
  visitsPerMonth: { low: number; high: number };
  /** Days to Level 2's 100 visitors, at the cheap and the dear end of the range. */
  daysTo100: { fast: number; slow: number };
  monthlySpend: number;
  /** The daily budget that clears 100 visitors in 30 days at the dear end. */
  minBudgetFor100: number;
  statics: number;
};

const EPS = 1e-9;
const clampCpv = (n: number) => Math.min(20, Math.max(0.05, Math.round(n * 100) / 100));

export function studioNumbers(budgetIn: number, real?: RealCpv | null): StudioNumbers {
  const budget = Math.max(1, Math.min(10_000, Math.round((Number(budgetIn) || 5) * 100) / 100));
  const cpvLow = real ? clampCpv(real.cpv) : ASSUMED_CPV.low;
  const cpvHigh = real ? clampCpv(real.cpv) : ASSUMED_CPV.high;
  const dayLow = budget / cpvHigh;
  const dayHigh = budget / cpvLow;
  return {
    budget,
    cpvLow,
    cpvHigh,
    cpvSource: real?.source ?? "assumption",
    ...(real ? { cpvAt: real.at } : {}),
    visitsPerDay: { low: dayLow, high: dayHigh },
    visitsPerMonth: { low: Math.round(dayLow * 30), high: Math.round(dayHigh * 30) },
    // Multiply before dividing so $5 at $1.50 is exactly 30 days, not 30.000000001.
    daysTo100: { fast: Math.ceil((LEVEL2_VISITORS * cpvLow) / budget - EPS), slow: Math.ceil((LEVEL2_VISITORS * cpvHigh) / budget - EPS) },
    monthlySpend: Math.round(budget * 30),
    minBudgetFor100: Math.ceil((LEVEL2_VISITORS * cpvHigh) / 30 - EPS),
    statics: STATICS_PER_PACK,
  };
}

const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
/** "3–10", or "about 12" when both ends match. */
export function range(low: number, high: number, round: (n: number) => number = Math.round): string {
  const a = round(low);
  const b = round(high);
  return a === b ? `about ${a.toLocaleString()}` : `${a.toLocaleString()}–${b.toLocaleString()}`;
}
const visits = (n: number) => Math.max(1, Math.round(n));
const listWords = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const FORMAT_WORDS: Record<StaticFormat, string> = {
  text_on_colour: "big words on a colour",
  photo_overlay: "a real photo with a text box",
  notes_app: "a notes-app screenshot",
  before_after: "a before/after split",
  checklist: "a checklist",
  quote_card: "a real member's words",
};
const DEFAULT_FORMATS: StaticFormat[] = ["text_on_colour", "photo_overlay", "notes_app", "before_after", "checklist"];

export type NumbersLine = { key: "assumption" | "level2" | "statics" | "target" | "images" | "social"; title: string; text: string };

/** The plain-words explanation under the numbers. Honest maths: visitors, never members or income. */
export function numbersLines(n: StudioNumbers, opts: { price?: number; country?: string; formats?: StaticFormat[] } = {}): NumbersLine[] {
  const day = range(n.visitsPerDay.low, n.visitsPerDay.high, visits);
  const days = n.daysTo100.fast === n.daysTo100.slow ? `about ${n.daysTo100.fast}` : `${n.daysTo100.fast}–${n.daysTo100.slow}`;
  const when = n.cpvAt ? new Date(n.cpvAt).toDateString() : "";
  const assumption =
    n.cpvSource === "assumption"
      ? `We assume ${money(ASSUMED_CPV.low)}–${money(ASSUMED_CPV.high)} per About-page visit, a normal range for a first ad. After your first week, Ad review gives you your real number and this page uses it.`
      : n.cpvSource === "ad_review"
        ? `Your real cost per visit is about ${money(n.cpvLow)} (from your Ad review${when ? ` on ${when}` : ""}), so these numbers use it.`
        : `Your real cost per visit is about ${money(n.cpvLow)} (ad spend ÷ About-page visitors from your Monday check-in${when ? ` on ${when}` : ""}), so these numbers use it.`;
  const short = n.visitsPerMonth.low < LEVEL2_VISITORS;
  const level2 = [
    `At ${money(n.budget)} a day that's ${day} visits a day, so Level 2's 100 About-page visitors takes ${days} days. Skool counts the last 30 days.`,
    short ? `At this budget 100 in 30 days is a stretch: ${money(n.minBudgetFor100)} a day gets you there.` : "",
    `Visitors aren't members. Level 2 also needs 1 new customer and subscription or tiers pricing${opts.price ? ` (you told us ${money(opts.price)} a month, so pricing is covered)` : ""}. That first customer usually comes from people who already know you.`,
  ]
    .filter(Boolean)
    .join(" ");
  return [
    { key: "assumption", title: "Where these numbers come from", text: assumption },
    { key: "level2", title: "Your road to Level 2", text: level2 },
    {
      key: "statics",
      title: "Why 5 statics",
      text: "Meta's Andromeda system groups ads that look alike and treats them as one. Five genuinely different statics give it five real ideas to test. At $5–$10 a day, five is plenty: each one gets a fair shot.",
    },
    {
      key: "target",
      title: "Who to target",
      text: `Broad. ${opts.country ? `${opts.country}, ` : "Your country, "}18 and over, Advantage+ audience on, no interests. Your five pictures do the targeting: each one speaks to a different kind of person.`,
    },
    {
      key: "images",
      title: "What images",
      text: `Five different looks: ${listWords((opts.formats?.length ? opts.formats : DEFAULT_FORMATS).map((f) => FORMAT_WORDS[f]))}. Statics are the safest start: cheap to make and quick to test.`,
    },
    {
      key: "social",
      title: "No social media needed",
      text: `You don't need a following. Your ${money(n.budget)} a day brings the first visitors, and from Level 2 Skool's own Growth engine makes ads for you too (Skool decides that spend).`,
    },
  ];
}

/** The member's real cost per About-page visit: their latest Ad review, else their Monday check-in. */
export async function realCostPerVisit(workspaceId: string): Promise<RealCpv | null> {
  const db = await getDb();
  const [review] = await db
    .select({ input: aiGenerations.input, createdAt: aiGenerations.createdAt })
    .from(aiGenerations)
    .where(and(eq(aiGenerations.workspaceId, workspaceId), eq(aiGenerations.kind, "ad_review")))
    .orderBy(desc(aiGenerations.createdAt))
    .limit(1);
  const spend = Number(review?.input.spend ?? 0);
  const clicks = Number(review?.input.linkClicks ?? 0);
  // Ten clicks is the least that says anything; fewer is noise.
  if (review && spend > 0 && clicks >= 10) return { cpv: clampCpv(spend / clicks), source: "ad_review", at: review.createdAt.toISOString() };
  const [c] = await latestCheckins(workspaceId, 1);
  if (c && c.adSpendPerDay > 0 && c.aboutVisitors >= 30) return { cpv: clampCpv((c.adSpendPerDay * 30) / c.aboutVisitors), source: "checkin", at: c.createdAt.toISOString() };
  return null;
}

// ---------------------------------------------------------------------------
// Meta policy check
// ---------------------------------------------------------------------------

export type PolicyResult = { ok: boolean; flags: string[] };

const POLICY_RULES: { re: RegExp; why: string }[] = [
  { re: /\bare you\b/i, why: "“Are you…?” asks about a personal attribute, which Meta rejects. Describe the situation instead (“For dads who…”)." },
  { re: /\b(?:do|did) you (?:have|suffer|struggle)\b/i, why: "Asking about their problem head-on reads as a personal attribute. Describe the situation instead." },
  {
    re: /\byou(?:'re|’re| are)\s+(?:so\s+|too\s+)?(?:overweight|fat|obese|broke|poor|in debt|depressed|anxious|lonely|single|divorced|sick|ill|old|ugly|unemployed|bald|infertile)\b/i,
    why: "Says what they are (body, money, health or relationships). Meta rejects that.",
  },
  {
    re: /\byour\s+(?:\w+\s+)?(?:weight|belly|body fat|debt|credit score|diabetes|anxiety|depression|acne|divorce|disability|illness|bald(?:ness|ing)?|wrinkles)\b/i,
    why: "Points at a personal attribute (body, money or health). Meta rejects that. Talk about the goal instead.",
  },
  { re: /\b(?:make|makes|made|making|earn|earns|earned|earning|profit|bank|banked|banking)\b[^.!?\n]{0,30}(?:\$|£|€|₹)\s?\d/i, why: "Income claim. Meta rejects promises of money, and we never make them." },
  { re: /(?:\$|£|€|₹)\s?\d[\d,.]*\s?(?:k|m)\b/i, why: "Income claim. Big money figures read as a promise of earnings." },
  { re: /\b(?:six|seven|eight|6|7|8)[- ]figures?\b|\bpassive income\b|\bget rich\b|\bfinancial freedom\b|\bquit your (?:job|9)|\breplace your income\b/i, why: "Income claim. Meta rejects promises of money, and we never make them." },
  { re: /\bguarantee(?:d|s)?\b|\b100% (?:results|success)\b/i, why: "Guaranteed results aren't allowed. Nobody can promise them." },
  {
    re: /\b(?:lose|lost|losing|drop|dropped|shed|melt|burn)\s+(?:up to\s+)?\d+(?:\.\d+)?\s*(?:kg|kgs|kilos?|lbs?|pounds|stone|inches|sizes?)\b/i,
    why: "Weight-loss numbers break Meta's health rules and can't be promised.",
  },
  { re: /["“][^"”]{8,}["”]\s*(?:[-–—]|says|said)\s*[A-Z][a-z]+/, why: "Looks like a quote from a named person. Only use real words from a real member, with their yes." },
  { re: /\b\d[\d,]*\+?\s+(?:members|people|clients|students|dads|moms|mums|women|men|parents)\s+(?:have|already|got|lost|made|joined|love)\b/i, why: "A member count or result we can't check. Only use real numbers." },
  { re: /\b(?:5|five)[- ]stars?\b|\brated\s+(?:#?1|\d(?:\.\d)?)\b/i, why: "Ratings we can't check read as fake reviews." },
];

/** Meta's three big ones for beginners: personal attributes, income claims and fake testimonials. */
export function policyCheck(texts: (string | undefined)[], opts: { angle?: AdAngle; hasProof: boolean }): PolicyResult {
  const all = texts.filter(Boolean).join("\n");
  const flags = new Set<string>();
  for (const r of POLICY_RULES) if (r.re.test(all)) flags.add(r.why);
  if (opts.angle === "proof" && !opts.hasProof) flags.add("A Proof ad needs a real member result. Without one it's a fake testimonial.");
  return { ok: flags.size === 0, flags: [...flags] };
}

// ---------------------------------------------------------------------------
// Your 5 statics
// ---------------------------------------------------------------------------

export type StaticConcept = {
  name: string;
  angle: AdAngle;
  format: StaticFormat;
  /** Who this one speaks to: a different slice of the audience per static. */
  persona: string;
  benefit: string;
  /** The words on the picture, 7 or fewer. */
  onImageText: string;
  hook: string;
  turn: string;
  door: string;
  /** Hook, Turn and Door as one block, ready for Ads Manager's Primary text. */
  primaryText: string;
  headline: string;
  cta: StaticCta;
  /** Ready to paste into ChatGPT, Gemini or Midjourney. Portrait 4:5, 1080×1350. */
  imagePrompt: string;
  /** The 9:16 Stories and Reels variant. */
  storyNote: string;
  designNote: string;
  policy: PolicyResult;
};

const conceptSchema = z.object({
  name: z.string(),
  angle: z.enum(AD_ANGLES),
  format: z.enum(STATIC_FORMATS),
  persona: z.string(),
  benefit: z.string(),
  onImageText: z.string(),
  hook: z.string(),
  turn: z.string(),
  door: z.string(),
  headline: z.string(),
  cta: z.enum(STATIC_CTAS),
  imagePrompt: z.string(),
  storyNote: z.string(),
  designNote: z.string(),
});
export type RawConcept = z.infer<typeof conceptSchema>;

/** Keep the first n words (on-image text has to be readable in half a second). */
export function limitWords(text: string, n = 7): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length <= n) return words.join(" ");
  return words.slice(0, n).join(" ").replace(/[,;:–—-]+$/, "");
}
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const lcFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const ucFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const bare = (s: string) => s.trim().replace(/[.!?]+$/, "");
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** How each tone looks on a "big text on colour" static (the page's sketch uses the same three). */
const TONE_COLOUR: Record<StudioTone, { bg: string; ink: string; accent: string; soft: string }> = {
  friendly: { bg: "warm sunshine yellow", ink: "deep navy", accent: "sunshine yellow", soft: "pale sunshine yellow" },
  bold: { bg: "deep electric violet", ink: "white", accent: "electric violet", soft: "pale violet" },
  calm: { bg: "soft lavender", ink: "deep navy", accent: "soft lavender", soft: "soft lavender" },
};

const STORY_NOTE: Record<StaticFormat, string> = {
  text_on_colour: "9:16 (1080×1920): same colour, words in the middle third, nothing in the top and bottom 250 px.",
  photo_overlay: "9:16 (1080×1920): extend the photo up and down (ask your AI to “expand to 9:16”), keep the text box in the middle.",
  notes_app: "9:16 (1080×1920): a full-height notes screenshot looks even more native. Keep the list in the middle.",
  before_after: "9:16 (1080×1920): stack the halves, old way on top and new way below.",
  checklist: "9:16 (1080×1920): same list with more space between rows. Keep the title below the top 250 px.",
  quote_card: "9:16 (1080×1920): same bubble, centred, with empty space above and below.",
};

type Ctx = { name: string; audience: string; promise: string; proof: string; tone: StudioTone };

function ctxFrom(input: AdStudioInput, fallbackName: string): Ctx {
  const promise = bare(input.promise || input.offer || (input.niche ? `get real progress with ${lcFirst(input.niche)}` : "get real progress, week by week"));
  return {
    name: input.businessName || fallbackName || "our community",
    audience: bare(input.audience || (input.niche ? `people into ${lcFirst(input.niche)}` : "people starting out")),
    promise,
    proof: bare(input.proof),
    tone: input.tone,
  };
}

function finishConcept(c: RawConcept, hasProof: boolean): StaticConcept {
  const onImageText = limitWords(c.onImageText, 7);
  const imagePrompt = /4\s*:\s*5/.test(c.imagePrompt) ? c.imagePrompt.trim() : `${c.imagePrompt.trim()} Portrait 4:5, 1080×1350 px.`;
  const cta = (STATIC_CTAS as readonly string[]).includes(c.cta) ? c.cta : "Learn more";
  const out = {
    name: clip(c.name.trim() || FORMAT_LABEL[c.format], 60),
    angle: c.angle,
    format: c.format,
    persona: clip(c.persona.trim(), 160),
    benefit: clip(c.benefit.trim(), 160),
    onImageText,
    hook: c.hook.trim(),
    turn: c.turn.trim(),
    door: c.door.trim(),
    primaryText: [c.hook, c.turn, c.door].map((s) => s.trim()).filter(Boolean).join("\n\n"),
    headline: clip(c.headline.trim(), 60),
    cta: cta as StaticCta,
    imagePrompt,
    storyNote: c.storyNote.trim() || STORY_NOTE[c.format],
    designNote: c.designNote.trim(),
  };
  const policy = policyCheck([out.onImageText, out.hook, out.turn, out.door, out.headline], { angle: out.angle, hasProof });
  // "No people, no bodies" is fine: drop negated phrases before looking for bodies in the picture.
  const shown = out.imagePrompt.replace(/\b(?:no|never|not|without)\b[^.,;:]*/gi, "");
  if (c.format === "before_after" && /\b(?:body|bodies|belly|waist|shirtless|bikini|weigh)\w*/i.test(shown)) {
    policy.flags.push("Before/after images of bodies are banned by Meta. Show routines or to-do lists instead.");
    policy.ok = false;
  }
  return { ...out, policy };
}

/** One rule-based static per format, filled with the owner's own words. */
function ruleConcept(format: StaticFormat, x: Ctx): RawConcept {
  const colour = TONE_COLOUR[x.tone];
  const door = (lead: string) => `${lead} Tap Learn more to look inside.`;
  switch (format) {
    case "text_on_colour": {
      const words = "Motivation isn't the missing piece.";
      return {
        name: "The real problem",
        angle: "pain",
        format,
        persona: `${ucFirst(x.audience)} who keep starting over`,
        benefit: "A plan that fits a real week",
        onImageText: words,
        hook: `Most ${lcFirst(x.audience)} don't need more motivation.`,
        turn: "They need a plan that fits a real week. And people who notice when they skip a day.",
        door: door(`That's what ${x.name} is: a small Skool community built for exactly that.`),
        headline: "A plan that fits a real week",
        cta: "Learn more",
        imagePrompt: `A bold typographic social media ad. Portrait 4:5, 1080×1350 px. A solid ${colour.bg} background. The words "${words}" in very large, heavy, left-aligned sans-serif type in ${colour.ink}, filling the top two-thirds. A small hand-drawn underline under the last word. Nothing else: no people, no logos, no extra text. Flat, clean and high contrast, easy to read on a phone.`,
        storyNote: STORY_NOTE[format],
        designNote: "The words are the whole ad. If you can read it at arm's length on your phone, it's done.",
      };
    }
    case "photo_overlay": {
      const words = "This could be your new normal.";
      return {
        name: "The after",
        angle: "dream",
        format,
        persona: `${ucFirst(x.audience)} who can already picture the after`,
        benefit: clip(ucFirst(x.promise), 120),
        onImageText: words,
        hook: `Picture this: ${lcFirst(x.promise)}. Not someday. On a normal Tuesday.`,
        turn: "Not because you tried harder. Because you followed one simple plan, with people in your corner who check in.",
        door: door(`That's what we do inside ${x.name}.`),
        headline: clip(ucFirst(x.promise), 40),
        cta: "Learn more",
        imagePrompt: `A candid, natural-light lifestyle photo that looks shot on a phone. Portrait 4:5, 1080×1350 px. One person from this group: ${lcFirst(x.audience)}. Show them in an everyday moment that hints at this result: ${lcFirst(x.promise)}. Warm, real and unposed: no stock-photo smiles, no logos. In the top third, a clean white rounded text box with the words "${words}" in dark, friendly sans-serif type.`,
        storyNote: STORY_NOTE[format],
        designNote: "A real photo of you or your world beats a generated one. Real beats perfect, and it makes the ad yours.",
      };
    }
    case "notes_app": {
      const words = "3 things I'd do first:";
      return {
        name: "The first lesson",
        angle: "lesson",
        format,
        persona: `${ucFirst(x.audience)} who like to learn by doing`,
        benefit: "One thing they can try today",
        onImageText: words,
        hook: "If I were starting from zero today, I'd do 3 things.",
        turn: "1. Pick one small daily habit. 2. Track it for 7 days. 3. Do it with people who notice. Most people skip number 3. It's the one that works.",
        door: door(`Lesson 1 of ${x.name} walks you through all three.`),
        headline: "3 things I'd do first",
        cta: "Learn more",
        imagePrompt: `A realistic iPhone Notes app screenshot in light mode. Portrait 4:5, 1080×1350 px. The note's title is "${words}" in bold system font, followed by a short numbered list: "1. One small habit a day", "2. Track it for 7 days", "3. Do it with people". Plain white note background, the yellow Notes back arrow at the top, no status bar clutter, no other apps. It should look like a real screenshot someone shared.`,
        storyNote: STORY_NOTE[format],
        designNote: "Make it look native, not designed. Screenshots get read because they don't look like ads.",
      };
    }
    case "before_after": {
      const words = "Same week. Different plan.";
      return {
        name: "Old way, new way",
        angle: "pain",
        format,
        persona: `${ucFirst(x.audience)} who tried going it alone`,
        benefit: "People who check in",
        onImageText: words,
        hook: "Same person. Same 24 hours. Two very different weeks.",
        turn: "On the left: guessing, starting over, doing it alone. On the right: one clear plan and a group that checks in. The difference isn't talent.",
        door: door(`See how the right side works inside ${x.name}.`),
        headline: "Same week, different plan",
        cta: "Learn more",
        imagePrompt: `A clean split-screen graphic. Portrait 4:5, 1080×1350 px, split down the middle. Left half in muted grey, labelled "Old way", with a messy hand-written to-do list: "guess", "start over", "do it alone". Right half in fresh ${colour.accent}, labelled "New way", with a tidy checklist: "one plan", "small daily step", "people who check in". Across the top of both halves, the words "${words}" in bold dark type. Simple flat style with big readable labels. No people, no bodies, no logos.`,
        storyNote: STORY_NOTE[format],
        designNote: "Show routines or to-do lists, never bodies or faces. Meta rejects before/after body photos.",
      };
    }
    case "checklist": {
      const words = "Your first 7 days, mapped out.";
      return {
        name: "Your first week",
        angle: "dream",
        format,
        persona: `${ucFirst(x.audience)} who want a clear plan`,
        benefit: "Knowing exactly what to do next",
        onImageText: words,
        hook: "Here's what your first week inside looks like.",
        turn: "Day 1: say hi. Day 2: lesson 1. Day 3: your first small win, shared with the group. No guessing. Every day has one small job.",
        door: door(`Start your week 1 in ${x.name}.`),
        headline: "Your first 7 days, mapped out",
        cta: "Learn more",
        imagePrompt: `A clean checklist infographic. Portrait 4:5, 1080×1350 px. Off-white background. The title "${words}" at the top in large dark sans-serif. Below it, 5 rows with round tick boxes, the first two ticked in ${colour.accent}: "Day 1: say hi", "Day 2: lesson 1", "Day 3: first small win", "Day 5: first check-in", "Day 7: look back". Minimal flat icons, generous spacing, one accent colour. No people, no logos.`,
        storyNote: STORY_NOTE[format],
        designNote: "Keep it to 5 rows. If it needs squinting, cut a row.",
      };
    }
    case "quote_card": {
      const quote = limitWords(x.proof || "A real member result", 6);
      return {
        name: "A real win",
        angle: "proof",
        format,
        persona: `${ucFirst(x.audience)} who want to see it work for someone like them`,
        benefit: "Proof it works for people like them",
        onImageText: `“${quote}”`,
        hook: "A real result from inside the group:",
        turn: `“${x.proof}.” It took real work, and results vary. Here's the plan they followed.`,
        door: door(`The same plan is inside ${x.name}.`),
        headline: "A real result from the group",
        cta: "Learn more",
        imagePrompt: `A simple quote card. Portrait 4:5, 1080×1350 px. A ${colour.soft} background with a large white rounded speech bubble in the centre holding the words "${quote}" in dark sans-serif. Below the bubble, small text: "Real member result". No faces, no names, no logos.`,
        storyNote: STORY_NOTE[format],
        designNote: "Only with a real member's words and their yes. Even better: screenshot their actual message and blur the name.",
      };
    }
  }
}

/** The order rules fill the pack: a Proof card replaces the split when there's a real result. */
const RULE_ORDER = (hasProof: boolean): StaticFormat[] =>
  hasProof ? ["text_on_colour", "photo_overlay", "notes_app", "quote_card", "checklist", "before_after"] : ["text_on_colour", "photo_overlay", "notes_app", "before_after", "checklist"];

export function fallbackStatics(input: AdStudioInput, fallbackName = ""): StaticConcept[] {
  const x = ctxFrom(input, fallbackName);
  const hasProof = Boolean(x.proof);
  return RULE_ORDER(hasProof)
    .slice(0, STATICS_PER_PACK)
    .map((f) => finishConcept(ruleConcept(f, x), hasProof));
}

/**
 * Five statics no matter what the AI sent: one per format (so Andromeda sees five ideas), no
 * Proof without a real result, every field filled. Gaps are filled from the rules.
 */
export function normalizeStatics(raw: unknown[], input: AdStudioInput, fallbackName = ""): StaticConcept[] {
  const hasProof = Boolean(input.proof.trim());
  const used = new Set<StaticFormat>();
  const out: StaticConcept[] = [];
  for (const item of raw) {
    if (out.length >= STATICS_PER_PACK) break;
    const parsed = conceptSchema.safeParse(item);
    if (!parsed.success) continue;
    const c = parsed.data;
    if (used.has(c.format)) continue;
    if ((c.angle === "proof" || c.format === "quote_card") && !hasProof) continue;
    if (![c.onImageText, c.hook, c.turn, c.door, c.headline, c.imagePrompt].every((s) => s.trim())) continue;
    used.add(c.format);
    out.push(finishConcept(c, hasProof));
  }
  const x = ctxFrom(input, fallbackName);
  const fill = [...RULE_ORDER(hasProof), ...STATIC_FORMATS.filter((f) => f !== "quote_card" || hasProof)];
  for (const f of fill) {
    if (out.length >= STATICS_PER_PACK) break;
    if (used.has(f)) continue;
    used.add(f);
    out.push(finishConcept(ruleConcept(f, x), hasProof));
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** In how many of format, persona, angle and benefit two statics differ (Andromeda wants 2+). */
export function differences(a: Pick<StaticConcept, "format" | "persona" | "angle" | "benefit">, b: Pick<StaticConcept, "format" | "persona" | "angle" | "benefit">): number {
  return (["format", "persona", "angle", "benefit"] as const).filter((k) => norm(a[k]) !== norm(b[k])).length;
}

/** Every static as one block of text, for "Copy all". */
export function staticText(c: StaticConcept, i: number): string {
  return [
    `S${i + 1} · ${c.name} (${ANGLE_LABEL[c.angle]}, ${FORMAT_LABEL[c.format]})`,
    `On the image: ${c.onImageText}`,
    `Primary text:\n${c.primaryText}`,
    `Headline: ${c.headline}`,
    `Call to action: ${c.cta}`,
    `Image prompt (4:5, 1080×1350): ${c.imagePrompt}`,
    `Stories/Reels: ${c.storyNote}`,
    `Design note: ${c.designNote}`,
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Video script (for later)
// ---------------------------------------------------------------------------

export type VideoBeat = { part: "Hook" | "Turn" | "Door"; time: string; say: string; caption: string; shot: string };
export type VideoScript = { basedOn: number; angle: AdAngle; title: string; beats: VideoBeat[]; tips: string[]; policy: PolicyResult };

const beatSchema = z.object({ part: z.enum(["Hook", "Turn", "Door"]), time: z.string(), say: z.string(), caption: z.string(), shot: z.string() });
const videoSchema = z.object({ angle: z.enum(AD_ANGLES), title: z.string(), beats: z.array(beatSchema), tips: z.array(z.string()) });
type RawVideo = z.infer<typeof videoSchema>;

const VIDEO_TIPS = [
  "Film vertical (9:16) facing a window for soft light.",
  "Captions on: most people watch on mute. CapCut adds them free.",
  "One take is fine. Real beats polished.",
  "Add it to the same ad set as a 6th ad and leave the statics running.",
];

/** A 20–30 second selfie script from one static's Hook, Turn and Door. */
export function videoFromConcept(c: StaticConcept, index: number, hasProof = true): VideoScript {
  const beats: VideoBeat[] = [
    { part: "Hook", time: "0–2s", say: c.hook, caption: c.onImageText, shot: "Selfie, phone at eye level, arm's length. Start talking on the very first frame: no hello, no intro." },
    { part: "Turn", time: "2–20s", say: c.turn, caption: c.headline, shot: "Same shot, or walk and talk. Cut out every pause (jump cuts are fine)." },
    { part: "Door", time: "20–28s", say: c.door, caption: `Tap ${c.cta} ↓`, shot: "Point down at the button, or hold your phone up showing your Skool About page." },
  ];
  return {
    basedOn: index,
    angle: c.angle,
    title: `${ANGLE_LABEL[c.angle].replace(/ ad$/, "")} video, built on S${index + 1}`,
    beats,
    tips: VIDEO_TIPS,
    policy: policyCheck(beats.flatMap((b) => [b.say, b.caption]), { angle: c.angle, hasProof }),
  };
}

function finishVideo(v: RawVideo | undefined, statics: StaticConcept[], hasProof: boolean): VideoScript {
  const parts = ["Hook", "Turn", "Door"] as const;
  const beats = v ? parts.map((p) => v.beats.find((b) => b.part === p)) : [];
  if (!v || beats.some((b) => !b || !b.say.trim()) || (v.angle === "proof" && !hasProof)) return videoFromConcept(statics[0], 0, hasProof);
  const basedOn = Math.max(0, statics.findIndex((s) => s.angle === v.angle));
  const clean = beats.map((b) => ({ ...b!, say: b!.say.trim(), caption: limitWords(b!.caption, 10), shot: b!.shot.trim() }));
  const tips = v.tips.map((t) => t.trim()).filter(Boolean).slice(0, 5);
  return {
    basedOn,
    angle: v.angle,
    title: v.title.trim() || `${ANGLE_LABEL[v.angle]} video`,
    beats: clean,
    tips: tips.length ? tips : VIDEO_TIPS,
    policy: policyCheck(clean.flatMap((b) => [b.say, b.caption]), { angle: v.angle, hasProof }),
  };
}

export function videoText(v: VideoScript): string {
  return [v.title, ...v.beats.map((b) => `${b.part} (${b.time})\nSay: ${b.say}\nOn screen: ${b.caption}\nShot: ${b.shot}`), `Tips:\n${v.tips.map((t) => `- ${t}`).join("\n")}`].join("\n\n");
}

// ---------------------------------------------------------------------------
// Your launch plan
// ---------------------------------------------------------------------------

export type LaunchStep = { title: string; detail: string };
export type LaunchPlan = { settings: { label: string; value: string }[]; steps: LaunchStep[]; after: LaunchStep[] };

/** Numbered click-steps for Meta Ads Manager. Rules, not AI, so they never drift. */
export function launchPlan(o: { budget: number; country: string; link: string; pixel: boolean; statics: Pick<StaticConcept, "format">[] }): LaunchPlan {
  const b = money(o.budget);
  const names = o.statics.map((s, i) => `S${i + 1} ${FORMAT_LABEL[s.format]}`);
  return {
    settings: [
      { label: "Campaign objective", value: "Traffic" },
      { label: "Performance goal", value: "Maximise number of landing page views" },
      { label: "Ad sets", value: "1" },
      { label: "Audience", value: `${o.country}, 18+, Advantage+ audience on, no interests` },
      { label: "Placements", value: "Advantage+ placements" },
      { label: "Daily budget", value: b },
      { label: "Ads", value: `All ${o.statics.length} statics in that one ad set` },
      { label: "Website URL", value: o.link },
    ],
    steps: [
      { title: "Open Ads Manager", detail: "On a computer, go to adsmanager.facebook.com and click the green + Create button." },
      { title: "Pick Traffic", detail: "Choose Traffic as the campaign objective and click Continue. Name the campaign “Skool link · Traffic”." },
      { title: "Set one daily budget", detail: `Under Budget, choose Daily budget and type ${b}. One campaign, one ad set, one budget.` },
      {
        title: "Send people to your website",
        detail: `In the ad set, set Conversion location to Website and Performance goal to Maximise number of landing page views.${o.pixel ? " Under Dataset, pick your Pixel." : ""}`,
      },
      { title: "Go broad", detail: `In Audience, keep Advantage+ audience on. Set Locations to ${o.country} and the minimum age to 18. Add no interests: your 5 pictures do the targeting.` },
      { title: "Leave placements alone", detail: "Keep Advantage+ placements on. Meta shows your ads where they're cheapest." },
      { title: "Make ad 1", detail: "In the ad, pick your Facebook Page (and Instagram account). Choose Single image or video, upload static S1, paste its Primary text and Headline, and pick its Call to action." },
      { title: "Paste your Skool link", detail: `In Website URL, paste ${o.link}. It's your tracked Skool link: it counts the visit, then opens your Skool About page.` },
      {
        title: `Add the other ${Math.max(0, o.statics.length - 1)}`,
        detail: `Duplicate ad 1 (the three dots next to it) until you have ${o.statics.length} ads. Swap in each static's image and words. Name them ${names.join(", ")}, so Ad review is easy.`,
      },
      { title: "Publish", detail: "Click Publish. Meta reviews new ads, usually within a day." },
    ],
    after: [
      { title: "Hands off till Day 9", detail: "Don't edit, pause or add anything yet. Every change restarts Meta's learning." },
      { title: "Check in Ad review on Day 7", detail: "Copy spend, impressions and link clicks into Ad review. You get keep, fix or kill, and which part to fix. Read it and change nothing: edits wait for Day 9." },
      { title: "Refresh every 1–3 weeks", detail: "When clicks get dearer, come back here and make 5 new statics. Keep the winners." },
      { title: "Add the video on Day 9", detail: "Record the video script on Day 8. On Day 9, add it to the same ad set alongside fresh statics for the ones you killed, so Meta relearns once instead of twice." },
    ],
  };
}

// ---------------------------------------------------------------------------
// The pack
// ---------------------------------------------------------------------------

export type AdStudioPack = {
  summary: string;
  numbers: StudioNumbers;
  statics: StaticConcept[];
  plan: LaunchPlan;
  video: VideoScript;
  /** First lines of the competitor ads studied (we borrow rhythm, never words). */
  inspiration: string[];
  skoolLink: string;
  country: string;
};

const aiSchema = z.object({ summary: z.string(), concepts: z.array(conceptSchema), video: videoSchema });

const SYSTEM = `You are a Meta ads creative strategist for Skool community owners. They run their first ads at $5 to $10 a day, straight to their Skool About page (their Skool link). No social media following needed.
Write 5 static image ads ("statics") for ONE ad set, plus one short selfie video script for later.

Meta's Andromeda system groups near-identical ads together and treats them as one ad. So the 5 statics must be genuinely different:
- Each uses a different format. Formats: ${STATIC_FORMATS.map((f) => `${f} (${FORMAT_BRIEF[f]})`).join("; ")}.
- Each speaks to a different persona: a different slice of the owner's audience, described in a few words.
- Mix the angles and benefits. Every pair of statics must differ in at least two of: format, persona, angle, benefit.
- Angles: pain, dream, lesson. Use proof (and quote_card) only if a real member result is given below, and then only with those exact facts.

${AD_FRAMEWORK_RULES}

Each static has:
- name: a 2-4 word nickname.
- onImageText: the words on the picture, 7 words or fewer.
- hook, turn, door: the primary text in three short parts. The door is one way in: tap the button to look inside the Skool community. Never "DM me" or "follow me".
- headline: under 40 characters. cta: one of ${STATIC_CTAS.join(", ")} ("Learn more" is the safe default).
- imagePrompt: a complete prompt to paste into ChatGPT, Gemini or Midjourney: the scene, style, colours, and where the on-image words go (write them in quotes). Portrait 4:5, 1080×1350 px. No logos, brand names or real people's likeness. Before/after splits show routines or to-do lists, never bodies.
- storyNote: one line on the 9:16 (1080×1920) Stories and Reels version.
- designNote: one line a beginner can act on.

The video: a 20-30 second selfie script on the angle you think will win. Exactly three beats: Hook (0-2s), Turn, Door. Each beat has what to say, the on-screen caption and the shot. Add 2-4 short filming tips.

Meta ad policy, always: never "Are you…?" or any wording that asserts or implies personal attributes (health, body, money, age, identity); no income or earnings claims; no guaranteed results; no invented testimonials, member counts, ratings or numbers.
${VOICE_RULES}
summary: one or two sentences on why these five, in plain words.`;

function buildPrompt(input: AdStudioInput, name: string, link: string) {
  const ads = input.competitorAds.slice(0, 8);
  return `Community: ${name}.
Niche: ${input.niche || "unknown"}.
Offer: ${input.offer || "a paid Skool community"}.${input.price ? ` Price: $${input.price} a month.` : ""}
Who it's for, in the owner's words: ${input.audience || "unknown"}.
The result they promise: ${input.promise || "unknown"}.
Real member result: ${input.proof || "none yet (so no proof angle and no quote_card)"}.
Tone: ${input.tone}. Country: ${countryLabel(input.country)}. Daily budget: $${input.budget}.
Ads send people to ${link} (it opens the Skool About page).
${
  ads.length
    ? `Long-running competitor ads the owner picked (days running, page, text). Study the rhythm of their hooks and their angles; never copy their wording, names, results or claims:
${ads.map((a, i) => `${i + 1}. [${a.daysRunning} days] ${a.page}: ${a.text.slice(0, 600)}`).join("\n")}`
    : "No competitor ads given."
}`;
}

function firstLines(ads: ResearchAd[]) {
  return [...ads]
    .sort((a, b) => b.daysRunning - a.daysRunning)
    .map((a) => clip(a.text.split(/(?<=[.!?])\s/)[0] ?? "", 120))
    .filter((s) => s.length > 6)
    .slice(0, 3);
}

/** Rule-based summary for a pack the AI didn't write. */
function ruleSummary(input: AdStudioInput) {
  const top = [...input.competitorAds].sort((a, b) => b.daysRunning - a.daysRunning)[0];
  return [
    "A quick pack built from your answers: five different formats for five different kinds of people, so Meta tests five real ideas.",
    top ? `The longest-running competitor ad you picked (${top.daysRunning} days) is in the notes below: borrow its rhythm, never its words.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

type WsRow = typeof workspaces.$inferSelect;

/** Blanks in the form are filled from the workspace, so a one-click run still knows the business. */
function withWorkspace(input: AdStudioInput, ws: WsRow): AdStudioInput {
  const s = ws.settings;
  return {
    ...input,
    businessName: input.businessName || s.businessName || ws.name,
    niche: input.niche || s.niche || "",
    offer: input.offer || s.offer || "",
    audience: input.audience || s.audience || "",
  };
}

export type MakePackResult = { ok: true; id: string; pack: AdStudioPack; model: string; warning?: string } | { ok: false; error: string };

/**
 * Make and save an Ad studio pack. The creative runs on the member's own AI when connected (or the
 * platform's, metered); `written` is for a connected AI app (MCP) that wrote the statics itself;
 * `useAi: false` gives the rule-based pack without calling any AI.
 */
export async function makeAdStudioPack(
  workspaceId: string,
  raw: unknown,
  opts: { written?: { statics: unknown[]; video?: unknown; summary?: string }; useAi?: boolean; researchId?: string } = {},
): Promise<MakePackResult> {
  const parsed = adStudioInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Check your answers and try again: a daily budget of at least $1, and a country." };
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!ws) return { ok: false, error: "Workspace not found." };
  const input = withWorkspace(parsed.data, ws);
  const hasProof = Boolean(input.proof);
  const link = skoolLinkFor(ws.slug);
  const numbers = studioNumbers(input.budget, await realCostPerVisit(workspaceId));

  let statics = fallbackStatics(input, ws.name);
  let video = videoFromConcept(statics[0], 0, hasProof);
  let summary = ruleSummary(input);
  let model = "rules";
  let warning: string | undefined;

  if (opts.written) {
    statics = normalizeStatics(opts.written.statics, input, ws.name);
    const v = videoSchema.safeParse(opts.written.video);
    video = finishVideo(v.success ? v.data : undefined, statics, hasProof);
    summary = clip(opts.written.summary?.trim() || "Written by your AI.", 600);
    model = "connected AI app";
  } else if (opts.useAi !== false) {
    const charge = await chargeAi(workspaceId, "ai_generation", "AI Ad studio pack");
    if (!charge && env.aiEnabled) warning = "You've used this month's AI generations, so this is the quick pack. Add a free AI key in Your AI to go unlimited.";
    if (charge) {
      try {
        const res = await generateStructured({
          workspaceId,
          creds: charge.creds,
          effort: "medium",
          maxTokens: 14000,
          schema: aiSchema,
          system: SYSTEM,
          prompt: buildPrompt(input, input.businessName, link),
        });
        statics = normalizeStatics(res.data.concepts, input, ws.name);
        video = finishVideo(res.data.video, statics, hasProof);
        summary = clip(res.data.summary.trim(), 600) || summary;
        model = res.usage.model;
      } catch (err) {
        await refundAi(workspaceId, "ai_generation", charge, "Refund: AI Ad studio pack failed");
        warning = `${describeAiError(err)} Showing the quick pack instead.`;
      }
    }
  }

  const pack: AdStudioPack = {
    summary,
    numbers,
    statics,
    plan: launchPlan({ budget: numbers.budget, country: countryLabel(input.country), link, pixel: Boolean(ws.settings.metaPixelId), statics }),
    video,
    inspiration: firstLines(input.competitorAds),
    skoolLink: link,
    country: countryLabel(input.country),
  };
  const [row] = await db
    .insert(aiGenerations)
    .values({
      workspaceId,
      kind: "ad_studio",
      input: { ...input, ...(opts.researchId ? { researchId: opts.researchId } : {}) } as unknown as Record<string, unknown>,
      output: pack as unknown as Record<string, unknown>,
      model,
    })
    .returning({ id: aiGenerations.id });
  return { ok: true, id: row.id, pack, model, warning };
}

// ---------------------------------------------------------------------------
// For the page: prefill and saved packs
// ---------------------------------------------------------------------------

export type StudioRow = { id: string; createdAt: Date; model: string; input: Partial<AdStudioInput>; pack: AdStudioPack };

export async function listAdStudioPacks(workspaceId: string, limit = 10): Promise<StudioRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(aiGenerations)
    .where(and(eq(aiGenerations.workspaceId, workspaceId), eq(aiGenerations.kind, "ad_studio")))
    .orderBy(desc(aiGenerations.createdAt))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, model: r.model, input: r.input as Partial<AdStudioInput>, pack: r.output as unknown as AdStudioPack }));
}

export async function getAdStudioPack(workspaceId: string, id: string): Promise<StudioRow | null> {
  const db = await getDb();
  const [r] = await db
    .select()
    .from(aiGenerations)
    .where(and(eq(aiGenerations.workspaceId, workspaceId), eq(aiGenerations.kind, "ad_studio"), eq(aiGenerations.id, id)))
    .limit(1);
  return r ? { id: r.id, createdAt: r.createdAt, model: r.model, input: r.input as Partial<AdStudioInput>, pack: r.output as unknown as AdStudioPack } : null;
}

/** The latest Ad research run's ads, longest-running first, so the owner can pick a few. */
export async function latestResearchAds(workspaceId: string): Promise<{ id: string; query: string; createdAt: Date; ads: ResearchAd[] } | null> {
  const db = await getDb();
  const rows = await db
    .select({ id: aiGenerations.id, input: aiGenerations.input, createdAt: aiGenerations.createdAt })
    .from(aiGenerations)
    .where(and(eq(aiGenerations.workspaceId, workspaceId), eq(aiGenerations.kind, "ad_research")))
    .orderBy(desc(aiGenerations.createdAt))
    .limit(5);
  for (const r of rows) {
    const ads = Array.isArray(r.input.ads) ? (r.input.ads as ResearchAd[]).filter((a) => a && typeof a.text === "string" && a.text.length > 10) : [];
    if (ads.length) return { id: r.id, query: String(r.input.query ?? ""), createdAt: r.createdAt, ads: [...ads].sort((a, b) => b.daysRunning - a.daysRunning).slice(0, 8) };
  }
  return null;
}

/** What the form starts with: the last pack's answers, else the workspace and the launch kit. */
export async function adStudioDefaults(ws: WsRow): Promise<AdStudioInput> {
  const db = await getDb();
  const [last] = await listAdStudioPacks(ws.id, 1);
  const [kit] = await db
    .select({ input: aiGenerations.input })
    .from(aiGenerations)
    .where(and(eq(aiGenerations.workspaceId, ws.id), eq(aiGenerations.kind, "launch_kit")))
    .orderBy(desc(aiGenerations.createdAt))
    .limit(1);
  const s = ws.settings;
  const prev = last?.input ?? {};
  const base = adStudioInputSchema.parse({});
  return {
    ...base,
    businessName: String(prev.businessName || s.businessName || ws.name),
    niche: String(prev.niche || s.niche || ""),
    offer: String(prev.offer || s.offer || ""),
    audience: String(prev.audience || s.audience || kit?.input.audience || ""),
    promise: String(prev.promise || kit?.input.outcome || ""),
    proof: String(prev.proof || ""),
    price: Number(prev.price) || 0,
    budget: Number(prev.budget) || 5,
    country: typeof prev.country === "string" && /^[A-Z]{2}$/.test(prev.country) ? prev.country : "US",
    tone: STUDIO_TONES.includes(prev.tone as StudioTone) ? (prev.tone as StudioTone) : base.tone,
  };
}

/** Rule-based "is this pack sound?" check, used by tests and the MCP tool's reply. */
export function packProblems(statics: StaticConcept[]): string[] {
  const problems: string[] = [];
  if (statics.length !== STATICS_PER_PACK) problems.push(`Expected ${STATICS_PER_PACK} statics, got ${statics.length}.`);
  statics.forEach((s, i) => {
    if (wordCount(s.onImageText) > 7) problems.push(`S${i + 1}: on-image text is over 7 words.`);
    statics.slice(i + 1).forEach((t, j) => {
      if (differences(s, t) < 2) problems.push(`S${i + 1} and S${i + j + 2} are too alike for Andromeda.`);
    });
  });
  return problems;
}
