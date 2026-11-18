import * as z from "zod/v4";
import { env } from "@/lib/env";
import { midSentence, startsWithAction } from "@/lib/util";
import { takeRateLimit } from "../rateLimit";
import { businessContext, contextLines, type BusinessContext } from "./businessContext";
import { VOICE_RULES, chargeAi, describeAiError, generateStructured, refundAi } from "./client";

/** What "Suggest an unlock" fills in. The reward link stays the member's own. */
export type UnlockSuggestion = { title: string; reward: string; action: "post" | "comment"; instructions: string };

export type SuggestUnlockResult = { ok: true; suggestion: UnlockSuggestion; usedAi: boolean; note?: string } | { ok: false; error: string };

export const UNLOCK_SUGGEST_NO_AI = "No AI is connected yet, so this is a starter idea, not written by AI. Add a free Gemini key in Your AI for ideas written around your group.";
export const UNLOCK_SUGGEST_LIMITED = "That's a lot of unlock ideas in a row. Wait a minute, then press Suggest an unlock again.";
const UNLOCK_SUGGEST_LIMITS = [
  { seconds: 60, max: 15 },
  { seconds: 86_400, max: 200 },
];
export const UNLOCK_SUGGEST_NO_RUNS ="You've used your free AI runs for this month, so this is a starter idea, not written by AI. Add a free Gemini key in Your AI, then press Suggest an unlock again.";

const suggestionSchema = z.object({
  title: z.string(),
  reward: z.string(),
  action: z.enum(["post", "comment"]),
  instructions: z.string(),
});

const SYSTEM = `You help a Skool community owner reward engagement. An "unlock" is a small free thing a member gets for one post or comment in the owner's Skool group.
Suggest ONE unlock that fits this community.
- title: the free thing's name, under 60 characters, like "The 7-day starter plan". Pick something small the owner can make in an hour (a checklist, a template, a short lesson, a swipe file).
- reward: one line about it, under 120 characters.
- action: "post" when members make their own post, "comment" when they comment on the owner's post.
- instructions: what the member writes, answerable in under 2 minutes, under 160 characters. It becomes step 1 of the Skool post.

${VOICE_RULES}`;

const clip = (s: string, n: number) => s.trim().replace(/\s+/g, " ").slice(0, n);
const bare = (s: string) => s.trim().replace(/\s+/g, " ").replace(/[.!?\s]+$/, "");

/**
 * The no-AI idea, built from what the member already told us. Never empty. Reads as plain English whatever
 * shape their words take: a short thing ("fat loss") goes in front ("My fat loss starter checklist"); an
 * action or a long phrase goes after ("My starter checklist for getting strong in 3 gym sessions a week").
 */
export function fallbackUnlock(c: Pick<BusinessContext, "niche" | "outcome" | "audience" | "leadMagnetName">): UnlockSuggestion {
  const topic = c.niche ? midSentence(bare(c.niche)) : "";
  const thing = Boolean(topic) && !startsWithAction(topic) && topic.split(" ").length <= 3;
  const goal = c.outcome ? midSentence(bare(c.outcome)) : "";
  // "to get strong", "toward getting strong", "toward your first 10 clients".
  const toGoal = goal && (startsWithAction(goal) && !/^\S+ing\b/i.test(goal) ? `to ${goal.replace(/^to\s+/i, "")}` : `toward ${goal}`);
  return {
    title: clip(!topic ? "My 7-day starter checklist" : thing ? `My ${topic} starter checklist` : `My starter checklist for ${topic}`, 80),
    reward: clip(toGoal ? `The first steps I'd take ${toGoal}.` : "The exact first week I give every new member.", 300),
    action: "post",
    instructions: clip(
      thing ? `Make a post: your name, where you are with ${topic} today, and the one thing you're stuck on.` : "Make a post: your name, where you are today, and the one thing you're stuck on.",
      600,
    ),
  };
}

const tidy = (s: UnlockSuggestion): UnlockSuggestion => ({
  title: clip(s.title, 80),
  reward: clip(s.reward, 300),
  action: s.action === "comment" ? "comment" : "post",
  instructions: clip(s.instructions, 600),
});

/**
 * "Suggest an unlock": an idea for the create form, from the member's business. Runs on their AI
 * (own key or included runs). With no AI, a starter idea plus a plain note on how to get AI.
 * Nothing is saved: the member checks it and presses Create unlock.
 */
export async function suggestUnlock(workspaceId: string): Promise<SuggestUnlockResult> {
  const ctx = await businessContext(workspaceId);
  const fallback = fallbackUnlock(ctx);
  // Same limits as the launch kit's suggestions: every press can spend an AI run.
  if (!(await takeRateLimit(`unlock-suggest:${workspaceId}`, UNLOCK_SUGGEST_LIMITS))) return { ok: false, error: UNLOCK_SUGGEST_LIMITED };
  const charge = await chargeAi(workspaceId, "ai_assist", "AI unlock idea");
  if (!charge) return { ok: true, suggestion: fallback, usedAi: false, note: env.aiEnabled ? UNLOCK_SUGGEST_NO_RUNS : UNLOCK_SUGGEST_NO_AI };
  try {
    const res = await generateStructured({
      workspaceId,
      creds: charge.creds,
      system: SYSTEM,
      prompt: `${contextLines(ctx)}\n\nSuggest one unlock for this community.`,
      schema: suggestionSchema,
      effort: "low",
      maxTokens: 2000,
    });
    const s = tidy(res.data);
    if (!s.title || !s.instructions) throw new Error("The AI left the idea half empty. Please try again.");
    return { ok: true, suggestion: { ...s, reward: s.reward || fallback.reward }, usedAi: true };
  } catch (err) {
    await refundAi(workspaceId, "ai_assist", charge, "Refund: AI unlock idea failed");
    return { ok: true, suggestion: fallback, usedAi: false, note: `${describeAiError(err)} Here is a starter idea instead.` };
  }
}
