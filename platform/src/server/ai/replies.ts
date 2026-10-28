import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations, contacts, conversations, messages, workspaces } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { aiCostMicros } from "../pricing";
import { canAfford, chargeUsage } from "../wallet";
import { generateText, VOICE_RULES } from "./client";

export function fallbackReply(input: { firstName: string; businessName: string; skoolUrl: string; lastInbound: string }) {
  const hi = input.firstName ? `Hey ${input.firstName}!` : "Hey!";
  if (/price|cost|how much/i.test(input.lastInbound)) {
    return `${hi} Great question. You can try ${input.businessName} free for 7 days first. Here's the link: ${input.skoolUrl || "[your Skool link]"}. Want me to tell you what's inside?`;
  }
  return `${hi} Thanks for reaching out. What's your #1 goal right now? I'll point you to the best place to start.`;
}

/** Draft (not send) a reply for the owner to review in the inbox. */
export async function draftReply(conversationId: string): Promise<string | null> {
  const db = await getDb();
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!conv) return null;
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, conv.workspaceId)).limit(1);
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId)).limit(1);
  if (!ws || !contact) return null;
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(30);
  const lastInbound = [...history].reverse().find((m) => m.direction === "in")?.body ?? "";
  const businessName = ws.settings.businessName || ws.name;

  let reply = fallbackReply({ firstName: contact.firstName, businessName, skoolUrl: ws.settings.skoolUrl ?? "", lastInbound });
  if (env.aiEnabled && (await canAfford(ws.id, "ai_assist"))) {
    try {
      const res = await generateText({
        effort: "low",
        maxTokens: 3000,
        system: `You draft direct-message replies for ${businessName}, a coach who runs a paid Skool community${
          ws.settings.niche ? ` about ${ws.settings.niche}` : ""
        }. The owner reviews every draft before it is sent.
Goal: help the lead and, when it fits, invite them to start the free trial at ${ws.settings.skoolUrl || "the Skool group link"}.
Reply in the lead's language. Keep it to 1-3 short sentences that sound like a real person texting. Ask at most one question.
${VOICE_RULES}
Return only the message text.`,
        prompt: history.map((m) => `${m.direction === "in" ? "LEAD" : "ME"}: ${m.body}`).join("\n") || `LEAD: ${lastInbound}`,
      });
      reply = res.text.slice(0, 1000);
      await db.insert(aiGenerations).values({
        workspaceId: ws.id,
        kind: "reply_draft",
        input: { conversationId },
        output: { reply },
        model: res.usage.model,
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
      });
      await chargeUsage(ws.id, "ai_assist", 1, {
        description: "AI reply draft",
        costMicros: aiCostMicros(res.usage.inputTokens, res.usage.outputTokens),
      }).catch(() => undefined);
    } catch (err) {
      console.error("[ai] reply draft fell back to template", err);
    }
  }
  await db.update(conversations).set({ suggestedReply: reply }).where(eq(conversations.id, conversationId));
  return reply;
}

export async function draftReplyJob(conversationId: string) {
  await draftReply(conversationId);
}
