"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { centsFromInput } from "@/lib/money";
import { contactName } from "@/server/contacts";
import { hasFeature } from "@/server/plans";
import {
  createOpportunity,
  createPipeline,
  deleteOpportunity,
  deletePipeline,
  moveOpportunity,
  PipelineError,
  savePipeline,
  updateOpportunity,
} from "@/server/pipelines";
import { requireWorkspace } from "@/server/tenancy";
import { errMsg } from "./helpers";

// Pipeline board actions. Each returns { ok } or { ok: false, error } so the board can update in
// place (drag and drop) and show a friendly message when something goes wrong.

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function gate(wid: string) {
  const ctx = await requireWorkspace(wid);
  if (!hasFeature(ctx.workspace.plan, "pipelines")) throw new PipelineError("Pipelines are on the Growth plan. Upgrade in Plan & wallet.");
  return ctx;
}

const fail = (err: unknown): { ok: false; error: string } => {
  if (err instanceof PipelineError || err instanceof z.ZodError) return { ok: false, error: err instanceof z.ZodError ? (err.issues[0]?.message ?? "Check the form.") : err.message };
  console.error("[pipeline]", err);
  return { ok: false, error: errMsg(err) };
};

const uuid = z.string().uuid();
const done = (wid: string) => revalidatePath(`/app/w/${wid}/pipeline`);

/** Drag and drop (or the Move menu): a deal to a stage, optionally at a position in the column. */
export async function moveOpportunityAction(wid: string, id: string, stageId: string, index?: number): Promise<ActionResult<{ changed: boolean }>> {
  try {
    await gate(wid);
    const r = await moveOpportunity(wid, uuid.parse(id), uuid.parse(stageId), { index: index === undefined ? undefined : z.number().int().min(0).max(5000).parse(index), by: "Pipeline board" });
    done(wid);
    return { ok: true, changed: r.changed };
  } catch (err) {
    return fail(err);
  }
}

const opportunitySchema = z.object({
  title: z.string().trim().max(200).default(""),
  stageId: uuid,
  contactId: z.union([uuid, z.literal(""), z.null()]).optional(),
  value: z.union([z.string().max(40), z.number().min(0).max(100_000_000)]).default(0),
  currency: z.string().length(3).optional(),
  status: z.enum(["open", "won", "lost", "abandoned"]).optional(),
  source: z.string().max(200).optional(),
  notes: z.string().max(10000).optional(),
});
export type OpportunityForm = z.input<typeof opportunitySchema>;

/** Create (id null) or edit a deal from the drawer. */
export async function saveOpportunityAction(wid: string, id: string | null, input: OpportunityForm): Promise<ActionResult<{ id: string }>> {
  try {
    await gate(wid);
    const v = opportunitySchema.parse(input);
    const valueCents = typeof v.value === "number" ? Math.round(v.value * 100) : centsFromInput(v.value);
    const contactId = v.contactId ? v.contactId : null;
    if (!id) {
      if (!v.title && !contactId) return { ok: false, error: "Give it a name, or pick a contact." };
      const deal = await createOpportunity(wid, { title: v.title, stageId: v.stageId, contactId, valueCents, currency: v.currency, status: v.status, source: v.source, notes: v.notes }, { by: "Pipeline board" });
      done(wid);
      return { ok: true, id: deal.id };
    }
    await updateOpportunity(wid, uuid.parse(id), { title: v.title, stageId: v.stageId, contactId, valueCents, currency: v.currency, status: v.status, source: v.source, notes: v.notes }, { by: "Pipeline board" });
    done(wid);
    return { ok: true, id };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteOpportunityAction(wid: string, id: string): Promise<ActionResult> {
  try {
    await gate(wid);
    await deleteOpportunity(wid, uuid.parse(id));
    done(wid);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

const stagesSchema = z.array(z.object({ id: z.string().max(40).nullable().optional(), name: z.string().max(60), kind: z.enum(["open", "won", "lost"]) })).min(1).max(20);

export async function createPipelineAction(wid: string, input: { name: string; currency?: string; stages?: { name: string; kind: "open" | "won" | "lost" }[] }): Promise<ActionResult<{ id: string }>> {
  try {
    await gate(wid);
    const v = z.object({ name: z.string().max(80), currency: z.string().length(3).optional(), stages: stagesSchema.optional() }).parse(input);
    const p = await createPipeline(wid, v);
    done(wid);
    return { ok: true, id: p.id };
  } catch (err) {
    return fail(err);
  }
}

/** Rename a pipeline and set its stages in order (the stage editor). */
export async function savePipelineAction(wid: string, id: string, input: { name: string; currency?: string; stages: { id?: string | null; name: string; kind: "open" | "won" | "lost" }[] }): Promise<ActionResult<{ moved: number }>> {
  try {
    await gate(wid);
    const v = z.object({ name: z.string().max(80), currency: z.string().length(3).optional(), stages: stagesSchema }).parse(input);
    const r = await savePipeline(wid, uuid.parse(id), v);
    done(wid);
    return { ok: true, moved: r.moved };
  } catch (err) {
    return fail(err);
  }
}

export async function deletePipelineAction(wid: string, id: string): Promise<ActionResult> {
  try {
    await gate(wid);
    await deletePipeline(wid, uuid.parse(id));
    done(wid);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** The drawer's contact picker: up to 8 matches by name, email or phone. */
export async function searchContactsAction(wid: string, q: string): Promise<{ id: string; name: string; email: string | null; phone: string | null }[]> {
  try {
    await gate(wid);
  } catch {
    return [];
  }
  const term = String(q ?? "").trim().replace(/[%_\\]/g, "").slice(0, 80);
  if (term.length < 1) return [];
  const db = await getDb();
  const like = `%${term}%`;
  const rows = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.workspaceId, wid), or(ilike(contacts.email, like), ilike(contacts.firstName, like), ilike(contacts.lastName, like), ilike(contacts.phone, like))))
    .limit(8);
  return rows.map((c) => ({ id: c.id, name: contactName(c), email: c.email, phone: c.phone }));
}
