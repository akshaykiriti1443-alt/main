import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, contacts, opportunities, pipelines, pipelineStages, type ContactSource } from "@/lib/db/schema";
import {
  isSkipped,
  normalizeContact,
  normalizeOpportunity,
  phoneKey,
  splitFullName,
  type CleanContact,
  type CleanOpportunity,
  type ContactField,
  type OpportunityField,
  type RawRecord,
  type Skipped,
} from "@/lib/crmImport";
import { logActivity } from "./activity";
import { ensureDefaultPipeline, isCurrency, kindForStageName, type PipelineWithStages } from "./pipelines";

// Bringing a GoHighLevel (or any) export across. The page sends rows in chunks of a few hundred;
// each chunk is cleaned with the same functions the preview used, then matched to existing people
// by email first, then phone. Imports never fire automations or emails: 3,000 old contacts must
// not all get a "welcome" email at once.

export const IMPORT_CHUNK = 250;

type Contact = typeof contacts.$inferSelect;
/** created: new people. updated: people already in the CRM. merged: duplicate rows in the file. */
export type ImportSummary = { created: number; updated: number; merged: number; skipped: Skipped[] };
export type OpportunityImportSummary = ImportSummary & { contactsCreated: number; pipelinesCreated: string[]; stagesCreated: string[] };

const noteBlock = (lines: string[], label: string) => (lines.length ? `${label}\n${lines.join("\n")}` : "");

/** Adds a block to existing notes unless every line is already there (re-importing the same file). */
export function mergeNotes(existing: string, lines: string[], label: string) {
  const fresh = lines.filter((l) => !existing.includes(l));
  if (!fresh.length) return existing;
  return [existing.trim(), noteBlock(fresh, label)].filter(Boolean).join("\n\n").slice(0, 20000);
}

/** Loads the workspace's contacts that share an email or a phone (last 10 digits) with these rows. */
async function existingMatches(workspaceId: string, emails: string[], phones: string[]) {
  const db = await getDb();
  if (!emails.length && !phones.length) return [] as Contact[];
  const digits = sql`right(regexp_replace(coalesce(${contacts.phone}, ''), '[^0-9]', '', 'g'), 10)`;
  const conds = [];
  if (emails.length) conds.push(inArray(contacts.email, emails));
  if (phones.length) conds.push(inArray(digits, phones));
  return db.select().from(contacts).where(and(eq(contacts.workspaceId, workspaceId), or(...conds)));
}

class ContactIndex {
  byEmail = new Map<string, Contact>();
  byPhone = new Map<string, Contact>();
  add(c: Contact) {
    if (c.email) this.byEmail.set(c.email, c);
    const k = c.phone ? phoneKey(c.phone) : "";
    if (k.length >= 6 && !this.byPhone.has(k)) this.byPhone.set(k, c);
  }
  /** Email first. Then phone, but only when that doesn't merge two different email addresses. */
  find(email: string | null, phone: string | null) {
    if (email && this.byEmail.has(email)) return this.byEmail.get(email)!;
    const k = phone ? phoneKey(phone) : "";
    const hit = k.length >= 6 ? this.byPhone.get(k) : undefined;
    if (hit && (!email || !hit.email || hit.email === email)) return hit;
    return undefined;
  }
}

async function loadIndex(workspaceId: string, rows: { email: string | null; phone: string | null }[]) {
  const index = new ContactIndex();
  const emails = Array.from(new Set(rows.map((r) => r.email).filter((e): e is string => Boolean(e))));
  const phones = Array.from(new Set(rows.map((r) => (r.phone ? phoneKey(r.phone) : "")).filter((k) => k.length >= 6)));
  for (const c of await existingMatches(workspaceId, emails, phones)) index.add(c);
  return index;
}

/** Fills blanks, adds tags and notes. Never removes anything and never un-unsubscribes anyone. */
async function mergeInto(existing: Contact, c: { email: string | null; phone: string | null; firstName: string; lastName: string; tags: string[]; noteLines: string[]; unsubscribed?: boolean }, noteLabel: string) {
  const db = await getDb();
  const tags = Array.from(new Set([...existing.tags, ...c.tags])).slice(0, 100);
  const patch = {
    email: existing.email ?? c.email,
    phone: existing.phone ?? c.phone,
    firstName: existing.firstName || c.firstName,
    lastName: existing.lastName || c.lastName,
    tags,
    notes: mergeNotes(existing.notes, c.noteLines, noteLabel),
    unsubscribed: existing.unsubscribed || Boolean(c.unsubscribed),
  };
  // Another contact may already own that email (phone matched, emails differ): leave email alone.
  if (patch.email && patch.email !== existing.email) {
    const [taken] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.workspaceId, existing.workspaceId), eq(contacts.email, patch.email))).limit(1);
    if (taken) patch.email = existing.email;
  }
  const [row] = await db
    .update(contacts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(contacts.id, existing.id))
    .returning();
  return row;
}

