import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import {
  contacts,
  opportunities,
  pipelines,
  pipelineStages,
  workspaces,
  type OpportunityStatus,
  type StageKind,
} from "@/lib/db/schema";
import { isUuid } from "@/lib/util";
import { logActivity } from "./activity";
import { contactName } from "./contacts";
import { emitEvent } from "./events";
import { hasFeature } from "./plans";

// Deal boards, like GHL's opportunities: pipelines with ordered stages, and deals that move through
// them. Moving a deal (by hand, by an automation or by a booking) fires "opportunity moves to
// stage" automations. Every workspace gets the default "Sales" pipeline the first time it's needed.

export type Pipeline = typeof pipelines.$inferSelect;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type PipelineWithStages = Pipeline & { stages: PipelineStage[] };

export const DEFAULT_PIPELINE_NAME = "Sales";
export const DEFAULT_STAGES: { key: string; name: string; kind: StageKind }[] = [
  { key: "new_lead", name: "New lead", kind: "open" },
  { key: "contacted", name: "Contacted", kind: "open" },
  { key: "call_booked", name: "Call booked", kind: "open" },
  { key: "proposal_sent", name: "Proposal sent", kind: "open" },
  { key: "won", name: "Won", kind: "won" },
  { key: "lost", name: "Lost", kind: "lost" },
];

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "NZD", "INR", "SGD", "AED", "ZAR", "CHF", "SEK", "NOK", "DKK", "BRL", "MXN", "JPY"] as const;
export const isCurrency = (c: unknown): c is (typeof CURRENCIES)[number] => typeof c === "string" && (CURRENCIES as readonly string[]).includes(c);

export class PipelineError extends Error {}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** "Closed won" / "Won" -> won, "Lost" -> lost, anything else is an open stage. */
export function kindForStageName(name: string): StageKind {
  const s = name.trim().toLowerCase();
  if (/^(closed[ -]?)?won\b|\bwon$/.test(s)) return "won";
  if (/^(closed[ -]?)?lost\b|\blost$/.test(s)) return "lost";
  return "open";
}

/** What a deal's status becomes when it lands in a stage of this kind. */
function statusForKind(kind: StageKind, current: OpportunityStatus): OpportunityStatus {
  if (kind === "won") return "won";
  if (kind === "lost") return "lost";
  return current === "won" || current === "lost" ? "open" : current;
}

// ---------------------------------------------------------------------------
// Pipelines and stages
// ---------------------------------------------------------------------------

/** The workspace's default pipeline, created ("Sales", six stages) the first time it's needed. */
export async function ensureDefaultPipeline(workspaceId: string, conn?: DB): Promise<PipelineWithStages> {
  const db = conn ?? (await getDb());
  const load = async (p: Pipeline): Promise<PipelineWithStages> => ({
    ...p,
    stages: await db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, p.id)).orderBy(asc(pipelineStages.position)),
  });
  const [existing] = await db.select().from(pipelines).where(and(eq(pipelines.workspaceId, workspaceId), eq(pipelines.isDefault, true))).limit(1);
  if (existing) return load(existing);
  // Pipelines but none marked default (the owner deleted it): promote the first one.
  const [first] = await db.select().from(pipelines).where(eq(pipelines.workspaceId, workspaceId)).orderBy(asc(pipelines.position), asc(pipelines.createdAt)).limit(1);
  if (first) {
    const [promoted] = await db.update(pipelines).set({ isDefault: true }).where(eq(pipelines.id, first.id)).returning();
    return load(promoted ?? first);
  }
  const created = await db.transaction(async (tx) => {
    const [p] = await tx.insert(pipelines).values({ workspaceId, name: DEFAULT_PIPELINE_NAME, isDefault: true, position: 0 }).onConflictDoNothing().returning();
    if (!p) return null;
    await tx.insert(pipelineStages).values(DEFAULT_STAGES.map((s, i) => ({ workspaceId, pipelineId: p.id, name: s.name, kind: s.kind, key: s.key, position: i })));
    return p;
  });
  if (created) return load(created);
  // Another request created it at the same moment.
  const [winner] = await db.select().from(pipelines).where(and(eq(pipelines.workspaceId, workspaceId), eq(pipelines.isDefault, true))).limit(1);
  return load(winner);
}

