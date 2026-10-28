import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { automationRuns, automations, contacts, workspaces } from "@/lib/db/schema";
import { automationActionSchema, automationTriggerSchema, type AutomationAction, type AutomationTrigger } from "@/lib/db/types";
import { env } from "@/lib/env";
import { addMinutes } from "@/lib/util";
import { addTag, removeTag, setStage } from "./contacts";
import type { DomainEvent } from "./events";
import { enqueue } from "./jobs/queue";
import { hasFeature } from "./plans";

export type Automation = typeof automations.$inferSelect;

function matches(trigger: AutomationTrigger, event: DomainEvent): boolean {
  if (trigger.type !== event.type) return false;
  if (!trigger.value) return true;
  switch (event.type) {
    case "lead_created":
      return trigger.value === event.siteId;
    case "message_received":
      return trigger.value === event.channel;
    case "tag_added":
      return trigger.value === event.tag;
    case "temperature_changed":
      return trigger.value === event.temperature;
    case "stage_changed":
      return trigger.value === event.stage;
  }
}

export async function startAutomationsForEvent(event: DomainEvent) {
  const db = await getDb();
  const [ws] = await db.select({ plan: workspaces.plan, status: workspaces.status }).from(workspaces).where(eq(workspaces.id, event.workspaceId)).limit(1);
  if (!ws || ws.status === "paused" || !hasFeature(ws.plan, "automations")) return;
  const list = await db
    .select()
    .from(automations)
    .where(and(eq(automations.workspaceId, event.workspaceId), eq(automations.active, true)));
  for (const a of list) {
    if (!matches(a.trigger, event)) continue;
    const [run] = await db
      .insert(automationRuns)
      .values({
        workspaceId: event.workspaceId,
        automationId: a.id,
        contactId: event.contactId,
        context: { ...event },
        status: "running",
      })
      .returning({ id: automationRuns.id });
    await db.update(automations).set({ runsCount: a.runsCount + 1 }).where(eq(automations.id, a.id));
    await enqueue("automation.step", { runId: run.id });
  }
}

type RunLog = { at: string; step: number; message: string }[];

export async function processAutomationStep(runId: string) {
  const db = await getDb();
  const [run] = await db.select().from(automationRuns).where(eq(automationRuns.id, runId)).limit(1);
  if (!run || run.status === "completed" || run.status === "failed") return;
  const [automation] = await db.select().from(automations).where(eq(automations.id, run.automationId)).limit(1);
  if (!automation || !automation.active) {
    await db.update(automationRuns).set({ status: "completed" }).where(eq(automationRuns.id, runId));
    return;
  }
  const log: RunLog = [...run.log];
  const note = (step: number, message: string) => log.push({ at: new Date().toISOString(), step, message });

  let index = run.stepIndex;
  while (index < automation.actions.length) {
    const action = automation.actions[index];
    const result = await executeAction(run.workspaceId, run.contactId, run.context, action);
    note(index, result.message);
    if (result.kind === "stop") {
      await db.update(automationRuns).set({ status: "completed", stepIndex: index + 1, log }).where(eq(automationRuns.id, runId));
      return;
    }
    if (result.kind === "wait") {
      await db.update(automationRuns).set({ status: "waiting", stepIndex: index + 1, log }).where(eq(automationRuns.id, runId));
      await enqueue("automation.step", { runId }, { runAt: result.until });
      return;
    }
    index++;
  }
  await db.update(automationRuns).set({ status: "completed", stepIndex: index, log }).where(eq(automationRuns.id, runId));
}

type ActionResult = { kind: "next"; message: string } | { kind: "stop"; message: string } | { kind: "wait"; until: Date; message: string };

