import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations, contacts, workspaces } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { MEMBER_TAG, CANCELLING_TAG } from "../skool";
import { chargeUsage, InsufficientBalanceError, refundUsage } from "../wallet";
import { generateText, VOICE_RULES } from "./client";

// Drafts a Skool direct message for the owner to send by hand. We never send inside Skool or hold
// anyone's Skool login, so no account is ever at risk — the owner copies the message and sends it.

export type SkoolIntent = "welcome" | "convert" | "save" | "winback";

export const INTENT_LABEL: Record<SkoolIntent, string> = {
  welcome: "Welcome a new member",
  convert: "Nudge a trial to upgrade",
  save: "Save a cancelling member",
  winback: "Win back someone who left",
};

/** Pick the message that fits where this contact is in the Skool lifecycle. */
export function intentForContact(c: { stage: string; tags: string[] }): SkoolIntent {
  if (c.tags.includes(CANCELLING_TAG)) return "save";
  if (c.stage === "lost") return "winback";
  if (c.stage === "trial") return "convert";
  return "welcome";
}

const GUIDANCE: Record<SkoolIntent, string> = {
  welcome:
    "They just joined. Welcome them warmly, point them to the one first step inside the group, and ask what they want to get out of it.",
  convert:
    "They are on a free trial that will end soon. Remind them of the main benefit, nudge them to stay on as a paying member, and offer to help with anything holding them back. Do not be pushy.",
  save:
    "They have cancelled but still have access for now. Thank them, ask what went wrong in a genuine way, and offer to make it right so they stay.",
  winback:
    "They left the group a while ago. Reconnect lightly, mention one new thing or win inside, and invite them to come back. No guilt.",
};

export function fallbackSkoolMessage(
  intent: SkoolIntent,
  i: { firstName: string; businessName: string; skoolUrl: string },
): string {
  const hi = i.firstName ? `Hey ${i.firstName}!` : "Hey!";
  const link = i.skoolUrl || "[your Skool link]";
  switch (intent) {
    case "welcome":
      return `${hi} Welcome to ${i.businessName}. Really glad you're here. Start with the first lesson in the classroom, then tell me: what's your #1 goal right now?`;
    case "convert":
      return `${hi} Your trial is almost up. I'd love to keep helping you inside ${i.businessName}. What's the one thing you want to sort out first? I'll point you to it.`;
    case "save":
      return `${hi} I saw you cancelled, and that's totally okay. Quick question so I can do better: what made it not click for you? If there's a way to make it right, I'm on it.`;
    case "winback":
      return `${hi} It's been a while. We've added some new stuff inside ${i.businessName} that I think you'd like. Want me to send you the link to jump back in? ${link}`;
  }
}

export async function draftSkoolMessage(
  workspaceId: string,
  contactId: string,
  intent?: SkoolIntent,
): Promise<{ text: string; intent: SkoolIntent; ai: boolean }> {
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!ws || !contact || contact.workspaceId !== workspaceId) throw new Error("Contact not found.");

  const chosen = intent ?? intentForContact(contact);
  const businessName = ws.settings.businessName || ws.name;
  let text = fallbackSkoolMessage(chosen, { firstName: contact.firstName, businessName, skoolUrl: ws.settings.skoolUrl ?? "" });
  let ai = false;

  const charge = env.aiEnabled
    ? await chargeUsage(workspaceId, "ai_assist", 1, { description: "Skool message draft" }).catch((err) => {
        if (err instanceof InsufficientBalanceError) return null;
        throw err;
      })
    : null;
  if (charge) {
    try {
      const res = await generateText({
        effort: "low",
        maxTokens: 2000,
        system: `You write a single direct message for ${businessName}, a coach who runs a paid Skool community${
          ws.settings.niche ? ` about ${ws.settings.niche}` : ""
        }. The owner reads and sends it by hand inside Skool.
${GUIDANCE[chosen]}
Sound like a real person messaging a member, not a broadcast. 1-3 short sentences. Ask at most one question. Use their first name if given.
${VOICE_RULES}
Return only the message text.`,
        prompt: `Member first name: ${contact.firstName || "(unknown)"}\nSkool group link: ${ws.settings.skoolUrl || "(none)"}`,
      });
      text = res.text.trim().slice(0, 1000);
      ai = true;
      await db.insert(aiGenerations).values({
        workspaceId,
        kind: "skool_message",
        input: { contactId, intent: chosen },
        output: { text },
        model: res.usage.model,
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
      });
    } catch (err) {
      await refundUsage(workspaceId, "ai_assist", 1, charge.billedMicros, "Refund: Skool message draft failed");
      console.error("[ai] skool message fell back to template", err);
    }
  }
  return { text, intent: chosen, ai };
}

export { MEMBER_TAG };
