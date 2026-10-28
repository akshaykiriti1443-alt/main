import * as z from "zod/v4";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, aiGenerations, contacts, conversations, messages, workspaces, type Temperature } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { hasFeature } from "../plans";
import { chargeUsage, InsufficientBalanceError, refundUsage } from "../wallet";
import { setTemperature } from "../contacts";
import { generateStructured } from "./client";

export type ScoreResult = { score: number; temperature: Temperature; reason: string };

const BUYING_WORDS = /\b(price|cost|how much|join|sign ?up|enrol+|buy|interested|ready|start|link|trial|payment|pay|spots?|when can)\b/i;
const QUESTION = /\?/;

export function temperatureFor(score: number): Temperature {
  return score >= 65 ? "hot" : score >= 35 ? "warm" : "cold";
}

/** Rule-based score used without AI (and as a sanity floor with AI). */
export function heuristicScore(input: {
  inboundMessages: string[];
  leadCount: number;
  emailOpensOrClicks?: number;
  hasPhone: boolean;
  daysSinceLastActivity: number;
}): ScoreResult {
  let score = 10;
  const reasons: string[] = [];
  if (input.leadCount > 0) {
    score += 25;
    reasons.push("opted in on a landing page");
  }
  if (input.inboundMessages.length > 0) {
    score += Math.min(25, input.inboundMessages.length * 8);
    reasons.push(`sent ${input.inboundMessages.length} message${input.inboundMessages.length > 1 ? "s" : ""}`);
  }
  if (input.inboundMessages.some((m) => BUYING_WORDS.test(m))) {
    score += 50;
    reasons.push("asked about joining or price");
  } else if (input.inboundMessages.some((m) => QUESTION.test(m))) {
    score += 10;
    reasons.push("asked a question");
  }
  if (input.hasPhone) score += 5;
  if (input.daysSinceLastActivity > 14) {
    score -= 20;
    reasons.push("quiet for 2+ weeks");
  }
  score = Math.max(0, Math.min(100, score));
  return { score, temperature: temperatureFor(score), reason: reasons.length ? capitalize(reasons.join(", ")) + "." : "New contact." };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const scoreSchema = z.object({
  score: z.number(),
  temperature: z.enum(["hot", "warm", "cold"]),
  reason: z.string(),
});

async function gatherSignals(contactId: string) {
  const db = await getDb();
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!contact) return null;
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, contact.workspaceId)).limit(1);
  const convs = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.contactId, contactId));
  const msgs = convs.length
    ? await db
        .select({ direction: messages.direction, body: messages.body, createdAt: messages.createdAt })
        .from(messages)
        .where(inArray(messages.conversationId, convs.map((c) => c.id)))
        .orderBy(desc(messages.createdAt))
        .limit(20)
    : [];
  const history = msgs.reverse();
  const acts = await db
    .select({ type: activities.type, createdAt: activities.createdAt })
    .from(activities)
    .where(eq(activities.contactId, contactId))
    .orderBy(desc(activities.createdAt))
    .limit(30);
  return { contact, ws, history, acts };
}

/** Score one contact. Uses Claude on plans with AI scoring, rules otherwise. */
export async function scoreContact(contactId: string): Promise<ScoreResult | null> {
  const signals = await gatherSignals(contactId);
  if (!signals || !signals.ws) return null;
  const { contact, ws, history, acts } = signals;
  const inbound = history.filter((m) => m.direction === "in").map((m) => m.body);
  const last = contact.lastActivityAt ?? contact.createdAt;
  const rules = heuristicScore({
    inboundMessages: inbound,
    leadCount: acts.filter((a) => a.type === "lead").length,
    hasPhone: Boolean(contact.phone),
    daysSinceLastActivity: (Date.now() - last.getTime()) / 86_400_000,
  });

  let result = rules;
  const wantsAi = env.aiEnabled && hasFeature(ws.plan, "ai_scoring") && history.length > 0;
  const charge = wantsAi
    ? await chargeUsage(ws.id, "ai_assist", 1, { description: "AI lead score" }).catch((err) => {
        if (err instanceof InsufficientBalanceError) return null;
        throw err;
      })
    : null;
  if (charge) {
    try {
      const transcript = history.map((m) => `${m.direction === "in" ? "LEAD" : "BUSINESS"}: ${m.body}`).join("\n");
      const res = await generateStructured({
        effort: "low",
        maxTokens: 4000,
        schema: scoreSchema,
        system:
          "You score sales leads for a coach who sells a paid Skool community. Score 0-100 for how likely the lead is to join soon. hot = 65+, warm = 35-64, cold = under 35. Give a one-sentence reason a busy owner can act on. Judge only from the evidence given.",
        prompt: `Business: ${ws.settings.businessName || ws.name} (${ws.settings.niche || "coaching"}).
Offer: ${ws.settings.offer || "paid Skool community with a free trial"}.
Lead source: ${contact.source}. Tags: ${contact.tags.join(", ") || "none"}. Stage: ${contact.stage}.
Recent activity: ${acts.map((a) => a.type).join(", ") || "none"}.
Conversation:
${transcript}`,
      });
      const score = Math.max(0, Math.min(100, Math.round(res.data.score)));
      result = { score, temperature: res.data.temperature, reason: res.data.reason.slice(0, 300) };
      const db = await getDb();
      await db.insert(aiGenerations).values({
        workspaceId: ws.id,
        kind: "lead_score",
        input: { contactId },
        output: result,
        model: res.usage.model,
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
      });
    } catch (err) {
      await refundUsage(ws.id, "ai_assist", 1, charge.billedMicros, "Refund: AI lead score failed");
      console.error("[ai] scoring fell back to rules", err);
    }
  }
  await setTemperature(contact.workspaceId, contact.id, result);
  return result;
}

export async function scoreContactJob(contactId: string) {
  await scoreContact(contactId);
}
