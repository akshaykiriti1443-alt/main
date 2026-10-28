import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, emailEnrollments, emailSequences, emailSequenceSteps, workspaces } from "@/lib/db/schema";
import { addMinutes, isUuid } from "@/lib/util";
import type { DomainEvent } from "../events";
import { enqueue } from "../jobs/queue";
import { buildVars, queueEmail } from "./send";
import { isWorkspaceLive } from "../liveness";

export async function enrollForEvent(event: DomainEvent) {
  if (event.type !== "lead_created" && event.type !== "tag_added") return;
  const db = await getDb();
  const seqs = await db
    .select()
    .from(emailSequences)
    .where(and(eq(emailSequences.workspaceId, event.workspaceId), eq(emailSequences.active, true), eq(emailSequences.trigger, event.type)));
  for (const seq of seqs) {
    if (event.type === "lead_created" && seq.triggerValue && seq.triggerValue !== event.siteId) continue;
    if (event.type === "tag_added" && seq.triggerValue !== event.tag) continue;
    await enrollContact(event.workspaceId, seq.id, event.contactId);
  }
}

export async function enrollContact(workspaceId: string, sequenceId: string, contactId: string) {
  const db = await getDb();
  // The sequence and the contact must both belong to this workspace.
  const [seq] = await db
    .select({ id: emailSequences.id })
    .from(emailSequences)
    .where(and(eq(emailSequences.id, sequenceId), eq(emailSequences.workspaceId, workspaceId)))
    .limit(1);
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId)))
    .limit(1);
  if (!seq || !contact) return null;
  const [enrollment] = await db
    .insert(emailEnrollments)
    .values({ workspaceId, sequenceId, contactId })
    .onConflictDoNothing()
    .returning();
  if (!enrollment) return null; // already enrolled
  const [first] = await db
    .select()
    .from(emailSequenceSteps)
    .where(eq(emailSequenceSteps.sequenceId, sequenceId))
    .orderBy(asc(emailSequenceSteps.position))
    .limit(1);
  if (!first) return enrollment;
  await enqueue("email.sequence_step", { enrollmentId: enrollment.id }, { runAt: addMinutes(enrollment.createdAt, first.delayMinutes) });
  return enrollment;
}

export async function processSequenceStep(enrollmentId: string) {
  const db = await getDb();
  const [enrollment] = await db.select().from(emailEnrollments).where(eq(emailEnrollments.id, enrollmentId)).limit(1);
  if (!enrollment || enrollment.status !== "active") return;

  const steps = await db
    .select()
    .from(emailSequenceSteps)
    .where(eq(emailSequenceSteps.sequenceId, enrollment.sequenceId))
    .orderBy(asc(emailSequenceSteps.position));
  const step = steps[enrollment.nextPosition];
  const [seq] = await db.select().from(emailSequences).where(eq(emailSequences.id, enrollment.sequenceId)).limit(1);
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, enrollment.contactId)).limit(1);
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, enrollment.workspaceId)).limit(1);

  if (!step || !seq || !contact || !ws) {
    await db.update(emailEnrollments).set({ status: "completed" }).where(eq(emailEnrollments.id, enrollment.id));
    return;
  }
  if (!seq.active || contact.unsubscribed || !contact.email) {
    await db.update(emailEnrollments).set({ status: "stopped" }).where(eq(emailEnrollments.id, enrollment.id));
    return;
  }
  if (!(await isWorkspaceLive(ws.id))) {
    // Try again tomorrow; access may be restored.
    await enqueue("email.sequence_step", { enrollmentId }, { runAt: addMinutes(new Date(), 60 * 24) });
    return;
  }

  await queueEmail({
    workspaceId: ws.id,
    contactId: contact.id,
    to: contact.email,
    subject: step.subject,
    body: step.body,
    vars: await buildVars(ws, contact),
    sequenceStepId: step.id,
  });

  const next = steps[enrollment.nextPosition + 1];
  await db
    .update(emailEnrollments)
    .set({ nextPosition: enrollment.nextPosition + 1, status: next ? "active" : "completed" })
    .where(eq(emailEnrollments.id, enrollment.id));
  if (next) {
    const due = addMinutes(enrollment.createdAt, next.delayMinutes);
    await enqueue("email.sequence_step", { enrollmentId }, { runAt: due > new Date() ? due : new Date() });
  }
}

export async function getSequenceWithSteps(workspaceId: string, sequenceId: string) {
  if (!isUuid(sequenceId)) return null;
  const db = await getDb();
  const [seq] = await db
    .select()
    .from(emailSequences)
    .where(and(eq(emailSequences.id, sequenceId), eq(emailSequences.workspaceId, workspaceId)))
    .limit(1);
  if (!seq) return null;
  const steps = await db
    .select()
    .from(emailSequenceSteps)
    .where(eq(emailSequenceSteps.sequenceId, seq.id))
    .orderBy(asc(emailSequenceSteps.position));
  return { ...seq, steps };
}

export async function listSequences(workspaceId: string) {
  const db = await getDb();
  return db.select().from(emailSequences).where(eq(emailSequences.workspaceId, workspaceId)).orderBy(asc(emailSequences.createdAt));
}

export async function saveSequence(
  workspaceId: string,
  sequenceId: string,
  input: {
    name: string;
    active: boolean;
    trigger: "lead_created" | "tag_added" | "manual";
    triggerValue: string;
    steps: { delayMinutes: number; subject: string; body: string }[];
  },
) {
  const db = await getDb();
  const seq = await getSequenceWithSteps(workspaceId, sequenceId);
  if (!seq) throw new Error("Sequence not found");
  await db.transaction(async (tx) => {
    await tx
      .update(emailSequences)
      .set({ name: input.name, active: input.active, trigger: input.trigger, triggerValue: input.triggerValue })
      .where(eq(emailSequences.id, sequenceId));
    await tx.delete(emailSequenceSteps).where(eq(emailSequenceSteps.sequenceId, sequenceId));
    if (input.steps.length) {
      await tx
        .insert(emailSequenceSteps)
        .values(input.steps.map((s, i) => ({ sequenceId, position: i, delayMinutes: s.delayMinutes, subject: s.subject, body: s.body })));
    }
  });
}