export async function listPipelines(workspaceId: string): Promise<PipelineWithStages[]> {
  await ensureDefaultPipeline(workspaceId);
  const db = await getDb();
  const list = await db.select().from(pipelines).where(eq(pipelines.workspaceId, workspaceId)).orderBy(desc(pipelines.isDefault), asc(pipelines.position), asc(pipelines.createdAt));
  const stages = list.length
    ? await db.select().from(pipelineStages).where(inArray(pipelineStages.pipelineId, list.map((p) => p.id))).orderBy(asc(pipelineStages.position))
    : [];
  return list.map((p) => ({ ...p, stages: stages.filter((s) => s.pipelineId === p.id) }));
}

export async function getPipeline(workspaceId: string, pipelineId: string): Promise<PipelineWithStages | null> {
  if (!isUuid(pipelineId)) return null;
  const db = await getDb();
  const [p] = await db.select().from(pipelines).where(and(eq(pipelines.id, pipelineId), eq(pipelines.workspaceId, workspaceId))).limit(1);
  if (!p) return null;
  const stages = await db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, p.id)).orderBy(asc(pipelineStages.position));
  return { ...p, stages };
}

export type StageInput = { id?: string | null; name: string; kind?: StageKind };

function cleanStages(stages: StageInput[]): StageInput[] {
  const out = stages
    .map((s) => ({ id: s.id && isUuid(s.id) ? s.id : null, name: s.name.trim().replace(/\s+/g, " ").slice(0, 60), kind: s.kind ?? kindForStageName(s.name) }))
    .filter((s) => s.name);
  if (out.length === 0) throw new PipelineError("A pipeline needs at least one stage.");
  if (out.length > 20) throw new PipelineError("Keep it to 20 stages or fewer.");
  const seen = new Set<string>();
  for (const s of out) {
    const k = s.name.toLowerCase();
    if (seen.has(k)) throw new PipelineError(`Two stages are called "${s.name}". Give each a different name.`);
    seen.add(k);
  }
  return out;
}

/** A new pipeline. Without stages it gets the same six as the default one. */
export async function createPipeline(workspaceId: string, input: { name: string; currency?: string; stages?: StageInput[] }) {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new PipelineError("Give the pipeline a name.");
  const db = await getDb();
  const existing = await db.select({ name: pipelines.name, position: pipelines.position }).from(pipelines).where(eq(pipelines.workspaceId, workspaceId));
  if (existing.some((p) => sameName(p.name, name))) throw new PipelineError(`You already have a pipeline called "${name}".`);
  if (existing.length >= 20) throw new PipelineError("That's 20 pipelines already. Reuse one, or delete one you don't need.");
  const stages = input.stages?.length ? cleanStages(input.stages) : DEFAULT_STAGES.map((s) => ({ name: s.name, kind: s.kind }));
  return db.transaction(async (tx) => {
    const [p] = await tx
      .insert(pipelines)
      .values({ workspaceId, name, currency: isCurrency(input.currency) ? input.currency : "USD", position: Math.max(0, ...existing.map((e) => e.position)) + 1 })
      .returning();
    await tx.insert(pipelineStages).values(stages.map((s, i) => ({ workspaceId, pipelineId: p.id, name: s.name, kind: s.kind ?? "open", position: i })));
    return p;
  });
}

/**
 * Rename a pipeline and set its stages in order: existing stages keep their id (so their deals stay),
 * new ones are added, and the deals in a removed stage move to the nearest stage before it.
 */
