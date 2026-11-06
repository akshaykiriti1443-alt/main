import { z } from "zod";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, opportunities, workspaces } from "@/lib/db/schema";
import { phoneKey } from "@/lib/crmImport";
import { isEmail, normalizeEmail, normalizePhone } from "@/lib/util";
import type { ApplyBooking } from "@/app/(scaleitads)/_site/applyConfig";
import { logActivity } from "./activity";
import { publicCalendar } from "./booking";
import { addTag, contactName, upsertContact, type Contact } from "./contacts";
import { mergeNotes } from "./crmImport";
import { emitEvent } from "./events";
import { enqueue } from "./jobs/queue";
import { createOpportunity, ensureDefaultPipeline } from "./pipelines";
import { hasFeature } from "./plans";
import { takeRateLimit } from "./rateLimit";

// The ScaleitAds agency site's /apply page on our own stack instead of GoHighLevel.
//
//   SCALEITADS_WORKSPACE  the slug of the owner's own ScaleitAds workspace in the app
//   SCALEITADS_CALENDAR   the slug of that workspace's booking calendar
//
// With both set, and the calendar open for bookings, /apply posts its leads to
// POST /api/scaleitads/apply (captureApplyLead below) and embeds /b/<workspace>/<calendar>.
// Otherwise /apply keeps the GoHighLevel webhook and calendar, exactly as before.

export const APPLY_SOURCE = "scaleitads.com/apply";
export const APPLY_TAG = "apply";

const SLUG = /^[a-z0-9-]{1,80}$/;

export function scaleitadsSettings() {
  const slug = (v: string | undefined) => (v ?? "").trim().toLowerCase();
  return { workspaceSlug: slug(process.env.SCALEITADS_WORKSPACE), calendarSlug: slug(process.env.SCALEITADS_CALENDAR) };
}

/** The owner's ScaleitAds workspace (SCALEITADS_WORKSPACE), or null when unset or unknown. */
export async function scaleitadsWorkspace() {
  const { workspaceSlug } = scaleitadsSettings();
  if (!SLUG.test(workspaceSlug)) return null;
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, workspaceSlug)).limit(1);
  return ws ?? null;
}

/**
 * The calendar /apply embeds, or null to stay on GoHighLevel: when either variable is unset, they
 * don't match a workspace and calendar, the calendar is closed (switched off, workspace paused, plan
 * without calendars) or the database can't be reached. Never throws: the live page must render.
 */
