"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/server/tenancy";
import { hasFeature } from "@/server/plans";
import { isUuid } from "@/lib/util";
import { draftAutomation } from "@/server/ai/automationDraft";
import { field } from "./helpers";

export type AutomationAiState = { error?: string } | null;

/**
 * "Tell your AI what to automate". The AI drafts it; the builder opens the draft so the owner can
 * read every step and press Save. Nothing goes live from here.
 */
export async function draftAutomationAction(wid: string, automationId: string | null, _prev: AutomationAiState, fd: FormData): Promise<AutomationAiState> {
  const { workspace } = await requireWorkspace(wid, "admin");
  if (!hasFeature(workspace.plan, "automations")) return { error: "Automations are on the Growth plan." };
  const id = automationId && isUuid(automationId) ? automationId : null;
  const r = await draftAutomation(wid, { request: field(fd, "request", 1500), automationId: id });
  if (!r.ok) return { error: r.error };
  redirect(`/app/w/${wid}/automations/${id ?? "new"}?draft=${r.draftId}`);
}
