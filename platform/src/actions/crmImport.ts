"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CONTACT_FIELDS, OPPORTUNITY_FIELDS, type ContactField, type OpportunityField, type RawRecord } from "@/lib/crmImport";
import { IMPORT_CHUNK, importContactRecords, importOpportunityRecords, logImportFinished, type ImportSummary, type OpportunityImportSummary } from "@/server/crmImport";
import { hasFeature } from "@/server/plans";
import { requireWorkspace } from "@/server/tenancy";
import { errMsg } from "./helpers";

// The import page sends the file in chunks (already mapped to fields, still raw text). Everything
// is validated and cleaned again here.

const contactKeys = CONTACT_FIELDS.map((f) => f.value).filter((f) => f !== "skip" && f !== "notes") as [ContactField, ...ContactField[]];
const oppKeys = OPPORTUNITY_FIELDS.map((f) => f.value).filter((f) => f !== "skip" && f !== "notes") as [OpportunityField, ...OpportunityField[]];
const recordSchema = <F extends string>(keys: [F, ...F[]]) =>
  z.object({
    row: z.number().int().min(0).max(1_000_000),
    fields: z.record(z.enum(keys), z.string().max(4000)),
    extras: z.array(z.tuple([z.string().max(200), z.string().max(4000)])).max(80),
  });

const optsSchema = z.object({
  tag: z.string().max(60).optional(),
  fileName: z.string().max(200).optional(),
  currency: z.string().length(3).optional(),
});

export type ChunkResult = { ok: true; summary: ImportSummary | OpportunityImportSummary } | { ok: false; error: string };

export async function importChunkAction(wid: string, kind: "contacts" | "opportunities", records: unknown, opts: unknown): Promise<ChunkResult> {
  try {
    const { workspace } = await requireWorkspace(wid);
    const o = optsSchema.parse(opts ?? {});
    if (kind === "opportunities") {
      if (!hasFeature(workspace.plan, "pipelines")) return { ok: false, error: "Importing opportunities needs the Growth plan (Pipelines). Contacts import on every plan." };
      const rows = z.array(recordSchema(oppKeys)).max(IMPORT_CHUNK).parse(records) as RawRecord<OpportunityField>[];
      return { ok: true, summary: await importOpportunityRecords(wid, rows, o) };
    }
    const rows = z.array(recordSchema(contactKeys)).max(IMPORT_CHUNK).parse(records) as RawRecord<ContactField>[];
    return { ok: true, summary: await importContactRecords(wid, rows, o) };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: "Part of the file couldn't be read. Check the column choices and try again." };
    console.error("[import]", err);
    return { ok: false, error: errMsg(err) };
  }
}

export async function finishImportAction(wid: string, data: { kind: "contacts" | "opportunities"; file: string; created: number; updated: number; skipped: number }) {
  await requireWorkspace(wid);
  const v = z.object({ kind: z.enum(["contacts", "opportunities"]), file: z.string().max(200), created: z.number().int().min(0), updated: z.number().int().min(0), skipped: z.number().int().min(0) }).parse(data);
  await logImportFinished(wid, v);
  revalidatePath(`/app/w/${wid}/leads`);
  if (v.kind === "opportunities") revalidatePath(`/app/w/${wid}/pipeline`);
}
