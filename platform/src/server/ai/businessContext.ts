import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations, workspaces } from "@/lib/db/schema";
import type { LaunchKitInput } from "./launchKit";

/**
 * What the member has already told us about their business, in one place: their settings first,
 * then the answers they gave their latest launch kit. Every "write it for me" button reads this,
 * so the AI (and the no-AI templates) never ask a beginner for the same thing twice.
 */
export type BusinessContext = {
  businessName: string;
  ownerName: string;
  niche: string;
  audience: string;
  outcome: string;
  offer: string;
  leadMagnetName: string;
  skoolUrl: string;
  tone: "friendly" | "bold" | "calm";
};

/** The answers from the member's newest launch kit, or null when they haven't built one. */
export async function latestKitAnswers(workspaceId: string): Promise<{ input: Partial<LaunchKitInput>; leadMagnetName: string } | null> {
  const db = await getDb();
  const [row] = await db
    .select({ input: aiGenerations.input, output: aiGenerations.output })
    .from(aiGenerations)
    .where(and(eq(aiGenerations.workspaceId, workspaceId), eq(aiGenerations.kind, "launch_kit")))
    .orderBy(desc(aiGenerations.createdAt))
    .limit(1);
  if (!row) return null;
  const name = typeof row.output?.leadMagnetName === "string" ? row.output.leadMagnetName : "";
  return { input: row.input as Partial<LaunchKitInput>, leadMagnetName: name };
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function businessContext(workspaceId: string): Promise<BusinessContext> {
  const db = await getDb();
  const [ws] = await db.select({ name: workspaces.name, settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const s = ws?.settings ?? {};
  const kit = await latestKitAnswers(workspaceId);
  const k = kit?.input ?? {};
  const tone = k.tone === "bold" || k.tone === "calm" ? k.tone : "friendly";
  return {
    businessName: str(s.businessName) || str(k.businessName) || str(ws?.name),
    ownerName: str(k.ownerName),
    niche: str(s.niche) || str(k.niche),
    audience: str(s.audience) || str(k.audience),
    outcome: str(k.outcome),
    offer: str(s.offer) || str(k.offer),
    leadMagnetName: str(kit?.leadMagnetName) || str(k.leadMagnetIdea),
    skoolUrl: str(s.skoolUrl) || str(k.skoolUrl),
    tone,
  };
}

/** The context as prompt lines. Blank answers are left out, so the AI never sees "(none)". */
export function contextLines(c: BusinessContext): string {
  return [
    c.businessName && `Community name: ${c.businessName}`,
    c.ownerName && `Owner: ${c.ownerName}`,
    c.niche && `What they help with: ${c.niche}`,
    c.audience && `Who it serves: ${c.audience}`,
    c.outcome && `Main outcome members want: ${c.outcome}`,
    c.offer && `The offer: ${c.offer}`,
    c.leadMagnetName && `Free checklist (lead magnet): ${c.leadMagnetName}`,
    `Tone: ${c.tone}`,
  ]
    .filter(Boolean)
    .join("\n");
}
