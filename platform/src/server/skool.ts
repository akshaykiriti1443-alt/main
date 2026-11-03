import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, workspaces } from "@/lib/db/schema";
import type { Stage } from "@/lib/db/schema";
import { normalizeEmail, isEmail } from "@/lib/util";
import { addTag, removeTag, setStage, upsertContact, type Contact } from "./contacts";
import { logActivity } from "./activity";
import { emitEvent } from "./events";
import { enqueue } from "./jobs/queue";
import type { WorkspaceSettings } from "@/lib/db/types";
import { normalizeStatus, splitRow } from "@/lib/roster";

export { normalizeStatus, splitRow };

// Keeps the CRM in step with a Skool community without touching anyone's Skool login.
// The owner exports their member list from Skool (Members tab -> Export) and uploads it here,
// or pastes it. We reconcile it against the contacts we already hold:
//   - new rows become contacts (source "skool") on the matching stage
//   - a row that moved from trial to paid, or paid to gone, moves stage and fires automations
//   - a Skool member we held who is absent from a full upload is treated as churned
// Everything runs through the normal stage/event path, so welcome and win-back automations just work.

export type SkoolStatus = "trial" | "active" | "cancelling" | "churned";

export type ParsedMember = { email: string; firstName: string; lastName: string; status: SkoolStatus; answers?: { q: string; a: string }[] };

// Membership questions are a free Skool plugin, and their answers come out in the Members export.
// Any column that looks like a question (or "answer") is kept on the contact, so the CRM (and
// the AI writing welcome DMs) knows why each person joined. Sending answers to a CRM is
// otherwise a Pro (Zapier) feature.
const KNOWN_COLS = /^(e-?mail|first|last|name|full name|member|status|stage|segment|state|membership|subscription|price|tier|plan|ltv|lifetime|joined|join date|date|created|invited|level|points|role|location|bio|link|profile|url|phone|approved|approved by|source)$/;
const isAnswerCol = (h: string) => h.includes("?") || /\b(question|answer|q\d+)\b/.test(h);
export const ANSWERS_START = "— Skool membership answers —";
export const ANSWERS_END = "— end of answers —";
const ANSWERS_RE = new RegExp(`${ANSWERS_START}[\\s\\S]*?${ANSWERS_END}`);

/** Replace (or add) the answers block in a contact's notes, leaving the owner's own notes alone. */
export function withAnswers(notes: string, answers: { q: string; a: string }[]): string {
  const block = [ANSWERS_START, ...answers.flatMap(({ q, a }) => [`Q: ${q}`, `A: ${a}`]), ANSWERS_END].join("\n");
  if (ANSWERS_RE.test(notes)) return notes.replace(ANSWERS_RE, () => block);
  return notes.trim() ? `${notes.trim()}\n\n${block}` : block;
}

/** The answers block from a contact's notes, if the export brought one in. */
export function answersFrom(notes: string): { q: string; a: string }[] {
  const m = notes.match(ANSWERS_RE);
  if (!m) return [];
  const out: { q: string; a: string }[] = [];
  for (const line of m[0].split("\n")) {
    if (line.startsWith("Q: ")) out.push({ q: line.slice(3), a: "" });
    else if (line.startsWith("A: ") && out.length) out[out.length - 1].a = line.slice(3);
  }
  return out;
}

export type SkoolSyncResult = {
  total: number;
  skipped: number;
  created: number;
  joinedTrial: number;
  converted: number;
  churned: number;
  unchanged: number;
};

const CANCELLING_TAG = "skool-cancelling";
const MEMBER_TAG = "skool-member";


const findCol = (header: string[], names: string[]) =>
  header.findIndex((h) => names.some((n) => h === n || h.includes(n)));

/**
 * Parse a Skool member list. Accepts the CSV export (comma or tab separated, with a header row),
 * or a plain list of emails (one per line). Unknown columns are ignored; unparseable rows are
 * counted as skipped. Rows are de-duplicated by email, last one winning.
 */