export async function savePipeline(workspaceId: string, pipelineId: string, input: { name: string; currency?: string; stages: StageInput[] }) {
  const current = await getPipeline(workspaceId, pipelineId);
  if (!current) throw new PipelineError("That pipeline doesn't exist any more.");
  const name = input.name.trim().slice(0, 80) || current.name;
  const stages = cleanStages(input.stages);
  const db = await getDb();
  const others = await db.select({ name: pipelines.name }).from(pipelines).where(and(eq(pipelines.workspaceId, workspaceId), ne(pipelines.id, pipelineId)));
  if (others.some((p) => sameName(p.name, name))) throw new PipelineError(`You already have a pipeline called "${name}".`);
  const keepIds = new Set(stages.map((s) => s.id).filter((x): x is string => Boolean(x) && current.stages.some((c) => c.id === x)));
  const removed = current.stages.filter((s) => !keepIds.has(s.id));
  let moved = 0;
  await db.transaction(async (tx) => {
    await tx
      .update(pipelines)
      .set({ name, ...(isCurrency(input.currency) ? { currency: input.currency } : {}) })
      .where(eq(pipelines.id, pipelineId));
    const finalIds: string[] = [];
    for (const [i, s] of stages.entries()) {
      if (s.id && keepIds.has(s.id)) {
        await tx.update(pipelineStages).set({ name: s.name, kind: s.kind ?? "open", position: i }).where(eq(pipelineStages.id, s.id));
        finalIds.push(s.id);
      } else {
        const [row] = await tx.insert(pipelineStages).values({ workspaceId, pipelineId, name: s.name, kind: s.kind ?? "open", position: i }).returning({ id: pipelineStages.id });
        finalIds.push(row.id);
      }
    }
    for (const r of removed) {
      // The nearest surviving stage that came before it (or the first stage).
      const before = current.stages.filter((s) => s.position < r.position && keepIds.has(s.id)).at(-1);
      const target = before?.id ?? finalIds[0];
      const res = await tx.update(opportunities).set({ stageId: target, updatedAt: new Date() }).where(eq(opportunities.stageId, r.id)).returning({ id: opportunities.id });
      moved += res.length;
      await tx.delete(pipelineStages).where(eq(pipelineStages.id, r.id));
    }
  });
  return { moved };
}

/** Deletes an empty pipeline (never the last one). Deals have to be moved or deleted first. */
export async function deletePipeline(workspaceId: string, pipelineId: string) {
  const current = await getPipeline(workspaceId, pipelineId);
  if (!current) return;
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(pipelines).where(eq(pipelines.workspaceId, workspaceId));
  if (n <= 1) throw new PipelineError("This is your only pipeline, so it stays. Rename it instead.");
  const [{ deals }] = await db.select({ deals: sql<number>`count(*)::int` }).from(opportunities).where(eq(opportunities.pipelineId, pipelineId));
  if (deals > 0) throw new PipelineError(`It still has ${deals} deal${deals === 1 ? "" : "s"}. Move or delete ${deals === 1 ? "it" : "them"} first.`);
  await db.delete(pipelines).where(eq(pipelines.id, pipelineId));
  if (current.isDefault) await ensureDefaultPipeline(workspaceId);
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

export type BoardDeal = Opportunity & { contact: { id: string; name: string; email: string | null; phone: string | null } | null };
export type BoardColumn = PipelineStage & { deals: BoardDeal[]; totals: Record<string, number> };
export type Board = { pipeline: PipelineWithStages; pipelines: PipelineWithStages[]; columns: BoardColumn[]; totals: { open: Record<string, number>; won: Record<string, number>; openCount: number } };

export async function getBoard(workspaceId: string, pipelineId?: string | null): Promise<Board> {
  const all = await listPipelines(workspaceId);
  const pipeline = all.find((p) => p.id === pipelineId) ?? all.find((p) => p.isDefault) ?? all[0];
  const db = await getDb();
  const rows = await db
    .select({ deal: opportunities, contact: { id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, phone: contacts.phone } })
    .from(opportunities)
    .leftJoin(contacts, eq(contacts.id, opportunities.contactId))
    .where(and(eq(opportunities.workspaceId, workspaceId), eq(opportunities.pipelineId, pipeline.id)))
    .orderBy(asc(opportunities.position), desc(opportunities.updatedAt))
    .limit(2000);
  const add = (t: Record<string, number>, d: Opportunity) => void (t[d.currency] = (t[d.currency] ?? 0) + d.valueCents);
  const totals = { open: {} as Record<string, number>, won: {} as Record<string, number>, openCount: 0 };
  const columns: BoardColumn[] = pipeline.stages.map((s) => ({ ...s, deals: [], totals: {} }));
  for (const { deal, contact } of rows) {
    const col = columns.find((c) => c.id === deal.stageId) ?? columns[0];
    col.deals.push({ ...deal, contact: contact?.id ? { id: contact.id, name: contactName(contact), email: contact.email, phone: contact.phone } : null });
    add(col.totals, deal);
    if (deal.status === "open") {
      add(totals.open, deal);
      totals.openCount++;
    }
    if (deal.status === "won") add(totals.won, deal);
  }
  return { pipeline, pipelines: all, columns, totals };
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export async function getOpportunity(workspaceId: string, id: string) {
  if (!isUuid(id)) return null;
  const db = await getDb();
  const [o] = await db.select().from(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.workspaceId, workspaceId))).limit(1);
  return o ?? null;
}