const today = () => new Date().toISOString().slice(0, 10);

/** One chunk of a contacts import. */
export async function importContactRecords(
  workspaceId: string,
  records: RawRecord<ContactField>[],
  opts: { tag?: string; fileName?: string; now?: Date } = {},
): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, updated: 0, merged: 0, skipped: [] };
  const clean: CleanContact[] = [];
  for (const r of records) {
    const c = normalizeContact(r, { tag: opts.tag, now: opts.now });
    if (isSkipped(c)) summary.skipped.push(c);
    else clean.push(c);
  }
  if (!clean.length) return summary;
  const db = await getDb();
  const index = await loadIndex(workspaceId, clean);
  const label = `Imported ${today()}${opts.fileName ? ` from ${opts.fileName.slice(0, 80)}` : ""}:`;
  const touched = new Set<string>();
  for (const c of clean) {
    const existing = index.find(c.email, c.phone);
    if (existing) {
      const merged = await mergeInto(existing, c, label);
      index.add(merged);
      if (touched.has(merged.id)) summary.merged++;
      else summary.updated++;
      touched.add(merged.id);
      continue;
    }
    const [created] = await db
      .insert(contacts)
      .values({
        workspaceId,
        email: c.email,
        phone: c.phone,
        firstName: c.firstName,
        lastName: c.lastName,
        source: c.source as ContactSource,
        tags: c.tags,
        notes: noteBlock(c.noteLines, label),
        unsubscribed: c.unsubscribed,
        ...(c.createdAt ? { createdAt: new Date(c.createdAt) } : {}),
      })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      summary.skipped.push({ row: c.row, reason: "Matched someone already in your leads; nothing new to add" });
      continue;
    }
    index.add(created);
    touched.add(created.id);
    summary.created++;
    await db.insert(activities).values({ workspaceId, contactId: created.id, type: "imported", data: { file: opts.fileName ?? "" }, ...(c.createdAt ? { createdAt: new Date(c.createdAt) } : {}) });
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

type ImportCache = { pipelines: PipelineWithStages[]; createdPipelines: string[]; createdStages: string[] };