export async function scaleitadsBooking(): Promise<ApplyBooking | null> {
  const s = scaleitadsSettings();
  if (!s.workspaceSlug || !s.calendarSlug) return null;
  try {
    const pub = await publicCalendar(s.workspaceSlug, s.calendarSlug);
    if (pub?.open) return { workspaceSlug: pub.workspace.slug, calendarSlug: pub.calendar.slug };
    console.warn(
      `[scaleitads] /apply stays on GoHighLevel: ${pub ? `the calendar "${s.calendarSlug}" is closed (switched off, or the workspace is paused or has no calendars)` : `no calendar "${s.calendarSlug}" in a workspace "${s.workspaceSlug}" (check SCALEITADS_WORKSPACE and SCALEITADS_CALENDAR)`}`,
    );
  } catch (err) {
    console.error("[scaleitads] /apply stays on GoHighLevel: the calendar lookup failed", err);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Leads from /apply
// ---------------------------------------------------------------------------

/** The page's daily-spend answers. Under $50 a day gets the free plan instead of a call. */
export const SPEND_BANDS: { re: RegExp; tag: string; call: boolean }[] = [
  { re: /^not running/i, tag: "spend-none", call: false },
  { re: /^under \$50/i, tag: "spend-under-50", call: false },
  { re: /^\$50\s*-\s*\$150\b/, tag: "spend-50-150", call: true },
  { re: /^\$150\s*-\s*\$500\b/, tag: "spend-150-500", call: true },
  { re: /^\$500\+/, tag: "spend-500-plus", call: true },
];

export function spendBand(label: string) {
  return SPEND_BANDS.find((b) => b.re.test(label.trim())) ?? { re: /$^/, tag: "spend-unknown", call: true };
}

const optional = (max: number) => z.string().trim().max(max).default("");
/** Ad-click tracking values: kept, but never a reason to turn a real lead away. */
const tracking = z
  .string()
  .default("")
  .transform((s) => s.trim().slice(0, 200));

/** What the /apply page posts (field names from its GoHighLevel webhook payload). */
export const applyLeadSchema = z.object({
  first_name: z.string().trim().min(1, "Please add your name.").max(80),
  last_name: optional(80),
  email: z.string().trim().max(200).refine(isEmail, "Please check your email."),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((p) => p.replace(/\D/g, "").length >= 7, "Please add your phone number with the country code."),
  website: z
    .string()
    .trim()
    .max(300)
    .refine((s) => s.replace(/^https?:\/\//i, "").indexOf(".") >= 1, "Please add your store website, like yourstore.com."),
  ad_spend: optional(80),
  // Only an explicit "yes" counts; anything else is a no.
  marketing_consent: z
    .string()
    .optional()
    .transform((v) => (v === "yes" ? ("yes" as const) : ("no" as const))),
  qualified: optional(20),
  segment: optional(40),
  stage: optional(40),
  source: optional(40),
  page: optional(200),
  utm_source: tracking,
  utm_medium: tracking,
  utm_campaign: tracking,
  utm_content: tracking,
  utm_term: tracking,
  utm_id: tracking,
  fbclid: tracking,
  /** The hidden honeypot field: people never see it, bots fill it. */
  hp: z.string().max(500).default(""),
});
export type ApplyLead = z.infer<typeof applyLeadSchema>;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "fbclid"] as const;

export type ApplyLeadResult = { status: number; body: { ok: true; saved: boolean } | { ok: false; error: string } };

/**
 * Email first, then phone (last 10 digits), like the CRM import: a phone match only counts when it
 * wouldn't merge two different email addresses, so it must be someone we have no email for.
 */
async function findApplicant(workspaceId: string, email: string, phone: string): Promise<Contact | null> {
  const db = await getDb();
  const [byEmail] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.email, email)))
    .limit(1);
  if (byEmail) return byEmail;
  const key = phone ? phoneKey(phone) : "";
  if (key.length < 6) return null;
  const digits = sql`right(regexp_replace(coalesce(${contacts.phone}, ''), '[^0-9]', '', 'g'), 10)`;
  const [byPhone] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), isNull(contacts.email), sql`${digits} = ${key}`))
    .orderBy(asc(contacts.createdAt))
    .limit(1);
  return byPhone ?? null;
}

/**
 * A deal on the default pipeline's board, in its first open stage ("New lead"). A deal they already
 * have stays where it is (never moved back: a booked call stays booked); its notes get the answers.
 * Skipped when the workspace's plan has no pipelines.
 */
async function applyOpportunity(workspace: typeof workspaces.$inferSelect, contact: Contact, noteLines: string[], label: string) {
  if (!hasFeature(workspace.plan, "pipelines")) return null;
  const db = await getDb();
  const p = await ensureDefaultPipeline(workspace.id);
  const first = p.stages.find((s) => s.kind === "open");
  if (!first) return null;
  const [deal] = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.workspaceId, workspace.id), eq(opportunities.pipelineId, p.id), eq(opportunities.contactId, contact.id), eq(opportunities.status, "open")))
    .orderBy(desc(opportunities.updatedAt))
    .limit(1);
  if (deal) {
    const notes = mergeNotes(deal.notes, noteLines, label).slice(0, 10000);
    if (notes !== deal.notes) await db.update(opportunities).set({ notes, updatedAt: new Date() }).where(eq(opportunities.id, deal.id));
    return deal.id;
  }
  const created = await createOpportunity(
    workspace.id,
    { title: `Ad account check: ${contactName(contact)}`, contactId: contact.id, stageId: first.id, source: APPLY_SOURCE, notes: noteLines.join("\n") },
    { by: "apply" },
  );
  return created.id;
}

/**
 * A lead from scaleitads.com/apply, into the owner's workspace: the contact (matched by email, then
 * phone), tags "apply" + the spend band, the answers in their notes, a deal in the first stage, and
 * the same "lead created" event members' landing pages fire, so the owner's automations run.
 * Sends no email itself. Under-$50-a-day answers are never saved (the page doesn't send them either).
 */
