import { and, desc, eq, gt, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberAccess, rosterImports, users, workspaceMembers, workspaces, type MemberChannel } from "@/lib/db/schema";
import { addDays, isEmail, normalizeEmail } from "@/lib/util";
import { env } from "@/lib/env";
import { normalizeStatus, splitRow } from "./skool";

// Access is simple: if you're an active member, you're in. No codes.
//
// A person is "an active member" while they have at least one live row in member_access:
//   - skool_zapier  Skool -> Zapier "New Paid Member" (Skool Pro). Fires on join.
//   - skool_export  The platform owner uploads Skool's member export (Members -> Export).
//                   Everyone on it is active; anyone who drops off a full export is removed.
//   - stripe        A direct purchase on /join. Follows the Stripe subscription.
//   - admin         A manual grant (comps, partners, support).
// Skool has no public API and no cancel signal, so the export is the only safe way to learn who
// left. Rows expire on their own (activeUntil) so access never outlives a forgotten upload.
// When access ends the workspace gets a 7-day grace period, then pauses. It turns back on
// by itself the moment the person is a member again.

export const GRACE_DAYS = 7;
/** Zapier fires once per join, so this only bridges the gap until the next roster upload. */
export const ZAPIER_DAYS = 35;
/** How long someone stays active after last appearing in a Skool export. */
export const EXPORT_DAYS = 35;
/** Grace on top of a Stripe period end, for slow renewals. */
export const STRIPE_BUFFER_DAYS = 3;
/** A full export that would remove more than this share of current members needs a second confirm. */
export const LARGE_DROP_SHARE = 0.2;
export const FOREVER = new Date("2999-12-31T00:00:00Z");

const live = (at: Date) => and(eq(memberAccess.status, "active"), or(isNull(memberAccess.activeUntil), gt(memberAccess.activeUntil, at)));

export type MembershipState = { active: boolean; until: Date | null; channels: MemberChannel[] };

/** Is this email an active member right now, and until when? `until: null` with active = never expires. */
export async function membershipFor(email: string, at = new Date()): Promise<MembershipState> {
  const db = await getDb();
  const rows = await db
    .select({ channel: memberAccess.channel, activeUntil: memberAccess.activeUntil })
    .from(memberAccess)
    .where(and(eq(memberAccess.email, normalizeEmail(email)), live(at)));
  if (rows.length === 0) return { active: false, until: null, channels: [] };
  const forever = rows.some((r) => r.activeUntil === null);
  const until = forever ? null : new Date(Math.max(...rows.map((r) => r.activeUntil!.getTime())));
  return { active: true, until, channels: rows.map((r) => r.channel) };
}

/**
 * Point every member-managed workspace this email owns at its current membership.
 * Active: access runs to the membership end and any lapse pause lifts.
 * Not active: an active workspace starts its grace period now. Admin and agency pauses are never touched.
 */
export async function refreshOwnerAccess(email: string, at = new Date()) {
  const db = await getDb();
  const owned = await db
    .select({ id: workspaces.id, status: workspaces.status })
    .from(workspaces)
    .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.role, "owner")))
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(users.email, normalizeEmail(email)), eq(workspaces.accessSource, "member")));
  if (owned.length === 0) return { workspaces: 0 };
  const ids = owned.map((w) => w.id);
  const m = await membershipFor(email, at);

  if (m.active) {
    await db.update(workspaces).set({ accessVerifiedUntil: m.until ?? FOREVER }).where(inArray(workspaces.id, ids));
    await db
      .update(workspaces)
      .set({ status: "active", graceEndsAt: null, pausedAt: null, pauseReason: null })
      .where(
        and(
          inArray(workspaces.id, ids),
          or(eq(workspaces.status, "grace"), and(eq(workspaces.status, "paused"), eq(workspaces.pauseReason, "access"))),
        ),
      );
  } else {
    await db.update(workspaces).set({ accessVerifiedUntil: at }).where(inArray(workspaces.id, ids));
    await db
      .update(workspaces)
      .set({ status: "grace", graceEndsAt: addDays(at, GRACE_DAYS) })
      .where(and(inArray(workspaces.id, ids), eq(workspaces.status, "active")));
  }
  return { workspaces: ids.length };
}

export async function grantAccess(input: {
  email: string;
  name?: string;
  channel: MemberChannel;
  /** null = never expires */
  until: Date | null;
  ref?: string | null;
  payload?: Record<string, unknown>;
}) {
  const email = normalizeEmail(input.email);
  if (!isEmail(email)) throw new Error("A valid email is required.");
  const db = await getDb();
  const now = new Date();
  await db
    .insert(memberAccess)
    .values({
      email,
      name: input.name?.slice(0, 120) ?? "",
      channel: input.channel,
      status: "active",
      activeUntil: input.until,
      lastSeenAt: now,
      ref: input.ref ?? null,
      payload: input.payload ?? {},
    })
    .onConflictDoUpdate({
      target: [memberAccess.email, memberAccess.channel],
      set: {
        status: "active",
        activeUntil: input.until,
        lastSeenAt: now,
        updatedAt: now,
        ...(input.name ? { name: input.name.slice(0, 120) } : {}),
        ...(input.ref ? { ref: input.ref } : {}),
        ...(input.payload ? { payload: input.payload } : {}),
      },
    });
  await refreshOwnerAccess(email, now);
  return { email, until: input.until };
}