async function executeAction(
  workspaceId: string,
  contactId: string | null,
  context: Record<string, unknown>,
  action: AutomationAction,
): Promise<ActionResult> {
  const db = await getDb();
  const contact = contactId ? (await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1))[0] : undefined;
  switch (action.type) {
    case "wait":
      return { kind: "wait", until: addMinutes(new Date(), action.minutes), message: `Waiting ${action.minutes} min` };
    case "add_tag":
      if (contact) await addTag(workspaceId, contact.id, action.tag);
      return { kind: "next", message: `Tagged "${action.tag}"` };
    case "remove_tag":
      if (contact) await removeTag(workspaceId, contact.id, action.tag);
      return { kind: "next", message: `Removed tag "${action.tag}"` };
    case "set_stage":
      if (contact) await setStage(workspaceId, contact.id, action.stage);
      return { kind: "next", message: `Stage set to ${action.stage}` };
    case "only_if_temperature": {
      const fresh = contactId ? (await db.select({ t: contacts.temperature }).from(contacts).where(eq(contacts.id, contactId)).limit(1))[0] : undefined;
      return fresh?.t === action.temperature
        ? { kind: "next", message: `Lead is ${action.temperature}` }
        : { kind: "stop", message: `Stopped: lead is ${fresh?.t ?? "unknown"}, not ${action.temperature}` };
    }
    case "ai_score": {
      if (!contact) return { kind: "next", message: "No contact to score" };
      const { scoreContact } = await import("./ai/scoring");
      const r = await scoreContact(contact.id);
      return { kind: "next", message: r ? `Scored ${r.score} (${r.temperature})` : "Could not score" };
    }
    case "ai_draft_reply": {
      const conversationId =
        (context.conversationId as string | undefined) ??
        (contact ? (await (await import("./inbox")).latestConversationFor(workspaceId, contact.id))?.id : undefined);
      if (!conversationId) return { kind: "next", message: "No conversation to reply to" };
      const { draftReply } = await import("./ai/replies");
      await draftReply(conversationId);
      return { kind: "next", message: "Drafted an AI reply" };
    }
    case "send_email": {
      if (!contact?.email || contact.unsubscribed) return { kind: "next", message: "Skipped email: no email or unsubscribed" };
      const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      const { buildVars, queueEmail } = await import("./email/send");
      await queueEmail({ workspaceId, contactId: contact.id, to: contact.email, subject: action.subject, body: action.body, vars: await buildVars(ws, contact) });
      return { kind: "next", message: `Queued email "${action.subject}"` };
    }
    case "enroll_sequence": {
      if (!contact) return { kind: "next", message: "No contact" };
      const { enrollContact } = await import("./email/sequences");
      await enrollContact(workspaceId, action.sequenceId, contact.id);
      return { kind: "next", message: "Enrolled in sequence" };
    }
    case "notify_owner": {
      const { workspaceOwnerEmail, queueEmail } = await import("./email/send");
      const to = await workspaceOwnerEmail(workspaceId);
      if (to) {
        const who = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email || contact.phone || "A lead" : "A lead";
        await queueEmail({
          workspaceId,
          to,
          subject: `🔥 ${who}: ${action.message.slice(0, 80)}`,
          body: `${action.message}\n\nOpen your inbox: ${env.appUrl}/app/w/${workspaceId}/inbox`,
          vars: {},
        });
      }
      return { kind: "next", message: "Notified the owner" };
    }
    case "send_message": {
      if (!contact) return { kind: "next", message: "No contact" };
      const { latestConversationFor, sendReply } = await import("./inbox");
      const conv = await latestConversationFor(workspaceId, contact.id);
      if (!conv) return { kind: "next", message: "No conversation to message" };
      try {
        await sendReply(workspaceId, conv.id, action.body.replace(/\{\{\s*first_name\s*\}\}/g, contact.firstName || "there"), null);
        return { kind: "next", message: "Sent a message" };
      } catch (err) {
        return { kind: "next", message: `Message not sent: ${err instanceof Error ? err.message : err}` };
      }
    }
    case "webhook": {
      const res = await fetch(action.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: context, contact }),
        signal: AbortSignal.timeout(10_000),
      }).catch((e: Error) => ({ ok: false, status: 0, statusText: e.message }) as const);
      return { kind: "next", message: `Webhook ${res.ok ? "sent" : `failed (${res.status} ${res.statusText})`}` };
    }
  }
}

export async function listAutomations(workspaceId: string) {
  const db = await getDb();
  return db.select().from(automations).where(eq(automations.workspaceId, workspaceId)).orderBy(desc(automations.createdAt));
}

export async function getAutomation(workspaceId: string, id: string) {
  const db = await getDb();
  const [a] = await db.select().from(automations).where(and(eq(automations.id, id), eq(automations.workspaceId, workspaceId))).limit(1);
  return a ?? null;
}

export async function recentRuns(workspaceId: string, automationId: string) {
  const db = await getDb();
  return db
    .select()
    .from(automationRuns)
    .where(and(eq(automationRuns.workspaceId, workspaceId), eq(automationRuns.automationId, automationId)))
    .orderBy(desc(automationRuns.createdAt))
    .limit(20);
}

export async function saveAutomation(workspaceId: string, id: string | null, input: { name: string; trigger: unknown; actions: unknown; active: boolean }) {
  const trigger = automationTriggerSchema.parse(input.trigger);
  const actions = (Array.isArray(input.actions) ? input.actions : []).map((a) => automationActionSchema.parse(a));
  const db = await getDb();
  if (id) {
    await db
      .update(automations)
      .set({ name: input.name, trigger, actions, active: input.active })
      .where(and(eq(automations.id, id), eq(automations.workspaceId, workspaceId)));
    return id;
  }
  const [row] = await db.insert(automations).values({ workspaceId, name: input.name, trigger, actions, active: input.active }).returning({ id: automations.id });
  return row.id;
}

export async function deleteAutomation(workspaceId: string, id: string) {
  const db = await getDb();
  await db.delete(automations).where(and(eq(automations.id, id), eq(automations.workspaceId, workspaceId)));
}

export const ACTION_LABELS: Record<AutomationAction["type"], string> = {
  add_tag: "Add a tag",
  remove_tag: "Remove a tag",
  set_stage: "Move to a pipeline stage",
  wait: "Wait",
  send_email: "Send an email",
  enroll_sequence: "Start an email sequence",
  notify_owner: "Email me an alert",
  ai_score: "Score the lead with AI",
  ai_draft_reply: "Draft a reply with AI",
  send_message: "Send a DM / WhatsApp / SMS",
  webhook: "Send to a webhook (Zapier, Make)",
  only_if_temperature: "Continue only if lead is…",
};

export const TRIGGER_LABELS: Record<AutomationTrigger["type"], string> = {
  lead_created: "New lead from a landing page",
  message_received: "New message (DM, WhatsApp, SMS)",
  tag_added: "Tag added",
  temperature_changed: "Lead temperature changes",
  stage_changed: "Pipeline stage changes",
};