async function stageInWorkspace(workspaceId: string, stageId: string) {
  if (!isUuid(stageId)) return null;
  const db = await getDb();
  const [s] = await db.select().from(pipelineStages).where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.workspaceId, workspaceId))).limit(1);
  return s ?? null;
}

async function contactInWorkspace(workspaceId: string, contactId: string | null | undefined) {
  if (!contactId) return null;
  if (!isUuid(contactId)) throw new PipelineError("That contact doesn't exist.");
  const db = await getDb();
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId))).limit(1);
  if (!c) throw new PipelineError("That contact doesn't exist.");
  return c;
}

/** Puts a deal at `index` in its column and renumbers the column (columns are short). */
async function placeInColumn(db: DB, stageId: string, dealId: string, index: number) {
  const ids = (await db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.stageId, stageId)).orderBy(asc(opportunities.position), desc(opportunities.updatedAt))).map((r) => r.id).filter((x) => x !== dealId);
  ids.splice(Math.max(0, Math.min(index, ids.length)), 0, dealId);
  // One statement for the whole column: position = order in the list.
  await db.execute(sql`
    update ${opportunities} set position = t.ord - 1
    from unnest(array[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::uuid[]) with ordinality as t(id, ord)
    where ${opportunities.id} = t.id`);
}

async function topPosition(db: DB, stageId: string) {
  const [row] = await db.select({ p: sql<number | null>`min(${opportunities.position})` }).from(opportunities).where(eq(opportunities.stageId, stageId));
  return (row?.p ?? 1) - 1;
}

export type OpportunityInput = {
  title: string;
  pipelineId?: string | null;
  stageId?: string | null;
  contactId?: string | null;
  valueCents?: number;
  currency?: string;
  status?: OpportunityStatus;
  source?: string;
  notes?: string;
  externalId?: string | null;
  createdAt?: Date | null;
  closedAt?: Date | null;
};

/** A new deal at the top of its stage. Fires "opportunity moves to stage" unless emit is false. */
export async function createOpportunity(workspaceId: string, input: OpportunityInput, opts: { emit?: boolean; by?: string } = {}) {
  const db = await getDb();
  let stage = input.stageId ? await stageInWorkspace(workspaceId, input.stageId) : null;
  if (input.stageId && !stage) throw new PipelineError("That stage doesn't exist any more.");
  if (!stage) {
    const p = input.pipelineId ? await getPipeline(workspaceId, input.pipelineId) : await ensureDefaultPipeline(workspaceId);
    if (!p) throw new PipelineError("That pipeline doesn't exist any more.");
    stage = p.stages[0];
  }
  const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.id, stage.pipelineId)).limit(1);
  const contact = await contactInWorkspace(workspaceId, input.contactId);
  const title = (input.title.trim() || (contact ? contactName(contact) : "") || "New deal").slice(0, 200);
  const status = input.status ?? statusForKind(stage.kind, "open");
  const [deal] = await db
    .insert(opportunities)
    .values({
      workspaceId,
      pipelineId: stage.pipelineId,
      stageId: stage.id,
      contactId: contact?.id ?? null,
      title,
      valueCents: Math.max(0, Math.round(input.valueCents ?? 0)),
      currency: isCurrency(input.currency) ? input.currency : pipeline.currency,
      status,
      source: (input.source ?? "").slice(0, 200),
      notes: (input.notes ?? "").slice(0, 10000),
      externalId: input.externalId ?? null,
      position: await topPosition(db, stage.id),
      closedAt: status === "won" || status === "lost" ? (input.closedAt ?? new Date()) : null,
      ...(input.createdAt ? { createdAt: input.createdAt, stageChangedAt: input.createdAt } : {}),
    })
    .returning();
  if (contact && opts.emit !== false) {
    await logActivity({ workspaceId, contactId: contact.id, type: "opportunity_created", refId: deal.id, data: { title, stage: stage.name, pipeline: pipeline.name, by: opts.by ?? "" } });
    await emitEvent({ type: "opportunity_stage_changed", workspaceId, contactId: contact.id, opportunityId: deal.id, pipelineId: stage.pipelineId, stageId: stage.id, stageName: stage.name });
  }
  return deal;
}

/**
 * Moves a deal to a stage (any pipeline in the workspace) and, with `index`, to a spot in that
 * column. A won or lost stage closes the deal; an open stage reopens it.
 */
