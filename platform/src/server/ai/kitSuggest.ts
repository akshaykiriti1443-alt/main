import * as z from "zod/v4";
import { env } from "@/lib/env";
import { midSentence } from "@/lib/util";
import { takeRateLimit } from "../rateLimit";
import { businessContext, contextLines, type BusinessContext } from "./businessContext";
import { VOICE_RULES, chargeAi, describeAiError, generateStructured, refundAi } from "./client";
import { LEAD_MAGNET_FRAMEWORKS, frameworkOf } from "./launchKit";
import { COVER_HEADLINE_MAX, prizeHeadline } from "../cover/cleanText";

// The "Suggest" buttons on the launch kit form: 2 or 3 answers to pick from, from the member's niche
// (and whatever else they already told us). Clicking one only fills the box; nothing is saved.

export const KIT_SUGGEST_FIELDS = ["audience", "outcome", "leadMagnetIdea", "coverHeadline"] as const;
export type KitSuggestField = (typeof KIT_SUGGEST_FIELDS)[number];

export const kitSuggestRequestSchema = z.object({
  field: z.enum(KIT_SUGGEST_FIELDS),
  /** What's in the form's boxes right now, so a suggestion fits what they just typed. */
  businessName: z.string().trim().max(80).catch(""),
  niche: z.string().trim().max(160).catch(""),
  audience: z.string().trim().max(200).catch(""),
  outcome: z.string().trim().max(200).catch(""),
  leadMagnetFramework: z.enum(["domino", "wide"]).optional().catch(undefined),
});
/** Every box but `field` may be missing or blank: the schema turns those into "". */
export type KitSuggestRequest = {
  field: KitSuggestField;
  businessName?: string;
  niche?: string;
  audience?: string;
  outcome?: string;
  leadMagnetFramework?: "domino" | "wide";
};

export type KitSuggestResult = { ok: true; options: string[]; usedAi: boolean; note?: string } | { ok: false; error: string };

export const KIT_SUGGEST_NO_AI = "No AI is connected yet, so these are starter ideas, not written by AI. Add a free Gemini key in Your AI for ideas written around you.";
export const KIT_SUGGEST_NO_RUNS = "You've used your free AI runs for this month, so these are starter ideas, not written by AI. Add a free Gemini key in Your AI, then press Suggest again.";
export const KIT_SUGGEST_NEEDS_NICHE = "Type what you help with first (Step 2), then press Suggest.";

/** Each box's job and its length (the form's own maxLength). */
const GUIDE: Record<KitSuggestField, { what: string; max: number }> = {
  audience: { what: 'who the community is for: one specific group of people, under 12 words, like "Dads 30-50 with desk jobs"', max: 200 },
  outcome: { what: 'the result members want: specific and believable, under 14 words, like "Lose 10 lbs in 8 weeks without a gym"', max: 200 },
  leadMagnetIdea: { what: 'a name for the free checklist people get for their email: under 8 words, like "The 7-Day Dad Reset"', max: 200 },
  coverHeadline: {
    what: `the big words on their Skool group's cover picture: the result members get (the Prize) in 4 to 8 words, like "Strong in 3 sessions a week". Use a number or a time only if the business details above already give one; never invent one. No group name, no price, no free trial`,
    max: COVER_HEADLINE_MAX,
  },
};

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lower = midSentence;
const titleCase = (s: string) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1));

/** "fat loss for busy dads" → topic "fat loss", who "busy dads". */
function splitNiche(niche: string): { topic: string; who: string } {
  const n = niche.trim().replace(/[.\s]+$/, "");
  const m = n.match(/^(.+?)\s+for\s+(.+)$/i);
  return m ? { topic: lower(m[1]), who: lower(m[2]) } : { topic: lower(n), who: "" };
}

