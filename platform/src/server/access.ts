import { and, desc, eq, gte, inArray, lte, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accessCodes, skoolApprovals, users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { addDays, normalizeEmail } from "@/lib/util";

// How it works: Skool has no API. Members get access with this month's code
// (posted inside the paid Skool classroom) or automatically when Skool -> Zapier
// reports a new paid member. When access lapses the workspace enters a 7-day
// grace period, then pauses: pages go offline and automations stop.

export const GRACE_DAYS = 7;
export const ZAPIER_APPROVAL_DAYS = 35;

export async function findValidCode(code: string, at = new Date()) {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(accessCodes)
    .where(and(eq(accessCodes.code, clean), lte(accessCodes.validFrom, at), gte(accessCodes.validUntil, at)))
    .limit(1);
  return row ?? null;
}

export async function listCodes() {
  const db = await getDb();
  return db.select().from(accessCodes).orderBy(desc(accessCodes.validFrom)).limit(24);
}

export async function createAccessCode(input: { code: string; label: string; validFrom: Date; validUntil: Date }) {
  const db = await getDb();
  await db.insert(accessCodes).values({ ...input, code: input.code.trim().toUpperCase() });
}

export async function findApproval(email: string, at = new Date()) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(skoolApprovals)
    .where(and(eq(skoolApprovals.email, normalizeEmail(email)), gte(skoolApprovals.approvedUntil, at)))
    .limit(1);
  return row ?? null;
}

export async function extendWorkspaceAccess(workspaceId: string, until: Date) {
  const db = await getDb();
  await db
    .update(workspaces)
    .set({
      status: "active",
      accessVerifiedUntil: sql`greatest(coalesce(${workspaces.accessVerifiedUntil}, now()), ${until})`,
      graceEndsAt: null,
      pausedAt: null,
    })
    .where(eq(workspaces.id, workspaceId));
}

export async function redeemCode(workspaceId: string, code: string): Promise<{ ok: true; until: Date } | { ok: false; error: string }> {
  const valid = await findValidCode(code);
  if (!valid) return { ok: false, error: "That code isn't valid right now. Copy this month's code from the Skool classroom." };
  await extendWorkspaceAccess(workspaceId, valid.validUntil);
  return { ok: true, until: valid.validUntil };
}

// Called by the Skool -> Zapier "New Paid Member" webhook.
export async function recordSkoolApproval(input: { email: string; name?: string; payload?: Record<string, unknown> }) {
  const db = await getDb();
  const email = normalizeEmail(input.email);
  const approvedUntil = addDays(new Date(), ZAPIER_APPROVAL_DAYS);
  await db
    .insert(skoolApprovals)
    .values({ email, name: input.name ?? "", payload: input.payload ?? {}, approvedUntil })
    .onConflictDoUpdate({ target: skoolApprovals.email, set: { approvedUntil, payload: input.payload ?? {} } });

  // Existing members get their access extended right away.
  const owned = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(users.email, email), inArray(workspaces.accessSource, ["skool_code", "skool_zapier"])));
  for (const w of owned) await extendWorkspaceAccess(w.id, approvedUntil);
  return { email, approvedUntil, extended: owned.length };
}

export async function enforceAccess(now = new Date()) {
  const db = await getDb();
  const toGrace = await db
    .update(workspaces)
    .set({ status: "grace", graceEndsAt: addDays(now, GRACE_DAYS) })
    .where(
      and(
        eq(workspaces.status, "active"),
        inArray(workspaces.accessSource, ["skool_code", "skool_zapier"]),
        lt(workspaces.accessVerifiedUntil, now),
      ),
    )
    .returning({ id: workspaces.id });
  const toPaused = await db
    .update(workspaces)
    .set({ status: "paused", pausedAt: now })
    .where(and(eq(workspaces.status, "grace"), lt(workspaces.graceEndsAt, now)))
    .returning({ id: workspaces.id });
  return { grace: toGrace.length, paused: toPaused.length };
}