export function parseSkoolMembers(raw: string): { members: ParsedMember[]; skipped: number } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { members: [], skipped: 0 };

  const delim = lines[0].includes("\t") ? "\t" : ",";
  const first = splitRow(lines[0], delim).map((c) => c.toLowerCase());
  const hasHeader = first.some((c) => c.includes("email") || c.includes("e-mail"));

  let emailCol = 0, firstCol = -1, lastCol = -1, nameCol = -1, statusCol = -1;
  let answerCols: { i: number; q: string }[] = [];
  let start = 0;
  if (hasHeader) {
    emailCol = findCol(first, ["email", "e-mail"]);
    firstCol = findCol(first, ["first name", "first", "given"]);
    lastCol = findCol(first, ["last name", "last", "surname", "family"]);
    nameCol = findCol(first, ["name", "member", "full name"]);
    statusCol = findCol(first, ["status", "stage", "segment", "state", "membership", "subscription"]);
    const original = splitRow(lines[0], delim);
    answerCols = first
      .map((h, i) => ({ i, h }))
      .filter(({ i, h }) => ![emailCol, firstCol, lastCol, nameCol, statusCol].includes(i) && !KNOWN_COLS.test(h.trim()) && isAnswerCol(h))
      .map(({ i }) => ({ i, q: (original[i] ?? "").trim().slice(0, 200) }));
    start = 1;
  }

  const byEmail = new Map<string, ParsedMember>();
  let skipped = 0;
  for (let i = start; i < lines.length; i++) {
    const cells = hasHeader ? splitRow(lines[i], delim) : [lines[i]];
    const rawEmail = (cells[emailCol] ?? cells.find((c) => isEmail(c)) ?? "").trim();
    if (!isEmail(rawEmail)) { skipped++; continue; }
    const email = normalizeEmail(rawEmail);

    let firstName = firstCol >= 0 ? (cells[firstCol] ?? "") : "";
    let lastName = lastCol >= 0 ? (cells[lastCol] ?? "") : "";
    if (!firstName && !lastName && nameCol >= 0) {
      const parts = (cells[nameCol] ?? "").split(/\s+/);
      firstName = parts[0] ?? "";
      lastName = parts.slice(1).join(" ");
    }
    const status = statusCol >= 0 ? normalizeStatus(cells[statusCol] ?? "") : "active";
    const answers = answerCols
      .map(({ i, q }) => ({ q, a: (cells[i] ?? "").trim().slice(0, 1000) }))
      .filter((x) => x.a);
    byEmail.set(email, { email, firstName: firstName.slice(0, 80), lastName: lastName.slice(0, 80), status, ...(answers.length ? { answers } : {}) });
  }
  return { members: [...byEmail.values()], skipped };
}

const stageFor = (status: SkoolStatus): Stage =>
  status === "trial" ? "trial" : status === "churned" ? "lost" : "member";

/**
 * Tell Meta (server-side) that a Skool member started a trial or became paid, so ad campaigns
 * optimize toward paying members. Fires only when the workspace has its pixel + token set up.
 * These events carry no browser signals, so they are "system_generated" and match on hashed email.
 */
async function sendSkoolConversion(
  workspaceId: string,
  settings: WorkspaceSettings,
  contact: Pick<Contact, "id" | "email" | "firstName" | "lastName">,
  kind: "StartTrial" | "Subscribe",
) {
  if (!settings.metaPixelId || !settings.metaCapiTokenEnc || !contact.email) return;
  const day = new Date().toISOString().slice(0, 10);
  await enqueue(
    "meta.capi",
    {
      workspaceId,
      eventName: kind,
      eventId: `skool-${kind}:${contact.id}:${day}`, // stable, so Meta dedupes our retries
      eventTime: Math.floor(Date.now() / 1000),
      eventSourceUrl: settings.skoolUrl || "",
      actionSource: "system_generated",
      value: kind === "Subscribe" && settings.skoolMemberPrice ? settings.skoolMemberPrice : null,
      currency: "USD",
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      externalId: contact.id,
    },
    { dedupeKey: `skool-${kind}:${contact.id}:${day}` },
  );
}

/**
 * Reconcile a parsed member list into the workspace's contacts.
 * When `churnMissing` is true (a full export), Skool members we hold who are absent from the
 * upload are marked lost — so this must only be set for a complete member list, never a partial paste.
 */
