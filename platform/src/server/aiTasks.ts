import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, aiTasks, contacts, workspaces, type AiTaskStatus } from "@/lib/db/schema";
import { logActivity } from "./activity";

// "Ask my AI": an automation step hands a task to the owner's OWN AI.
//   - With their own API key (Settings › Your AI) it runs right away on that key.
//   - Without one it waits here until their connected AI app (Claude, ChatGPT, Antigravity CLI…)
//     picks it up through the MCP connector ("do my AI tasks").
// The platform's own AI key is never used for these, so the cost is always the owner's.

export type AiTask = typeof aiTasks.$inferSelect;

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");

/** A compact, privacy-light picture of the contact for the AI. */
export async function contactBrief(workspaceId: string, contactId: string | null) {
  if (!contactId) return null;
  const db = await getDb();
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId))).limit(1);
  if (!c) return null;
  const recent = await db
    .select({ type: activities.type, at: activities.createdAt })
    .from(activities)
    .where(and(eq(activities.workspaceId, workspaceId), eq(activities.contactId, contactId)))
    .orderBy(desc(activities.createdAt))
    .limit(8);
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    stage: c.stage,
    temperature: c.temperature,
    tags: c.tags,
    source: c.source,
    notes: c.notes.slice(0, 600),
    recent: recent.map((r) => `${r.type} (${r.at.toISOString().slice(0, 10)})`),
  };
}

export async function createAiTask(input: { workspaceId: string; contactId: string | null; instruction: string; source: string }) {
  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings, name: workspaces.name }).from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1);
  const brief = await contactBrief(input.workspaceId, input.contactId);
  // The instruction is the owner's, so the AI trusts it. A member types their own name, so it
  // never goes in here: the AI reads it from the member brief, which is marked untrusted.
  const instruction = fill(input.instruction, {
    first_name: "the member",
    skool_url: ws?.settings.skoolUrl ?? "",
    business_name: ws?.settings.businessName || ws?.name || "",
  }).slice(0, 2000);
  const [task] = await db
    .insert(aiTasks)
    .values({ workspaceId: input.workspaceId, contactId: input.contactId, instruction, source: input.source.slice(0, 120) })
    .returning();

  // Owner has their own key: do it now, on their key.
  const { aiCredsFor, generateText, AI_PROVIDERS } = await import("./ai/client");
  const creds = await aiCredsFor(input.workspaceId);
  if (!creds) return { task, ranNow: false as const };
  try {
    // The creds loaded above, never re-read: a key removed meanwhile must not fall back to the platform key.
    const res = await generateText({
      creds,
      ownKeyOnly: true,
      effort: "low",
      maxTokens: 1500,
      system: `You help ${ws?.settings.businessName || ws?.name || "a coach"}, who runs a paid Skool community${ws?.settings.niche ? ` about ${ws.settings.niche}` : ""}. Do the task. Write like a real person, short and warm. Never invent results, testimonials or numbers. Return only the finished text.`,
      prompt: `Task: ${instruction}\n\n${brief ? `About this member (JSON): ${JSON.stringify(brief)}` : "No contact attached."}`,
    });
    const done = await completeAiTask(input.workspaceId, task.id, res.text, `api:${AI_PROVIDERS[creds.provider].label}`);
    return { task: done ?? task, ranNow: true as const };
  } catch (err) {
    // Leave it pending: their connected AI app can still pick it up.
    await db.update(aiTasks).set({ doneBy: `error: ${err instanceof Error ? err.message.slice(0, 200) : "failed"}` }).where(eq(aiTasks.id, task.id));
    return { task, ranNow: false as const };
  }
}

export async function listAiTasks(workspaceId: string, opts: { status?: AiTaskStatus; limit?: number } = {}) {
  const db = await getDb();
  return db
    .select({
      task: aiTasks,
      contact: { id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email },
    })
    .from(aiTasks)
    .leftJoin(contacts, eq(contacts.id, aiTasks.contactId))
    .where(and(eq(aiTasks.workspaceId, workspaceId), opts.status ? eq(aiTasks.status, opts.status) : undefined))
    .orderBy(opts.status === "pending" ? aiTasks.createdAt : desc(aiTasks.completedAt), desc(aiTasks.createdAt))
    .limit(opts.limit ?? 25);
}

export async function pendingAiTaskCount(workspaceId: string) {
  const db = await getDb();
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(aiTasks).where(and(eq(aiTasks.workspaceId, workspaceId), eq(aiTasks.status, "pending")));
  return row?.n ?? 0;
}

/** Save the AI's work. The result shows on the contact's timeline as a draft the owner can copy. */
export async function completeAiTask(workspaceId: string, taskId: string, result: string, doneBy: string) {
  const db = await getDb();
  const [task] = await db
    .update(aiTasks)
    .set({ status: "done", result: result.trim().slice(0, 8000), doneBy: doneBy.slice(0, 120), completedAt: new Date() })
    .where(and(eq(aiTasks.id, taskId), eq(aiTasks.workspaceId, workspaceId), eq(aiTasks.status, "pending")))
    .returning();
  if (!task) return null;
  if (task.contactId) {
    await logActivity({ workspaceId, contactId: task.contactId, type: "ai_task_done", refId: task.id, data: { instruction: task.instruction.slice(0, 300), result: task.result, by: task.doneBy } });
  }
  return task;
}

export async function skipAiTask(workspaceId: string, taskId: string) {
  const db = await getDb();
  const [task] = await db
    .update(aiTasks)
    .set({ status: "skipped", completedAt: new Date() })
    .where(and(eq(aiTasks.id, taskId), eq(aiTasks.workspaceId, workspaceId), eq(aiTasks.status, "pending")))
    .returning({ id: aiTasks.id });
  return Boolean(task);
}