export async function revokeAccess(email: string, channel: MemberChannel, reason = "") {
  const db = await getDb();
  const now = new Date();
  const clean = normalizeEmail(email);
  const rows = await db
    .update(memberAccess)
    .set({ status: "removed", activeUntil: now, updatedAt: now, ...(reason ? { payload: sql`${memberAccess.payload} || ${JSON.stringify({ removedReason: reason })}::jsonb` } : {}) })
    .where(and(eq(memberAccess.email, clean), eq(memberAccess.channel, channel), eq(memberAccess.status, "active")))
    .returning({ id: memberAccess.id });
  if (rows.length) await refreshOwnerAccess(clean, now);
  return rows.length > 0;
}

/**
 * A brand-new signup who isn't confirmed yet gets a few days of access, once per email, so they can
 * start straight away. Zapier or the next Skool export then confirms them; if neither does, the
 * welcome window simply ends and the usual 7-day grace follows.
 */
export async function grantWelcomeAccess(email: string, name = ""): Promise<boolean> {
  const days = env.welcomeAccessDays;
  if (!(days > 0)) return false;
  const db = await getDb();
  const clean = normalizeEmail(email);
  const [used] = await db
    .select({ id: memberAccess.id })
    .from(memberAccess)
    .where(and(eq(memberAccess.email, clean), eq(memberAccess.channel, "welcome")))
    .limit(1);
  if (used) return false;
  await grantAccess({ email: clean, name, channel: "welcome", until: addDays(new Date(), days) });
  return true;
}

/** Skool -> Zapier "New Paid Member". */
export async function recordSkoolPaidMember(input: { email: string; name?: string; payload?: Record<string, unknown> }) {
  const until = addDays(new Date(), ZAPIER_DAYS);
  const ref = typeof input.payload?.transaction_id === "string" ? input.payload.transaction_id : null;
  await grantAccess({ email: input.email, name: input.name, channel: "skool_zapier", until, ref, payload: input.payload });
  return { email: normalizeEmail(input.email), until };
}

// ---------------------------------------------------------------------------
// Skool member export (the roster)
// ---------------------------------------------------------------------------

export type RosterRow = { emails: string[]; name: string };

/**
 * Parse a Skool member export. Every email in a row counts, so the answer to a membership
 * question like "What email will you use for the app?" works as well as the Skool email.
 * Rows whose status says churned/left are ignored. A plain list of emails also works.
 */
export function parseRoster(raw: string): { rows: RosterRow[]; skipped: number } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], skipped: 0 };
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const header = splitRow(lines[0], delim).map((c) => c.toLowerCase());
  const hasHeader = header.some((c) => /e-?mail|name|status/.test(c)) && !header.some((c) => isEmail(c));
  const statusCol = hasHeader ? header.findIndex((h) => /status|segment|state|membership/.test(h)) : -1;
  const firstCol = hasHeader ? header.findIndex((h) => h.includes("first")) : -1;
  const lastCol = hasHeader ? header.findIndex((h) => h.includes("last") && !h.includes("active")) : -1;
  const nameCol = hasHeader ? header.findIndex((h) => h === "name" || h === "full name" || h === "member") : -1;

  const rows: RosterRow[] = [];
  let skipped = 0;
  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    const cells = splitRow(lines[i], delim);
    if (statusCol >= 0 && normalizeStatus(cells[statusCol] ?? "") === "churned") continue;
    const emails = [...new Set(cells.flatMap((c) => c.split(/[\s;]+/)).map((c) => c.replace(/^mailto:/i, "").trim()).filter(isEmail).map(normalizeEmail))];
    if (emails.length === 0) {
      skipped++;
      continue;
    }
    const name = [firstCol >= 0 ? cells[firstCol] : "", lastCol >= 0 ? cells[lastCol] : ""].filter(Boolean).join(" ") || (nameCol >= 0 ? cells[nameCol] : "") || "";
    rows.push({ emails, name: name.slice(0, 120) });
  }
  return { rows, skipped };
}

export type RosterPreview = {
  rows: number;
  emails: number;
  skipped: number;
  added: string[];
  removed: string[];
  stillActive: number;
  /** True when the upload would remove an unusually large share of members. */
  largeDrop: boolean;
};

export async function previewRoster(raw: string, at = new Date()): Promise<RosterPreview> {
  const { rows, skipped } = parseRoster(raw);
  const present = new Set(rows.flatMap((r) => r.emails));
  const db = await getDb();
  const current = await db
    .select({ email: memberAccess.email })
    .from(memberAccess)
    .where(and(eq(memberAccess.channel, "skool_export"), live(at)));
  const currentSet = new Set(current.map((c) => c.email));
  const removed = [...currentSet].filter((e) => !present.has(e));
  const added = [...present].filter((e) => !currentSet.has(e));
  const largeDrop = removed.length > 5 && removed.length > currentSet.size * LARGE_DROP_SHARE;
  return { rows: rows.length, emails: present.size, skipped, added, removed, stillActive: present.size - added.length, largeDrop };
}