export async function moveOpportunity(workspaceId: string, id: string, stageId: string, opts: { index?: number; emit?: boolean; by?: string } = {}) {
  const deal = await getOpportunity(workspaceId, id);
  if (!deal) throw new PipelineError("That deal doesn't exist any more.");
  const stage = await stageInWorkspace(workspaceId, stageId);
  if (!stage) throw new PipelineError("That stage doesn't exist any more.");
  const db = await getDb();
  const changed = deal.stageId !== stage.id;
  if (changed) {
    const status = statusForKind(stage.kind, deal.status);
    await db
      .update(opportunities)
      .set({
        stageId: stage.id,
        pipelineId: stage.pipelineId,
        status,
        stageChangedAt: new Date(),
        closedAt: status === "won" || status === "lost" ? (deal.closedAt && deal.status === status ? deal.closedAt : new Date()) : null,
        position: await topPosition(db, stage.id),
        updatedAt: new Date(),
      })
      .where(eq(opportunities.id, deal.id));
  }
  if (opts.index !== undefined && Number.isFinite(opts.index)) await placeInColumn(db, stage.id, deal.id, Math.floor(opts.index));
  if (changed && deal.contactId && opts.emit !== false) {
    const [from] = await db.select({ name: pipelineStages.name }).from(pipelineStages).where(eq(pipelineStages.id, deal.stageId)).limit(1);
    await logActivity({ workspaceId, contactId: deal.contactId, type: "opportunity_moved", refId: deal.id, data: { title: deal.title, from: from?.name ?? "", to: stage.name, by: opts.by ?? "" } });
    await emitEvent({ type: "opportunity_stage_changed", workspaceId, contactId: deal.contactId, opportunityId: deal.id, pipelineId: stage.pipelineId, stageId: stage.id, stageName: stage.name });
  }
  return { changed, stage };
}

export async function updateOpportunity(
  workspaceId: string,
  id: string,
  patch: { title?: string; valueCents?: number; currency?: string; status?: OpportunityStatus; notes?: string; source?: string; contactId?: string | null; stageId?: string },
  opts: { by?: string } = {},
) {
  const deal = await getOpportunity(workspaceId, id);
  if (!deal) throw new PipelineError("That deal doesn't exist any more.");
  if (patch.stageId && patch.stageId !== deal.stageId) await moveOpportunity(workspaceId, id, patch.stageId, { by: opts.by });
  const contact = patch.contactId === undefined ? undefined : await contactInWorkspace(workspaceId, patch.contactId);
  const db = await getDb();
  const fresh = (await getOpportunity(workspaceId, id))!;
  const status = patch.status ?? fresh.status;
  const [row] = await db
    .update(opportunities)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 200) || fresh.title } : {}),
      ...(patch.valueCents !== undefined ? { valueCents: Math.max(0, Math.round(patch.valueCents)) } : {}),
      ...(isCurrency(patch.currency) ? { currency: patch.currency } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes.slice(0, 10000) } : {}),
      ...(patch.source !== undefined ? { source: patch.source.slice(0, 200) } : {}),
      ...(contact !== undefined ? { contactId: contact?.id ?? null } : {}),
      status,
      closedAt: status === "won" || status === "lost" ? (fresh.closedAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(eq(opportunities.id, id))
    .returning();
  return row;
}

export async function deleteOpportunity(workspaceId: string, id: string) {
  if (!isUuid(id)) return;
  const db = await getDb();
  await db.delete(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.workspaceId, workspaceId)));
}

export type ContactDeal = Opportunity & { stageName: string; stageKind: StageKind; pipelineName: string };

export async function contactOpportunities(workspaceId: string, contactId: string): Promise<ContactDeal[]> {
  if (!isUuid(contactId)) return [];
  const db = await getDb();
  const rows = await db
    .select({ deal: opportunities, stageName: pipelineStages.name, stageKind: pipelineStages.kind, pipelineName: pipelines.name })
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .innerJoin(pipelines, eq(pipelines.id, opportunities.pipelineId))
    .where(and(eq(opportunities.workspaceId, workspaceId), eq(opportunities.contactId, contactId)))
    .orderBy(desc(opportunities.updatedAt));
  return rows.map((r) => ({ ...r.deal, stageName: r.stageName, stageKind: r.stageKind, pipelineName: r.pipelineName }));
}

