// Saved carousels: one ai_generations row each (kind "carousel"), always read and written through a
// workspace id, so one account can never see or change another's. Every save is cleaned first.
import { and, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations } from "@/lib/db/schema";
import { isUuid } from "@/lib/util";
import { latestKitAnswers } from "@/server/ai/businessContext";
import { kitSite } from "@/server/ai/launchKit";
import { cleanCarousel, cleanHandle, parseCarouselLook, type CarouselDraft, type CarouselLook } from "./shape";
import { cleanCoverText } from "@/server/cover/cleanText";

/** Where a carousel came from: their AI, a pasted script, the no-AI starter, the example, their Claude, or typed by hand. */
export const CAROUSEL_SOURCES = ["ai", "script", "starter", "example", "claude", "hand"] as const;
export type CarouselSource = (typeof CAROUSEL_SOURCES)[number];

export type Carousel = CarouselDraft & { id: string; topic: string; source: CarouselSource; createdAt: Date };

/** Enough for a year of posting; stops a runaway script filling the table. */
export const MAX_SAVED_CAROUSELS = 200;

const base = (workspaceId: string) => and(eq(aiGenerations.workspaceId, workspaceId), eq(aiGenerations.kind, "carousel"));

function fromRow(row: { id: string; input: Record<string, unknown>; output: Record<string, unknown>; createdAt: Date }): Carousel | null {
  // Read back through the same cleaner, so whatever is stored is always safe to draw.
  const res = cleanCarousel(row.output);
  if (!res.ok) return null;
  const source = (CAROUSEL_SOURCES as readonly unknown[]).includes(row.input.source) ? (row.input.source as CarouselSource) : "hand";
  return { ...res.carousel, id: row.id, topic: cleanCoverText(row.input.topic, 200), source, createdAt: row.createdAt };
}

export type SaveCarouselResult = { ok: true; carousel: Carousel } | { ok: false; error: string };

/**
 * Save a carousel: a new one, or (with `id`) one of this workspace's own. Anything about it is cleaned
 * and clamped first; a carousel that can't be drawn (too few slides) is refused with a plain reason.
 */
export async function saveCarousel(
  workspaceId: string,
  raw: unknown,
  meta: { id?: string | null; source: CarouselSource; topic?: string; model?: string },
): Promise<SaveCarouselResult> {
  const res = cleanCarousel(raw);
  if (!res.ok) return res;
  const output = res.carousel as unknown as Record<string, unknown>;
  const db = await getDb();
  if (meta.id) {
    if (!isUuid(meta.id)) return { ok: false, error: "That carousel doesn't exist any more." };
    const [row] = await db
      .update(aiGenerations)
      .set({ output })
      .where(and(base(workspaceId), eq(aiGenerations.id, meta.id)))
      .returning({ id: aiGenerations.id, input: aiGenerations.input, output: aiGenerations.output, createdAt: aiGenerations.createdAt });
    if (!row) return { ok: false, error: "That carousel doesn't exist any more." };
    return { ok: true, carousel: fromRow(row)! };
  }
  if ((await carouselCount(workspaceId)) >= MAX_SAVED_CAROUSELS) {
    return { ok: false, error: `You have ${MAX_SAVED_CAROUSELS} carousels saved, the most an account holds. Delete a few old ones first.` };
  }
  const [row] = await db
    .insert(aiGenerations)
    .values({ workspaceId, kind: "carousel", input: { source: meta.source, topic: cleanCoverText(meta.topic, 200) }, output, model: meta.model ?? meta.source })
    .returning({ id: aiGenerations.id, input: aiGenerations.input, output: aiGenerations.output, createdAt: aiGenerations.createdAt });
  return { ok: true, carousel: fromRow(row)! };
}

export async function getCarousel(workspaceId: string, id: unknown): Promise<Carousel | null> {
  if (!isUuid(id)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ id: aiGenerations.id, input: aiGenerations.input, output: aiGenerations.output, createdAt: aiGenerations.createdAt })
    .from(aiGenerations)
    .where(and(base(workspaceId), eq(aiGenerations.id, id)))
    .limit(1);
  return row ? fromRow(row) : null;
}

/** Newest first. */
export async function listCarousels(workspaceId: string, limit = 30): Promise<Carousel[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: aiGenerations.id, input: aiGenerations.input, output: aiGenerations.output, createdAt: aiGenerations.createdAt })
    .from(aiGenerations)
    .where(base(workspaceId))
    .orderBy(desc(aiGenerations.createdAt))
    .limit(Math.min(Math.max(limit, 1), MAX_SAVED_CAROUSELS));
  return rows.map(fromRow).filter((c): c is Carousel => c !== null);
}

/** How many this workspace has saved (Your path's "Make your first post" turns solid at 1). */
export async function carouselCount(workspaceId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ n: count() }).from(aiGenerations).where(base(workspaceId));
  return Number(row?.n ?? 0);
}

export async function setCarouselLook(workspaceId: string, id: unknown, look: CarouselLook): Promise<boolean> {
  const c = await getCarousel(workspaceId, id);
  if (!c) return false;
  const res = await saveCarousel(workspaceId, { ...c, look: parseCarouselLook(look) }, { id: c.id, source: c.source });
  return res.ok;
}

export async function deleteCarousel(workspaceId: string, id: unknown): Promise<boolean> {
  if (!isUuid(id)) return false;
  const db = await getDb();
  const gone = await db.delete(aiGenerations).where(and(base(workspaceId), eq(aiGenerations.id, id))).returning({ id: aiGenerations.id });
  return gone.length > 0;
}

/** The @handle they used last, so the next carousel starts with it. */
export async function latestHandle(workspaceId: string): Promise<string> {
  for (const c of await listCarousels(workspaceId, 5)) if (c.handle) return cleanHandle(c.handle);
  return "";
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The member's brand colour: their kit's website first (it follows the website), then the kit's answer. */
export async function carouselBrandColor(workspaceId: string): Promise<string> {
  const [site, kit] = await Promise.all([kitSite(workspaceId), latestKitAnswers(workspaceId)]);
  return [site?.theme?.brandColor, kit?.input.brandColor].find((c): c is string => typeof c === "string" && HEX.test(c)) ?? "#2A44EE";
}
