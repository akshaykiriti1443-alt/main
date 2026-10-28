import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import { aiGenerations, workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { aiCostMicros } from "../pricing";
import { canAfford, chargeUsage } from "../wallet";
import { describeAiError, generateStructured, VOICE_RULES } from "./client";

export const adReviewInputSchema = z.object({
  spend: z.coerce.number().min(0),
  impressions: z.coerce.number().int().min(0),
  linkClicks: z.coerce.number().int().min(0),
  leads: z.coerce.number().int().min(0),
  followers: z.coerce.number().int().min(0).default(0),
  members: z.coerce.number().int().min(0).default(0),
  days: z.coerce.number().int().min(1).max(90).default(3),
  goal: z.string().max(300).default(""),
  notes: z.string().max(1500).default(""),
});
export type AdReviewInput = z.infer<typeof adReviewInputSchema>;

const reviewSchema = z.object({
  verdict: z.string(),
  metrics: z.array(z.object({ name: z.string(), value: z.string(), status: z.enum(["good", "ok", "fix"]), note: z.string() })),
  actions: z.array(z.object({ title: z.string(), detail: z.string() })),
  nextBudgetUsdPerDay: z.number(),
});
export type AdReview = z.infer<typeof reviewSchema>;

export function computeMetrics(i: AdReviewInput) {
  const ctr = i.impressions ? (i.linkClicks / i.impressions) * 100 : 0;
  const cpm = i.impressions ? (i.spend / i.impressions) * 1000 : 0;
  const cpc = i.linkClicks ? i.spend / i.linkClicks : 0;
  const cpl = i.leads ? i.spend / i.leads : 0;
  const optIn = i.linkClicks ? (i.leads / i.linkClicks) * 100 : 0;
  const cpf = i.followers ? i.spend / i.followers : 0;
  return { ctr, cpm, cpc, cpl, optIn, cpf };
}

// Rule-based review that mirrors the sprint's "keep / fix" table.
export function ruleReview(i: AdReviewInput): AdReview {
  const m = computeMetrics(i);
  const metrics: AdReview["metrics"] = [
    { name: "Link click-through", value: `${m.ctr.toFixed(2)}%`, status: m.ctr >= 1 ? "good" : m.ctr >= 0.8 ? "ok" : "fix", note: "Aim for 1% or more. Under 0.8% means a new hook." },
    { name: "Cost per click", value: `$${m.cpc.toFixed(2)}`, status: m.cpc && m.cpc <= 1 ? "good" : m.cpc <= 2 ? "ok" : "fix", note: "Lower is better. New creatives bring it down." },
    { name: "Page opt-in rate", value: `${m.optIn.toFixed(1)}%`, status: m.optIn >= 25 ? "good" : m.optIn >= 15 ? "ok" : "fix", note: "Aim for 25%+. Under 15% means a new headline." },
    { name: "Cost per lead", value: i.leads ? `$${m.cpl.toFixed(2)}` : "no leads yet", status: i.leads && m.cpl <= 5 ? "good" : i.leads && m.cpl <= 10 ? "ok" : "fix", note: "Aim for under $5 to start." },
  ];
  if (i.followers) {
    metrics.push({ name: "Cost per follower", value: `$${m.cpf.toFixed(2)}`, status: m.cpf <= 0.5 ? "good" : m.cpf <= 1 ? "ok" : "fix", note: "Aim for under $0.50." });
  }
  const actions: AdReview["actions"] = [];
  if (m.ctr < 0.8) actions.push({ title: "Test 3 new hooks", detail: "Keep the same video body. Change only the first 2 seconds." });
  if (m.optIn < 15 && i.linkClicks > 20) actions.push({ title: "Rewrite your headline", detail: "Lead with the result and the time frame." });
  if (i.leads && m.cpl <= 5) actions.push({ title: "Scale the winner", detail: "Raise the best ad set's budget by 20% every 2-3 days." });
  if (!actions.length) actions.push({ title: "Keep collecting data", detail: "Let ads run 3 more days before big changes." });
  const perDay = i.spend / i.days;
  return {
    verdict: i.leads && m.cpl <= 5 ? "Your funnel works. Scale it slowly." : "Fix the weakest number first, then scale.",
    metrics,
    actions,
    nextBudgetUsdPerDay: Math.round((i.leads && m.cpl <= 5 ? perDay * 1.2 : perDay) * 100) / 100,
  };
}

export async function runAdReview(workspaceId: string, raw: unknown) {
  const parsed = adReviewInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Check your numbers and try again." };
  const input = parsed.data;
  let review = ruleReview(input);
  let model = "rules";
  let warning: string | undefined;
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (env.aiEnabled && (await canAfford(workspaceId, "ai_generation"))) {
    try {
      const m = computeMetrics(input);
      const res = await generateStructured({
        effort: "medium",
        maxTokens: 8000,
        schema: reviewSchema,
        system: `You are a Meta ads coach for Skool community owners. Review a beginner's numbers and give a short, specific plan.
Benchmarks to judge against: link CTR 1%+ is good (under 0.8% needs a new hook); landing page opt-in 25%+ is good (under 15% needs a new headline); cost per lead under $5 is a good start; cost per follower under $0.50 is good. Scale winners by 20% every 2-3 days.
${VOICE_RULES}
Give 3 to 5 actions.`,
        prompt: `Business: ${ws?.settings.businessName ?? ""} (${ws?.settings.niche ?? "coaching"}).
Last ${input.days} days: spend $${input.spend}, impressions ${input.impressions}, link clicks ${input.linkClicks}, leads ${input.leads}, new followers ${input.followers}, new members ${input.members}.
Computed: CTR ${m.ctr.toFixed(2)}%, CPM $${m.cpm.toFixed(2)}, CPC $${m.cpc.toFixed(2)}, opt-in ${m.optIn.toFixed(1)}%, cost per lead ${input.leads ? `$${m.cpl.toFixed(2)}` : "n/a"}.
Goal: ${input.goal || "more paying members"}.
Notes from the owner: ${input.notes || "none"}`,
      });
      review = res.data;
      model = res.usage.model;
      await chargeUsage(workspaceId, "ai_generation", 1, {
        description: "AI ad review",
        costMicros: aiCostMicros(res.usage.inputTokens, res.usage.outputTokens),
      }).catch(() => undefined);
    } catch (err) {
      warning = `${describeAiError(err)} Showing the rule-based review instead.`;
    }
  }
  const [row] = await db
    .insert(aiGenerations)
    .values({ workspaceId, kind: "ad_review", input, output: review as unknown as Record<string, unknown>, model })
    .returning({ id: aiGenerations.id });
  return { ok: true as const, id: row.id, review, warning };
}