async function pipelineCache(workspaceId: string): Promise<ImportCache> {
  await ensureDefaultPipeline(workspaceId);
  const db = await getDb();
  const ps = await db.select().from(pipelines).where(eq(pipelines.workspaceId, workspaceId));
  const stages = ps.length ? await db.select().from(pipelineStages).where(inArray(pipelineStages.pipelineId, ps.map((p) => p.id))) : [];
  return {
    pipelines: ps.map((p) => ({ ...p, stages: stages.filter((s) => s.pipelineId === p.id).sort((a, b) => a.position - b.position) })),
    createdPipelines: [],
    createdStages: [],
  };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

async function resolveStage(workspaceId: string, cache: ImportCache, pipelineName: string, stageName: string, currency: string) {
  const db = await getDb();
  let p = pipelineName ? cache.pipelines.find((x) => same(x.name, pipelineName)) : cache.pipelines.find((x) => x.isDefault);
  if (!p) {
    const [row] = await db
      .insert(pipelines)
      .values({ workspaceId, name: pipelineName.slice(0, 80), currency, position: Math.max(0, ...cache.pipelines.map((x) => x.position)) + 1 })
      .returning();
    p = { ...row, stages: [] };
    cache.pipelines.push(p);
    cache.createdPipelines.push(p.name);
  }
  if (!stageName) {
    if (p.stages.length) return { pipeline: p, stage: p.stages[0] };
    stageName = "New";
  }
  let stage = p.stages.find((s) => same(s.name, stageName));
  if (!stage) {
    // Open stages go before won/lost ones, and won before lost, so the board reads left to right.
    const kind = kindForStageName(stageName);
    const rank = { open: 0, won: 1, lost: 2 } as const;
    const after = p.stages.findIndex((s) => rank[s.kind] > rank[kind]);
    const at = after >= 0 ? after : p.stages.length;
    const [row] = await db.insert(pipelineStages).values({ workspaceId, pipelineId: p.id, name: stageName.slice(0, 60), kind, position: at }).returning();
    p.stages.splice(at, 0, row);
    for (const [i, s] of p.stages.entries()) {
      if (s.position !== i) {
        s.position = i;
        await db.update(pipelineStages).set({ position: i }).where(eq(pipelineStages.id, s.id));
      }
    }
    stage = row;
    cache.createdStages.push(`${p.name} › ${row.name}`);
  }
  return { pipeline: p, stage };
}

/** One chunk of an opportunities import: creates missing pipelines, stages and contacts as it goes. */
export async function importOpportunityRecords(
  workspaceId: string,
  records: RawRecord<OpportunityField>[],
  opts: { currency?: string; tag?: string; fileName?: string; now?: Date } = {},
): Promise<OpportunityImportSummary> {
  const summary: OpportunityImportSummary = { created: 0, updated: 0, merged: 0, skipped: [], contactsCreated: 0, pipelinesCreated: [], stagesCreated: [] };
  const clean: CleanOpportunity[] = [];
  for (const r of records) {
    const o = normalizeOpportunity(r, { tag: opts.tag, now: opts.now });
    if (isSkipped(o)) summary.skipped.push(o);
    else clean.push(o);
  }
  if (!clean.length) return summary;
  const currency = isCurrency(opts.currency) ? opts.currency : "USD";
  const db = await getDb();
  const cache = await pipelineCache(workspaceId);
  const index = await loadIndex(workspaceId, clean);
  const label = `Imported ${today()}${opts.fileName ? ` from ${opts.fileName.slice(0, 80)}` : ""}:`;

  for (const o of clean) {
    // The person.
    let contact: Contact | undefined;
    if (o.email || o.phone) {
      const name = splitFullName(o.contactName);
      const incoming = { email: o.email, phone: o.phone, firstName: name.firstName.slice(0, 80), lastName: name.lastName.slice(0, 80), tags: o.tags, noteLines: [] as string[] };
      contact = index.find(o.email, o.phone);
      if (contact) contact = await mergeInto(contact, incoming, label);
      else {
        const [created] = await db
          .insert(contacts)
          .values({ workspaceId, ...incoming, notes: "", source: "import", ...(o.createdAt ? { createdAt: new Date(o.createdAt) } : {}) })
          .onConflictDoNothing()
          .returning();
        if (created) {
          contact = created;
          summary.contactsCreated++;
          await db.insert(activities).values({ workspaceId, contactId: created.id, type: "imported", data: { file: opts.fileName ?? "" } });
        }
      }
      if (contact) index.add(contact);
    }
    const { pipeline, stage } = await resolveStage(workspaceId, cache, o.pipeline, o.stage, currency);
    const status = o.status ?? (stage.kind === "won" ? "won" : stage.kind === "lost" ? "lost" : "open");
    const closedAt = status === "won" || status === "lost" ? new Date(o.updatedAt ?? o.createdAt ?? Date.now()) : null;
    const notes = noteBlock(o.contactName && !contact ? [`Contact: ${o.contactName}`, ...o.noteLines] : o.noteLines, label);

    // Already imported? By the export's own id, else the same person + pipeline + name.
    let existing: typeof opportunities.$inferSelect | undefined;
    if (o.externalId) {
      [existing] = await db.select().from(opportunities).where(and(eq(opportunities.workspaceId, workspaceId), eq(opportunities.externalId, o.externalId))).limit(1);
    }
    if (!existing && contact) {
      [existing] = await db
        .select()
        .from(opportunities)
        .where(and(eq(opportunities.workspaceId, workspaceId), eq(opportunities.contactId, contact.id), eq(opportunities.pipelineId, pipeline.id), sql`lower(${opportunities.title}) = ${o.title.toLowerCase()}`))
        .limit(1);
    }
    if (existing) {
      await db
        .update(opportunities)
        .set({
          stageId: stage.id,
          pipelineId: pipeline.id,
          status,
          valueCents: o.valueCents || existing.valueCents,
          source: o.source || existing.source,
          notes: mergeNotes(existing.notes, o.noteLines, label),
          closedAt: closedAt ?? null,
          externalId: existing.externalId ?? o.externalId,
          ...(o.daysInStage !== null ? { stageChangedAt: new Date(Date.now() - o.daysInStage * 86_400_000) } : existing.stageId !== stage.id ? { stageChangedAt: new Date() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(opportunities.id, existing.id));
      summary.updated++;
      continue;
    }
    await db.insert(opportunities).values({
      workspaceId,
      pipelineId: pipeline.id,
      stageId: stage.id,
      contactId: contact?.id ?? null,
      title: o.title,
      valueCents: o.valueCents,
      currency: pipeline.currency || currency,
      status,
      source: o.source,
      notes,
      externalId: o.externalId,
      closedAt,
      position: summary.created,
      // Time in stage: from the export when it says, otherwise it starts counting today.
      stageChangedAt: o.daysInStage !== null ? new Date(Date.now() - o.daysInStage * 86_400_000) : new Date(),
      ...(o.createdAt ? { createdAt: new Date(o.createdAt) } : {}),
    });
    summary.created++;
  }
  summary.pipelinesCreated = cache.createdPipelines;
  summary.stagesCreated = cache.createdStages;
  return summary;
}

/** One line on the workspace's activity log once a whole file is in. */
export async function logImportFinished(workspaceId: string, data: { kind: "contacts" | "opportunities"; file: string; created: number; updated: number; skipped: number }) {
  await logActivity({ workspaceId, type: "import_finished", data });
}
