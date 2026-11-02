import * as z from "zod/v4";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations, workspaces } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { VOICE_RULES, chargeAi, describeAiError, generateStructured, refundAi } from "./client";

// Competitor ad research: read what's running in the Meta Ad Library (or ads the owner pasted),
// find the patterns behind the long-runners, and write 3 ads for the owner that point at their
// Skool About page. The owner's own words and offer stay at the centre; we never copy an ad.

export type ResearchAd = { page: string; text: string; daysRunning: number };

const analysisSchema = z.object({
  summary: z.string(),
  winners: z.array(z.object({ page: z.string(), daysRunning: z.number(), why: z.string() })),
  hooks: z.array(z.string()),
  angles: z.array(z.string()),
  offers: z.array(z.string()),
  gaps: z.array(z.string()),
  drafts: z.array(z.object({ hook: z.string(), primaryText: z.string(), headline: z.string(), creativeIdea: z.string() })),
});
export type AdAnalysis = z.infer<typeof analysisSchema>;

const clean = (ads: ResearchAd[]) =>
  ads
    .map((a) => ({ page: a.page.slice(0, 80), text: a.text.replace(/\s+/g, " ").trim().slice(0, 1200), daysRunning: Math.max(0, Math.round(a.daysRunning) || 0) }))
    .filter((a) => a.text.length > 10)
    .slice(0, 25);

/** Paste format: ads separated by a blank line or "---". "[45 days]" anywhere marks how long it ran. */
export function parsePastedAds(raw: string): ResearchAd[] {
  return raw
    .split(/\n\s*(?:-{3,}|\n)\s*/)
    .map((block) => {
      const days = Number(block.match(/\[(\d{1,4})\s*d(?:ays?)?\]/i)?.[1] ?? 0);
      return { page: "pasted", text: block.replace(/\[\d{1,4}\s*d(?:ays?)?\]/i, "").trim(), daysRunning: days };
    })
    .filter((a) => a.text.length > 10);
}

export function fallbackAnalysis(ads: ResearchAd[], offer: string): AdAnalysis {
  const sorted = [...ads].sort((a, b) => b.daysRunning - a.daysRunning);
  const firstLines = sorted.map((a) => a.text.split(/(?<=[.!?])\s/)[0]).filter(Boolean).slice(0, 5);
  return {
    summary: "AI isn't on, so this is a quick read: the ads running longest are usually the ones that pay for themselves. Study their first line and their offer.",
    winners: sorted.slice(0, 3).map((a) => ({ page: a.page, daysRunning: a.daysRunning, why: "Still running after a long time, so it likely makes money." })),
    hooks: firstLines,
    angles: [],
    offers: [],
    gaps: ["Add your own face and a specific result. Most ads in a niche sound the same."],
    drafts: [
      {
        hook: `Want ${offer || "the result"} without the guesswork?`,
        primaryText: `Join people who want ${offer || "the same result"}. Free to look around. Tap to see what's inside.`,
        headline: "See what's inside",
        creativeIdea: "A 20-second selfie video. Say the hook in the first 2 seconds.",
      },
    ],
  };
}

export async function analyzeCompetitorAds(workspaceId: string, input: { ads: ResearchAd[]; query: string }) {
  const ads = clean(input.ads);
  if (ads.length === 0) return { ok: false as const, error: "Add at least one ad to analyse." };
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const s = ws?.settings ?? {};
  let analysis = fallbackAnalysis(ads, s.offer ?? "");
  let model = "rules";
  let warning: string | undefined;

  const charge = await chargeAi(workspaceId, "ai_generation", "AI competitor ad research");
  if (!charge && env.aiEnabled) warning = "You've used this month's AI generations, so this is the quick read. Add your own AI key in Settings to go unlimited.";
  if (charge) {
    try {
      const res = await generateStructured({
        workspaceId,
        effort: "medium",
        maxTokens: 12000,
        schema: analysisSchema,
        system: `You are a direct-response ad strategist for Skool community owners who grow with paid Meta ads instead of a social media following.
You study competitor ads from the Meta Ad Library. Ads running for a long time are usually profitable, so weight them most.
Find patterns: hooks (first lines), angles (the problem or desire), offers (what the click gets you), and gaps nobody is using.
Then write exactly 3 original ads for the owner. Never copy a competitor's wording, names, results or claims. The ads send people to the owner's Skool About page.
${VOICE_RULES}
Give 3-5 items in each list. "why" is one sentence.`,
        prompt: `Owner: ${s.businessName || ws?.name || ""}. Niche: ${s.niche || "unknown"}. Offer: ${s.offer || "a paid Skool community"}. Audience: ${s.audience || "unknown"}.
Search: ${input.query || "pasted ads"}.
Competitor ads (days running, page, text):
${ads.map((a, i) => `${i + 1}. [${a.daysRunning} days] ${a.page}: ${a.text}`).join("\n")}`,
      });
      analysis = res.data;
      model = res.usage.model;
    } catch (err) {
      await refundAi(workspaceId, "ai_generation", charge, "Refund: AI competitor ad research failed");
      warning = `${describeAiError(err)} Showing the quick read instead.`;
    }
  }
  const [row] = await db
    .insert(aiGenerations)
    .values({ workspaceId, kind: "ad_research", input: { query: input.query, ads }, output: analysis as unknown as Record<string, unknown>, model })
    .returning({ id: aiGenerations.id });
  return { ok: true as const, id: row.id, analysis, warning };
}