/**
 * Apply a full Skool export: everyone on it is an active member for the next EXPORT_DAYS,
 * and every export-based member missing from it is removed (their own app pauses after grace).
 * Refuses an unusually large drop unless `confirmLargeDrop` is set, so a filtered or broken
 * export can never pause everyone at once.
 */
export async function applyRoster(raw: string, opts: { byUserId?: string | null; confirmLargeDrop?: boolean } = {}) {
  const now = new Date();
  const preview = await previewRoster(raw, now);
  if (preview.emails === 0) throw new Error("No member emails found. Upload the CSV from Skool › Members › Export.");
  if (preview.largeDrop && !opts.confirmLargeDrop) {
    throw new Error(`This upload would remove ${preview.removed.length} members at once. Check it's the full, unfiltered export, then confirm.`);
  }
  const { rows } = parseRoster(raw);
  const db = await getDb();
  const until = addDays(now, EXPORT_DAYS);
  const values = rows.flatMap((r) => r.emails.map((email) => ({ email, name: r.name, channel: "skool_export" as const, status: "active" as const, activeUntil: until, lastSeenAt: now })));
  const seen = new Set<string>();
  const unique = values.filter((v) => (seen.has(v.email) ? false : (seen.add(v.email), true)));
  for (let i = 0; i < unique.length; i += 500) {
    await db
      .insert(memberAccess)
      .values(unique.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [memberAccess.email, memberAccess.channel],
        set: { status: "active", activeUntil: until, lastSeenAt: now, updatedAt: now, name: sql`coalesce(nullif(excluded.name, ''), ${memberAccess.name})` },
      });
  }
  if (preview.removed.length) {
    await db
      .update(memberAccess)
      .set({ status: "removed", activeUntil: now, updatedAt: now })
      .where(and(eq(memberAccess.channel, "skool_export"), inArray(memberAccess.email, preview.removed)));
  }
  await db.insert(rosterImports).values({ total: preview.emails, added: preview.added.length, removed: preview.removed.length, byUserId: opts.byUserId ?? null });

  // Only people who already have an account need their workspaces refreshed: everyone on the
  // export (their window moved forward) and everyone removed.
  const touched = [...seen, ...preview.removed];
  const owners = new Set<string>();
  for (let i = 0; i < touched.length; i += 500) {
    const found = await db.select({ email: users.email }).from(users).where(inArray(users.email, touched.slice(i, i + 500)));
    for (const f of found) owners.add(f.email);
  }
  for (const email of owners) await refreshOwnerAccess(email, now);
  return { ...preview, applied: true as const };
}

export async function lastRosterImport() {
  const db = await getDb();
  const [row] = await db.select().from(rosterImports).orderBy(desc(rosterImports.createdAt)).limit(1);
  return row ?? null;
}

export async function memberStats(at = new Date()) {
  const db = await getDb();
  const rows = await db
    .select({ channel: memberAccess.channel, count: sql<number>`count(distinct ${memberAccess.email})::int` })
    .from(memberAccess)
    .where(live(at))
    .groupBy(memberAccess.channel);
  const [{ total }] = await db.select({ total: sql<number>`count(distinct ${memberAccess.email})::int` }).from(memberAccess).where(live(at));
  const byChannel = Object.fromEntries(rows.map((r) => [r.channel, r.count])) as Partial<Record<MemberChannel, number>>;
  return { total, byChannel };
}

export async function listMemberAccess(opts: { q?: string; limit?: number } = {}) {
  const db = await getDb();
  const q = opts.q?.trim();
  return db
    .select()
    .from(memberAccess)
    .where(q ? or(ilike(memberAccess.email, `%${q}%`), ilike(memberAccess.name, `%${q}%`)) : undefined)
    .orderBy(desc(memberAccess.updatedAt))
    .limit(opts.limit ?? 50);
}

/** Cron: start grace for lapsed member access, pause when grace runs out. */
export async function enforceAccess(now = new Date()) {
  const db = await getDb();
  const toGrace = await db
    .update(workspaces)
    .set({ status: "grace", graceEndsAt: addDays(now, GRACE_DAYS) })
    .where(and(eq(workspaces.status, "active"), eq(workspaces.accessSource, "member"), lt(workspaces.accessVerifiedUntil, now)))
    .returning({ id: workspaces.id });
  const toPaused = await db
    .update(workspaces)
    .set({ status: "paused", pausedAt: now, pauseReason: "access" })
    .where(and(eq(workspaces.status, "grace"), lt(workspaces.graceEndsAt, now)))
    .returning({ id: workspaces.id });
  return { grace: toGrace.length, paused: toPaused.length };
}
