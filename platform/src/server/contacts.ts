import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, contacts, type ContactSource, type Stage, type Temperature } from "@/lib/db/schema";
import { normalizeEmail, normalizePhone } from "@/lib/util";
import { logActivity } from "./activity";
import { emitEvent } from "./events";

export type Contact = typeof contacts.$inferSelect;

export async function getContact(workspaceId: string, contactId: string) {
  const db = await getDb();
  const [c] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId)))
    .limit(1);
  return c ?? null;
}

export async function getContactById(contactId: string) {
  const db = await getDb();
  const [c] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  return c ?? null;
}

/**
 * Find or create a contact by email (landing pages) or channel id (DMs).
 * Returns { contact, created }.
 */
export async function upsertContact(input: {
  workspaceId: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string;
  lastName?: string;
  source: ContactSource;
  sourceRef?: string | null;
  channel?: { kind: "facebook" | "instagram" | "whatsapp"; id: string };
  tags?: string[];
}): Promise<{ contact: Contact; created: boolean }> {
  const db = await getDb();
  const email = input.email ? normalizeEmail(input.email) : null;
  const phone = input.phone ? normalizePhone(input.phone) : null;

  let existing: Contact | undefined;
  if (email) {
    [existing] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.workspaceId, input.workspaceId), eq(contacts.email, email)))
      .limit(1);
  }
  if (!existing && input.channel) {
    [existing] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, input.workspaceId),
          sql`${contacts.channelIds} ->> ${input.channel.kind} = ${input.channel.id}`,
        ),
      )
      .limit(1);
  }
  if (!existing && phone && input.channel?.kind === "whatsapp") {
    [existing] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.workspaceId, input.workspaceId), eq(contacts.phone, phone)))
      .limit(1);
  }

  if (existing) {
    const tags = Array.from(new Set([...existing.tags, ...(input.tags ?? [])]));
    const channelIds = input.channel ? { ...existing.channelIds, [input.channel.kind]: input.channel.id } : existing.channelIds;
    const [updated] = await db
      .update(contacts)
      .set({
        email: existing.email ?? email,
        phone: existing.phone ?? phone,
        firstName: existing.firstName || input.firstName || "",
        lastName: existing.lastName || input.lastName || "",
        tags,
        channelIds,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, existing.id))
      .returning();
    return { contact: updated, created: false };
  }

  const [created] = await db
    .insert(contacts)
    .values({
      workspaceId: input.workspaceId,
      email,
      phone,
      firstName: input.firstName ?? "",
      lastName: input.lastName ?? "",
      source: input.source,
      sourceRef: input.sourceRef ?? null,
      tags: input.tags ?? [],
      channelIds: input.channel ? { [input.channel.kind]: input.channel.id } : {},
      lastActivityAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (!created) {
    // Lost a race with a concurrent insert of the same email: load the winner.
    const [row] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.workspaceId, input.workspaceId), eq(contacts.email, email ?? "")))
      .limit(1);
    return { contact: row, created: false };
  }
  return { contact: created, created: true };
}

export async function listContacts(
  workspaceId: string,
  filter: { q?: string; temperature?: Temperature | ""; tag?: string; stage?: Stage | ""; limit?: number; offset?: number } = {},
) {
  const db = await getDb();
  const conds: SQL[] = [eq(contacts.workspaceId, workspaceId)];
  if (filter.q) {
    const q = `%${filter.q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(contacts.email, q), ilike(contacts.firstName, q), ilike(contacts.lastName, q), ilike(contacts.phone, q))!);
  }
  if (filter.temperature) conds.push(eq(contacts.temperature, filter.temperature));
  if (filter.stage) conds.push(eq(contacts.stage, filter.stage));
  if (filter.tag) conds.push(sql`${filter.tag} = any(${contacts.tags})`);
  return db
    .select()
    .from(contacts)
    .where(and(...conds))
    .orderBy(desc(contacts.createdAt))
    .limit(filter.limit ?? 50)
    .offset(filter.offset ?? 0);
}

export async function contactTimeline(workspaceId: string, contactId: string, limit = 50) {
  const db = await getDb();
  return db
    .select()
    .from(activities)
    .where(and(eq(activities.workspaceId, workspaceId), eq(activities.contactId, contactId)))
    .orderBy(desc(activities.createdAt))
    .limit(limit);
}

export async function addTag(workspaceId: string, contactId: string, tag: string) {
  const clean = tag.trim().toLowerCase().slice(0, 60);
  if (!clean) return;
  const db = await getDb();
  const [row] = await db
    .update(contacts)
    .set({ tags: sql`array_append(${contacts.tags}, ${clean})`, updatedAt: new Date() })
    .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId), sql`not (${clean} = any(${contacts.tags}))`))
    .returning({ id: contacts.id });
  if (row) {
    await logActivity({ workspaceId, contactId, type: "tag_added", data: { tag: clean } });
    await emitEvent({ type: "tag_added", workspaceId, contactId, tag: clean });
  }
}

export async function removeTag(workspaceId: string, contactId: string, tag: string) {
  const db = await getDb();
  await db
    .update(contacts)
    .set({ tags: sql`array_remove(${contacts.tags}, ${tag})`, updatedAt: new Date() })
    .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId)));
}

export async function setStage(workspaceId: string, contactId: string, stage: Stage) {
  const db = await getDb();
  const [row] = await db
    .update(contacts)
    .set({ stage, updatedAt: new Date() })
    .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId), sql`${contacts.stage} <> ${stage}`))
    .returning({ id: contacts.id });
  if (row) {
    await logActivity({ workspaceId, contactId, type: "stage_changed", data: { stage } });
    await emitEvent({ type: "stage_changed", workspaceId, contactId, stage });
  }
}

export async function setTemperature(
  workspaceId: string,
  contactId: string,
  result: { score: number; temperature: Temperature; reason: string },
) {
  const db = await getDb();
  const [before] = await db.select({ temperature: contacts.temperature }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
  await db
    .update(contacts)
    .set({ score: result.score, temperature: result.temperature, scoreReason: result.reason, updatedAt: new Date() })
    .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId)));
  if (before && before.temperature !== result.temperature) {
    await logActivity({ workspaceId, contactId, type: "temperature_changed", data: { ...result } });
    await emitEvent({ type: "temperature_changed", workspaceId, contactId, temperature: result.temperature });
  }
}

export async function updateContactDetails(
  workspaceId: string,
  contactId: string,
  patch: { firstName?: string; lastName?: string; phone?: string; notes?: string },
) {
  const db = await getDb();
  await db
    .update(contacts)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId)));
}

export async function unsubscribeContact(contactId: string) {
  const db = await getDb();
  const [row] = await db
    .update(contacts)
    .set({ unsubscribed: true, updatedAt: new Date() })
    .where(eq(contacts.id, contactId))
    .returning({ workspaceId: contacts.workspaceId });
  if (row) await logActivity({ workspaceId: row.workspaceId, contactId, type: "unsubscribed" });
}

export const contactName = (c: Pick<Contact, "firstName" | "lastName" | "email" | "phone">) =>
  [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || c.phone || "Unknown";
