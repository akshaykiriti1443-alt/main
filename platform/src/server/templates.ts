import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { automations, emailSequences, emailSequenceSteps, pages, sites, templates } from "@/lib/db/schema";
import type { AutomationAction, TemplateData } from "@/lib/db/types";
import { createSite } from "./sites";

// Templates ("snapshots") copy funnels, email sequences and automations from one
// workspace into another. Contacts and messages never travel.

const placeholder = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

export async function exportWorkspace(workspaceId: string): Promise<TemplateData> {
  const db = await getDb();
  const siteRows = await db.select().from(sites).where(eq(sites.workspaceId, workspaceId)).orderBy(asc(sites.createdAt));
  const out: TemplateData = { sites: [], sequences: [], automations: [] };
  for (const s of siteRows) {
    const p = await db.select().from(pages).where(eq(pages.siteId, s.id)).orderBy(asc(pages.createdAt));
    out.sites.push({
      name: s.name,
      theme: s.theme,
      skoolUrl: "",
      leadMagnetName: s.leadMagnetName,
      leadMagnetUrl: s.leadMagnetUrl.startsWith("/") ? s.leadMagnetUrl : "",
      pages: p.map((pg) => ({ slug: pg.slug, title: pg.title, kind: pg.kind, content: pg.content })),
    });
  }
  const seqs = await db.select().from(emailSequences).where(eq(emailSequences.workspaceId, workspaceId)).orderBy(asc(emailSequences.createdAt));
  const seqIndex = new Map<string, number>();
  for (const [i, seq] of seqs.entries()) {
    seqIndex.set(seq.id, i);
    const steps = await db.select().from(emailSequenceSteps).where(eq(emailSequenceSteps.sequenceId, seq.id)).orderBy(asc(emailSequenceSteps.position));
    out.sequences.push({
      name: seq.name,
      trigger: seq.trigger,
      triggerValue: seq.trigger === "lead_created" ? "" : seq.triggerValue,
      steps: steps.map((s) => ({ position: s.position, delayMinutes: s.delayMinutes, subject: s.subject, body: s.body })),
    });
  }
  const autos = await db.select().from(automations).where(eq(automations.workspaceId, workspaceId)).orderBy(asc(automations.createdAt));
  for (const a of autos) {
    const actions: AutomationAction[] = a.actions.flatMap((act): AutomationAction[] => {
      if (act.type !== "enroll_sequence") return [act];
      const i = seqIndex.get(act.sequenceId);
      return i === undefined ? [] : [{ ...act, sequenceId: placeholder(i) }];
    });
    out.automations.push({ name: a.name, trigger: a.trigger.type === "lead_created" ? { ...a.trigger, value: "" } : a.trigger, actions });
  }
  return out;
}

export async function saveTemplate(input: { agencyId: string | null; name: string; description: string; workspaceId: string }) {
  const data = await exportWorkspace(input.workspaceId);
  const db = await getDb();
  const [row] = await db
    .insert(templates)
    .values({ agencyId: input.agencyId, name: input.name, description: input.description, data })
    .returning({ id: templates.id });
  return row.id;
}

export async function listTemplates(agencyId: string | null) {
  const db = await getDb();
  return db
    .select({ id: templates.id, name: templates.name, description: templates.description, agencyId: templates.agencyId, createdAt: templates.createdAt })
    .from(templates)
    .where(agencyId ? or(isNull(templates.agencyId), eq(templates.agencyId, agencyId)) : isNull(templates.agencyId))
    .orderBy(desc(templates.createdAt));
}

export async function deleteTemplate(agencyId: string | null, templateId: string) {
  const db = await getDb();
  await db
    .delete(templates)
    .where(and(eq(templates.id, templateId), agencyId ? eq(templates.agencyId, agencyId) : isNull(templates.agencyId)));
}

export async function applyTemplate(workspaceId: string, templateId: string, opts: { allowedAgencyId: string | null }) {
  const db = await getDb();
  const [tpl] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
  if (!tpl || (tpl.agencyId && tpl.agencyId !== opts.allowedAgencyId)) throw new Error("Template not found");
  return importTemplateData(workspaceId, tpl.data);
}

export async function importTemplateData(workspaceId: string, data: TemplateData) {
  const db = await getDb();
  for (const s of data.sites) {
    await createSite({
      workspaceId,
      name: s.name,
      theme: s.theme,
      skoolUrl: s.skoolUrl,
      leadMagnetName: s.leadMagnetName,
      leadMagnetUrl: s.leadMagnetUrl,
      pages: s.pages,
    });
  }
  const newSeqIds: string[] = [];
  for (const seq of data.sequences) {
    const [row] = await db
      .insert(emailSequences)
      .values({ workspaceId, name: seq.name, trigger: seq.trigger, triggerValue: seq.triggerValue, active: true })
      .returning({ id: emailSequences.id });
    newSeqIds.push(row.id);
    if (seq.steps.length) await db.insert(emailSequenceSteps).values(seq.steps.map((st) => ({ ...st, sequenceId: row.id })));
  }
  for (const a of data.automations) {
    const actions = a.actions.flatMap((act): AutomationAction[] => {
      if (act.type !== "enroll_sequence") return [act];
      const idx = Number(act.sequenceId.slice(-12));
      return newSeqIds[idx] ? [{ ...act, sequenceId: newSeqIds[idx] }] : [];
    });
    await db.insert(automations).values({ workspaceId, name: a.name, trigger: a.trigger, actions, active: false });
  }
}