export async function captureApplyLead(raw: unknown, opts: { ip?: string | null; now?: Date } = {}): Promise<ApplyLeadResult> {
  const workspace = await scaleitadsWorkspace();
  if (!workspace) return { status: 503, body: { ok: false, error: "Applications aren't open here right now." } };

  const parsed = applyLeadSchema.safeParse(raw);
  if (!parsed.success) return { status: 422, body: { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." } };
  const a = parsed.data;
  // Bots fill hidden fields; pretend it worked so they move on.
  if (a.hp) return { status: 200, body: { ok: true, saved: false } };

  const email = normalizeEmail(a.email);
  const allowed =
    (await takeRateLimit(`apply:ip:${opts.ip ?? "unknown"}`, [
      { seconds: 600, max: 10 },
      { seconds: 86_400, max: 50 },
    ])) && (await takeRateLimit(`apply:email:${email}`, [{ seconds: 3600, max: 5 }]));
  if (!allowed) return { status: 429, body: { ok: false, error: "That's a lot of tries in a short time. Please wait a few minutes." } };

  const band = spendBand(a.ad_spend);
  if (!band.call) return { status: 200, body: { ok: true, saved: false } };

  const db = await getDb();
  const phone = normalizePhone(a.phone);
  let contact = await findApplicant(workspace.id, email, phone);
  let created = false;
  if (!contact) {
    const r = await upsertContact({ workspaceId: workspace.id, email, phone: phone || null, firstName: a.first_name, lastName: a.last_name, source: "landing_page" });
    contact = r.contact;
    created = r.created;
  }

  // The answers, in their notes (the CRM has no custom fields): only lines that are new.
  const utm = Object.fromEntries(UTM_KEYS.filter((k) => a[k]).map((k) => [k, a[k]]));
  const day = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const label = `Applied on ${APPLY_SOURCE} (${day})`;
  const noteLines = [
    `Website: ${a.website}`,
    a.ad_spend ? `Meta ad spend: ${a.ad_spend}` : "",
    `Marketing emails: ${a.marketing_consent === "yes" ? "yes" : "no (unticked on the form)"}`,
    contact.email && contact.email !== email ? `Applied with email: ${email}` : "",
    contact.phone && phone && phoneKey(contact.phone) !== phoneKey(phone) ? `Applied with phone: ${phone}` : "",
    Object.keys(utm).length ? `Ad click: ${Object.entries(utm).map(([k, v]) => `${k}=${v}`).join(" · ")}` : "",
  ].filter(Boolean);

  // Fill blanks only; never un-unsubscribe anyone (the box is ticked by default, so a "yes" isn't a
  // fresh opt-in). An unticked box opts them out of marketing emails; booking emails still go.
  const optOut = a.marketing_consent !== "yes" && !contact.unsubscribed;
  let newEmail: string | null = contact.email ?? email;
  if (newEmail !== contact.email) {
    const [taken] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.workspaceId, workspace.id), eq(contacts.email, newEmail))).limit(1);
    if (taken) newEmail = contact.email;
  }
  const [updated] = await db
    .update(contacts)
    .set({
      email: newEmail,
      phone: contact.phone || phone || null,
      firstName: contact.firstName || a.first_name,
      lastName: contact.lastName || a.last_name,
      notes: mergeNotes(contact.notes, noteLines, label),
      unsubscribed: contact.unsubscribed || optOut,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, contact.id))
    .returning();
  contact = updated ?? contact;

  await logActivity({
    workspaceId: workspace.id,
    contactId: contact.id,
    type: "lead",
    data: { page: APPLY_SOURCE, source: APPLY_SOURCE, website: a.website, adSpend: a.ad_spend, marketingConsent: a.marketing_consent, utm, created },
  });
  if (optOut) await logActivity({ workspaceId: workspace.id, contactId: contact.id, type: "unsubscribed", data: { source: APPLY_SOURCE, reason: "Unticked the email box on the apply form" } });
  await addTag(workspace.id, contact.id, APPLY_TAG);
  await addTag(workspace.id, contact.id, band.tag);
  await applyOpportunity(workspace, contact, noteLines, label).catch((err) => console.error("[scaleitads] apply: opportunity failed", err));
  if (created) await emitEvent({ type: "lead_created", workspaceId: workspace.id, contactId: contact.id });
  await enqueue("ai.score", { contactId: contact.id }, { dedupeKey: `score:${contact.id}:${Math.floor(Date.now() / 120_000)}` });
  return { status: 200, body: { ok: true, saved: true } };
}