/** Starter answers built only from the niche. Used when no AI can run. Never empty when there's a niche. */
export function fallbackKitSuggestions(field: KitSuggestField, c: Pick<BusinessContext, "niche" | "audience"> & { outcome?: string }): string[] {
  const { topic, who } = splitNiche(c.niche);
  if (!topic) return [];
  switch (field) {
    case "audience":
      return who
        ? [`${cap(who)} who are just starting out`, `${cap(who)} who've tried before and got stuck`, `${cap(who)} who want a simple plan they can stick to`]
        : [`Beginners who want help with ${topic}`, `People who've tried ${topic} before and got stuck`, `Busy people who want a simple plan for ${topic}`];
    case "outcome":
      return [`Make real progress with ${topic} in the next 30 days`, `A simple ${topic} routine they stick to every week`, `Their first win with ${topic} in 7 days`];
    case "leadMagnetIdea": {
      const t = titleCase(topic).slice(0, 60);
      return [`The 7-Day ${t} Quick-Start`, `The ${t} Starter Checklist`, `5 ${t} Mistakes to Fix This Week`];
    }
    case "coverHeadline": {
      // Only their own words and numbers: a short form of their result, then plain ideas from the topic.
      const fromOutcome = prizeHeadline(c.outcome ?? "");
      const ideas = [fromOutcome, `${cap(topic)}, made simple`, `${cap(topic)} without the guesswork`, `Your ${topic} plan that sticks`];
      return ideas.filter((s) => s && s.length <= COVER_HEADLINE_MAX).slice(0, 3);
    }
  }
}

/** One option, cleaned so it drops straight into the box. */
export function cleanSuggestion(field: KitSuggestField, raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(field === "leadMagnetIdea" ? /[.\s]+$/ : /\s+$/, "")
    .trim()
    .slice(0, GUIDE[field].max);
}

/** Two or three different, clean options. */
export function tidySuggestions(field: KitSuggestField, raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const s = cleanSuggestion(field, r);
    const key = s.toLowerCase();
    if (s.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.slice(0, 3);
}

const optionsSchema = z.object({ options: z.array(z.string()) });

const SYSTEM = `You help a beginner coach fill in the form for their launch kit: a free checklist, a website and a paid Skool group.
Suggest exactly 3 different answers for one box on the form. Each answer must work on its own, dropped straight into the box.
${VOICE_RULES}
Never mention a price, a free trial or a number of members.`;

/**
 * "Suggest" beside a launch kit box: three answers to pick from, on the member's AI (own key or
 * included runs). With no AI, starter ideas from their niche plus a plain note on how to get AI.
 */
export async function suggestKitAnswer(workspaceId: string, raw: KitSuggestRequest): Promise<KitSuggestResult> {
  const parsed = kitSuggestRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That box can't be suggested for you." };
  const req = parsed.data;
  const saved = await businessContext(workspaceId);
  // What's in the form now wins over what was saved before.
  const ctx: BusinessContext = {
    ...saved,
    businessName: req.businessName || saved.businessName,
    niche: req.niche || saved.niche,
    audience: req.audience || saved.audience,
    outcome: req.outcome || saved.outcome,
  };
  if (!ctx.niche) return { ok: false, error: KIT_SUGGEST_NEEDS_NICHE };
  const fallback = fallbackKitSuggestions(req.field, ctx);
  if (!(await takeRateLimit(`kit-suggest:${workspaceId}`, [{ seconds: 60, max: 15 }, { seconds: 86_400, max: 200 }]))) {
    return { ok: false, error: "That's a lot of suggestions in a row. Wait a minute, then try again." };
  }

  const charge = await chargeAi(workspaceId, "ai_assist", "AI launch kit suggestion");
  if (!charge) return { ok: true, options: fallback, usedAi: false, note: env.aiEnabled ? KIT_SUGGEST_NO_RUNS : KIT_SUGGEST_NO_AI };
  const guide = GUIDE[req.field];
  // The box being suggested isn't sent back as a fact, so the AI offers fresh answers, not the one already typed.
  const known = contextLines({ ...ctx, [req.field === "leadMagnetIdea" ? "leadMagnetName" : req.field]: "" });
  try {
    const res = await generateStructured({
      workspaceId,
      creds: charge.creds,
      system: SYSTEM,
      prompt: `About the business:
${known}
${req.field === "leadMagnetIdea" ? `\nHow the free checklist works: ${LEAD_MAGNET_FRAMEWORKS[frameworkOf(req.leadMagnetFramework)].prompt}\n` : ""}
Box to fill: ${guide.what}. At most ${guide.max} characters each.
Give 3 different options in "options".`,
      schema: optionsSchema,
      effort: "low",
      maxTokens: 1500,
    });
    const options = tidySuggestions(req.field, res.data.options);
    if (options.length < 2) throw new Error("The AI didn't give enough ideas. Please try again.");
    return { ok: true, options, usedAi: true };
  } catch (err) {
    await refundAi(workspaceId, "ai_assist", charge, "Refund: AI launch kit suggestion failed");
    return { ok: true, options: fallback, usedAi: false, note: `${describeAiError(err)} Here are starter ideas instead.` };
  }
}