export async function syncSkoolMembers(
  workspaceId: string,
  raw: string,
  opts: { churnMissing: boolean },
): Promise<SkoolSyncResult> {
  const { members, skipped } = parseSkoolMembers(raw);
  const db = await getDb();

  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const settings = ws?.settings ?? {};

  // Everyone we already treat as a Skool person, by email, with their current stage/tags.
  const existing = await db
    .select({ id: contacts.id, email: contacts.email, stage: contacts.stage, tags: contacts.tags, source: contacts.source })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), sql`${MEMBER_TAG} = any(${contacts.tags})`));
  const held = new Map(existing.filter((c) => c.email).map((c) => [c.email as string, c]));

  const res: SkoolSyncResult = { total: members.length, skipped, created: 0, joinedTrial: 0, converted: 0, churned: 0, unchanged: 0 };
  const seen = new Set<string>();

  for (const m of members) {
    seen.add(m.email);
    const before = held.get(m.email);
    const targetStage = stageFor(m.status);

    const { contact, created } = await upsertContact({
      workspaceId,
      email: m.email,
      firstName: m.firstName,
      lastName: m.lastName,
      source: "skool",
      tags: [MEMBER_TAG],
    });
    if (created) {
      res.created++;
      await emitEvent({ type: "lead_created", workspaceId, contactId: contact.id });
    }

    if (m.answers?.length) {
      const next = withAnswers(contact.notes ?? "", m.answers);
      if (next !== contact.notes) await db.update(contacts).set({ notes: next.slice(0, 20000) }).where(eq(contacts.id, contact.id));
    }

    // The cancelling tag mirrors Skool's "cancelled but still paid" state.
    if (m.status === "cancelling") await addTag(workspaceId, contact.id, CANCELLING_TAG);
    else if (before?.tags.includes(CANCELLING_TAG)) await removeTag(workspaceId, contact.id, CANCELLING_TAG);

    const prevStage = before?.stage ?? (created ? "new" : contact.stage);
    if (prevStage !== targetStage) {
      await setStage(workspaceId, contact.id, targetStage); // fires stage_changed -> automations/sequences
      if (targetStage === "trial") {
        res.joinedTrial++;
        await logActivity({ workspaceId, contactId: contact.id, type: "skool_trial", data: {} });
        await sendSkoolConversion(workspaceId, settings, contact, "StartTrial");
      } else if (targetStage === "member") {
        if (prevStage === "trial") {
          res.converted++;
          await logActivity({ workspaceId, contactId: contact.id, type: "skool_converted", data: {} });
        } else {
          await logActivity({ workspaceId, contactId: contact.id, type: "skool_joined", data: { status: m.status } });
        }
        await sendSkoolConversion(workspaceId, settings, contact, "Subscribe");
      } else if (targetStage === "lost") {
        res.churned++;
        await logActivity({ workspaceId, contactId: contact.id, type: "skool_churned", data: {} });
      }
    } else {
      res.unchanged++;
    }
  }

  if (opts.churnMissing) {
    const gone = existing.filter((c) => c.email && !seen.has(c.email) && (c.stage === "trial" || c.stage === "member"));
    for (const c of gone) {
      await setStage(workspaceId, c.id, "lost"); // fires stage_changed -> win-back automations
      await addTag(workspaceId, c.id, "skool-churned");
      if (c.tags.includes(CANCELLING_TAG)) await removeTag(workspaceId, c.id, CANCELLING_TAG);
      await logActivity({ workspaceId, contactId: c.id, type: "skool_churned", data: { reason: "absent_from_export" } });
      res.churned++;
    }
  }

  return res;
}

/** Who a full-export sync would mark churned (trial/paid Skool members missing from the file). Changes nothing. */
export async function skoolChurnPreview(workspaceId: string, raw: string) {
  const seen = new Set(parseSkoolMembers(raw).members.map((m) => m.email));
  const db = await getDb();
  const existing = await db
    .select({ email: contacts.email, stage: contacts.stage })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), sql`${MEMBER_TAG} = any(${contacts.tags})`));
  const gone = existing.filter((c) => c.email && !seen.has(c.email) && (c.stage === "trial" || c.stage === "member")).map((c) => c.email as string);
  return { count: gone.length, sample: gone.slice(0, 20) };
}

export async function skoolMemberCounts(workspaceId: string) {
  const db = await getDb();
  const [row] = await db
    .select({
      trials: sql<number>`count(*) filter (where ${contacts.stage} = 'trial')::int`,
      members: sql<number>`count(*) filter (where ${contacts.stage} = 'member')::int`,
      cancelling: sql<number>`count(*) filter (where ${CANCELLING_TAG} = any(${contacts.tags}))::int`,
      churned: sql<number>`count(*) filter (where ${contacts.stage} = 'lost')::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), sql`${MEMBER_TAG} = any(${contacts.tags})`));
  return row ?? { trials: 0, members: 0, cancelling: 0, churned: 0, total: 0 };
}

// Reserved for a future Zapier/CSV path that passes rows directly.
export async function markSkoolStatus(workspaceId: string, email: string, status: SkoolStatus) {
  if (!isEmail(email)) return;
  await syncSkoolMembers(workspaceId, `email,status\n${normalizeEmail(email)},${status}`, { churnMissing: false });
}

export async function listChurnedSkoolContacts(workspaceId: string, limit = 100) {
  const db = await getDb();
  return db
    .select({ id: contacts.id, email: contacts.email, phone: contacts.phone, firstName: contacts.firstName, lastName: contacts.lastName, updatedAt: contacts.updatedAt })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.stage, "lost"), sql`${MEMBER_TAG} = any(${contacts.tags})`))
    .orderBy(sql`${contacts.updatedAt} desc`)
    .limit(limit);
}

export { MEMBER_TAG, CANCELLING_TAG };