export async function listOpportunities(
  workspaceId: string,
  filter: { pipelineId?: string; stageId?: string; status?: OpportunityStatus; contactId?: string; limit?: number } = {},
) {
  const db = await getDb();
  const conds = [eq(opportunities.workspaceId, workspaceId)];
  if (filter.pipelineId && isUuid(filter.pipelineId)) conds.push(eq(opportunities.pipelineId, filter.pipelineId));
  if (filter.stageId && isUuid(filter.stageId)) conds.push(eq(opportunities.stageId, filter.stageId));
  if (filter.contactId && isUuid(filter.contactId)) conds.push(eq(opportunities.contactId, filter.contactId));
  if (filter.status) conds.push(eq(opportunities.status, filter.status));
  return db
    .select({ deal: opportunities, stageName: pipelineStages.name, pipelineName: pipelines.name, contact: { id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, phone: contacts.phone } })
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .innerJoin(pipelines, eq(pipelines.id, opportunities.pipelineId))
    .leftJoin(contacts, eq(contacts.id, opportunities.contactId))
    .where(and(...conds))
    .orderBy(desc(opportunities.updatedAt))
    .limit(Math.min(200, filter.limit ?? 50));
}

/** A stage by name (any case) in one pipeline. */
export function stageNamed(p: PipelineWithStages, name: string) {
  return p.stages.find((s) => sameName(s.name, name)) ?? null;
}

/**
 * For automations: moves the contact's deal to the stage called `stageName`. Uses the deal the
 * automation is about when there is one, else their most recent open deal; with no deal at all it
 * creates one in the default pipeline (when that pipeline has such a stage).
 */
export async function moveContactDealToStageNamed(
  workspaceId: string,
  contactId: string,
  stageName: string,
  opts: { opportunityId?: string; title?: string; by?: string } = {},
): Promise<{ ok: boolean; message: string; opportunityId?: string }> {
  const db = await getDb();
  let deal = opts.opportunityId ? await getOpportunity(workspaceId, opts.opportunityId) : null;
  if (!deal) {
    [deal] = await db
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.workspaceId, workspaceId), eq(opportunities.contactId, contactId), eq(opportunities.status, "open")))
      .orderBy(desc(opportunities.updatedAt))
      .limit(1);
  }
  if (deal) {
    const p = await getPipeline(workspaceId, deal.pipelineId);
    const stage = p ? stageNamed(p, stageName) : null;
    if (!stage) return { ok: false, message: `No stage called "${stageName}" in ${p?.name ?? "that pipeline"}` };
    const r = await moveOpportunity(workspaceId, deal.id, stage.id, { by: opts.by });
    return { ok: true, message: r.changed ? `Moved "${deal.title}" to ${stage.name}` : `"${deal.title}" is already in ${stage.name}`, opportunityId: deal.id };
  }
  const p = await ensureDefaultPipeline(workspaceId);
  const stage = stageNamed(p, stageName);
  if (!stage) return { ok: false, message: `No stage called "${stageName}" in ${p.name}` };
  const created = await createOpportunity(workspaceId, { title: opts.title ?? "", contactId, stageId: stage.id }, { by: opts.by });
  return { ok: true, message: `Created an opportunity in ${stage.name}`, opportunityId: created.id };
}

/**
 * After a booking: puts the contact's deal in the default pipeline's "Call booked" stage. Deals
 * already further along (Proposal sent, Won) stay where they are. Skipped when the workspace's plan
 * has no pipelines, or the owner removed that stage.
 */
export async function markCallBooked(workspaceId: string, contactId: string, title: string) {
  const db = await getDb();
  const [ws] = await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!ws || !hasFeature(ws.plan, "pipelines")) return null;
  const p = await ensureDefaultPipeline(workspaceId);
  const stage = p.stages.find((s) => s.key === "call_booked") ?? stageNamed(p, "Call booked");
  if (!stage) return null;
  const [deal] = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.workspaceId, workspaceId), eq(opportunities.pipelineId, p.id), eq(opportunities.contactId, contactId), eq(opportunities.status, "open")))
    .orderBy(desc(opportunities.updatedAt))
    .limit(1);
  if (deal) {
    const current = p.stages.find((s) => s.id === deal.stageId);
    if (current && current.position >= stage.position) return deal.id;
    await moveOpportunity(workspaceId, deal.id, stage.id, { by: "booking" });
    return deal.id;
  }
  const created = await createOpportunity(workspaceId, { title, contactId, stageId: stage.id, source: "Booking" }, { by: "booking" });
  return created.id;
}

export { formatCents, formatTotals } from "@/lib/money";
