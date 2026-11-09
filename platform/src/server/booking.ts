import { z } from "zod";
import { and, asc, desc, eq, gt, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  bookings,
  calendars,
  channelConnections,
  contacts,
  workspaces,
  type AvailabilityRule,
  type BookingQuestion,
  type BookingStatus,
  type CalendarLocation,
} from "@/lib/db/schema";
import { decrypt, encrypt, randomToken, sha256hex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { buildIcs, canonicalZone, generateSlots, googleCalendarUrl, isValidTimeZone, shortTime, whenLine, formatInZone } from "@/lib/booking";
import { isEmail, isUuid, normalizeEmail, normalizePhone, slugify } from "@/lib/util";
import { logActivity } from "./activity";
import { addTag, contactName, upsertContact } from "./contacts";
import { emitEvent } from "./events";
import { enqueue } from "./jobs/queue";
import { isWorkspaceLive } from "./liveness";
import { markCallBooked } from "./pipelines";
import { hasFeature } from "./plans";
import { takeRateLimit } from "./rateLimit";

// Booking calendars, like GHL calendars or Calendly. A public page (/b/<workspace>/<calendar>) lists
// open times; booking one upserts the contact (tag "booked-call"), moves their opportunity to "Call
// booked", fires "Appointment booked" automations, emails both sides an invite and queues
// reminders 24 h and 1 h before. The booker manages it from a private link (/booking/<token>).

export type Calendar = typeof calendars.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
type Workspace = typeof workspaces.$inferSelect;

export const ACTIVE_STATUSES: BookingStatus[] = ["confirmed", "rescheduled"];
export const BOOKED_TAG = "booked-call";
export const REMINDERS = [
  { key: "24h", minutes: 24 * 60, label: "tomorrow" },
  { key: "1h", minutes: 60, label: "in 1 hour" },
] as const;

export const LOCATION_LABELS: Record<CalendarLocation, string> = {
  zoom: "Zoom",
  google_meet: "Google Meet",
  phone: "Phone call",
  in_person: "In person",
  custom: "Online",
};

export const WEEKDAYS_9_TO_5: AvailabilityRule[] = [1, 2, 3, 4, 5].map((day) => ({ day, start: "09:00", end: "17:00" }));

export class BookingError extends Error {
  constructor(message: string, public code: "taken" | "invalid" | "closed" | "limited" = "invalid") {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Calendars (owner side)
// ---------------------------------------------------------------------------

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Use a time like 09:00");
export const availabilitySchema = z
  .array(z.object({ day: z.number().int().min(0).max(6), start: hhmm, end: hhmm }))
  .max(42)
  .refine((rules) => rules.every((r) => r.start < r.end), "Each time range has to end after it starts.");

export const calendarInputSchema = z.object({
  name: z.string().trim().min(1, "Give it a name, like Intro call.").max(80),
  slug: z.string().trim().max(60).optional(),
  description: z.string().max(1000).default(""),
  durationMinutes: z.number().int().min(5).max(480),
  bufferMinutes: z.number().int().min(0).max(240).default(0),
  slotIntervalMinutes: z.number().int().min(0).max(480).default(0),
  minNoticeMinutes: z.number().int().min(0).max(60 * 24 * 30).default(240),
  maxDaysAhead: z.number().int().min(1).max(365).default(30),
  timezone: z.string().refine(isValidTimeZone, "Pick a time zone from the list.").transform((tz) => canonicalZone(tz)),
  availability: availabilitySchema,
  locationType: z.enum(["zoom", "google_meet", "phone", "in_person", "custom"]),
  locationValue: z.string().trim().max(500).default(""),
  phoneMode: z.enum(["off", "optional", "required"]).default("optional"),
  questions: z
    .array(z.object({ id: z.string().max(40), label: z.string().trim().min(1).max(200), type: z.enum(["short", "long"]), required: z.boolean() }))
    .max(5)
    .default([]),
  confirmationMessage: z.string().max(2000).default(""),
  active: z.boolean().default(true),
});
export type CalendarInput = z.input<typeof calendarInputSchema>;

export async function listCalendars(workspaceId: string) {
  const db = await getDb();
  return db.select().from(calendars).where(eq(calendars.workspaceId, workspaceId)).orderBy(asc(calendars.createdAt));
}

export async function getCalendar(workspaceId: string, id: string) {
  if (!isUuid(id)) return null;
  const db = await getDb();
  const [c] = await db.select().from(calendars).where(and(eq(calendars.id, id), eq(calendars.workspaceId, workspaceId))).limit(1);
  return c ?? null;
}

async function uniqueSlug(workspaceId: string, wanted: string, exceptId?: string) {
  const db = await getDb();
  const base = slugify(wanted, 40) || "call";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const [hit] = await db
      .select({ id: calendars.id })
      .from(calendars)
      .where(and(eq(calendars.workspaceId, workspaceId), eq(calendars.slug, candidate), ...(exceptId ? [ne(calendars.id, exceptId)] : [])))
      .limit(1);
    if (!hit) return candidate;
  }
  return `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

function cleanQuestions(qs: BookingQuestion[]) {
  return qs.map((q, i) => ({ ...q, id: q.id && /^[a-z0-9_-]+$/i.test(q.id) ? q.id : `q${i + 1}` }));
}

export async function createCalendar(workspaceId: string, input: CalendarInput) {
  const v = calendarInputSchema.parse(input);
  const db = await getDb();
  const slug = await uniqueSlug(workspaceId, v.slug || v.name);
  const [row] = await db
    .insert(calendars)
    .values({ workspaceId, ...v, slug, questions: cleanQuestions(v.questions), phoneMode: v.locationType === "phone" ? "required" : v.phoneMode })
    .returning();
  return row;
}

/** A beginner's first calendar: a 30-minute intro call, weekdays 9 to 5 in their time zone. */
export async function createStarterCalendar(workspaceId: string, timezone: string) {
  return createCalendar(workspaceId, {
    name: "Intro call",
    description: "A relaxed 30-minute chat to see if we're a good fit. No pressure, no pitch-slap.",
    durationMinutes: 30,
    bufferMinutes: 15,
    minNoticeMinutes: 12 * 60,
    maxDaysAhead: 30,
    timezone: canonicalZone(timezone),
    availability: WEEKDAYS_9_TO_5,
    locationType: "zoom",
    questions: [{ id: "goal", label: "What would you love help with?", type: "long", required: false }],
  });
}

export async function updateCalendar(workspaceId: string, id: string, input: CalendarInput) {
  const current = await getCalendar(workspaceId, id);
  if (!current) throw new BookingError("That calendar doesn't exist any more.");
  const v = calendarInputSchema.parse(input);
  const slug = v.slug && slugify(v.slug, 40) !== current.slug ? await uniqueSlug(workspaceId, v.slug, id) : current.slug;
  const db = await getDb();
  const [row] = await db
    .update(calendars)
    .set({ ...v, slug, questions: cleanQuestions(v.questions), phoneMode: v.locationType === "phone" ? "required" : v.phoneMode, updatedAt: new Date() })
    .where(eq(calendars.id, id))
    .returning();
  return row;
}

export async function setCalendarActive(workspaceId: string, id: string, active: boolean) {
  const current = await getCalendar(workspaceId, id);
  if (!current) throw new BookingError("That calendar doesn't exist any more.");
  const db = await getDb();
  await db.update(calendars).set({ active, updatedAt: new Date() }).where(eq(calendars.id, id));
}

/** Deletes a calendar that has no upcoming bookings (turn it off instead to keep its history). */
export async function deleteCalendar(workspaceId: string, id: string) {
  const current = await getCalendar(workspaceId, id);
  if (!current) return;
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.calendarId, id), inArray(bookings.status, ACTIVE_STATUSES), gt(bookings.startAt, new Date())));
  if (n > 0) throw new BookingError(`It has ${n} upcoming booking${n === 1 ? "" : "s"}. Cancel ${n === 1 ? "it" : "them"} first, or switch the calendar off.`);
  await db.delete(calendars).where(eq(calendars.id, id));
}

export function bookingUrl(workspaceSlug: string, calendarSlug: string) {
  return `${env.appUrl}/b/${workspaceSlug}/${calendarSlug}`;
}

// ---------------------------------------------------------------------------
// Public side
// ---------------------------------------------------------------------------

/** What a visitor may see. Never the meeting link (that's for people who booked) or other bookings. */
export type PublicCalendar = {
  id: string;
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
  timezone: string;
  locationType: CalendarLocation;
  locationLabel: string;
  phoneMode: "off" | "optional" | "required";
  questions: BookingQuestion[];
  maxDaysAhead: number;
  host: string;
  workspaceSlug: string;
};

async function calendarBySlugs(workspaceSlug: string, calendarSlug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(workspaceSlug) || !/^[a-z0-9-]{1,80}$/.test(calendarSlug)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ calendar: calendars, workspace: workspaces })
    .from(calendars)
    .innerJoin(workspaces, eq(workspaces.id, calendars.workspaceId))
    .where(and(eq(workspaces.slug, workspaceSlug), eq(calendars.slug, calendarSlug)))
    .limit(1);
  return row ?? null;
}

/** Closed when the calendar is off, or the workspace is paused or not on a plan with calendars. */
async function isOpen(calendar: Calendar, workspace: Workspace) {
  return calendar.active && hasFeature(workspace.plan, "calendar") && (await isWorkspaceLive(workspace.id));
}

export function toPublic(calendar: Calendar, workspace: Workspace): PublicCalendar {
  return {
    id: calendar.id,
    slug: calendar.slug,
    name: calendar.name,
    description: calendar.description,
    durationMinutes: calendar.durationMinutes,
    timezone: calendar.timezone,
    locationType: calendar.locationType,
    locationLabel: LOCATION_LABELS[calendar.locationType],
    phoneMode: calendar.locationType === "phone" ? "required" : calendar.phoneMode,
    questions: calendar.questions,
    maxDaysAhead: calendar.maxDaysAhead,
    host: workspace.settings.businessName || workspace.name,
    workspaceSlug: workspace.slug,
  };
}

export async function publicCalendar(workspaceSlug: string, calendarSlug: string) {
  const row = await calendarBySlugs(workspaceSlug, calendarSlug);
  if (!row) return null;
  return { calendar: toPublic(row.calendar, row.workspace), open: await isOpen(row.calendar, row.workspace), raw: row.calendar, workspace: row.workspace };
}

/** The workspace's active calendars, for /b/<workspace>. */
export async function publicCalendarsFor(workspaceSlug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(workspaceSlug)) return null;
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, workspaceSlug)).limit(1);
  if (!ws || !hasFeature(ws.plan, "calendar") || !(await isWorkspaceLive(ws.id))) return null;
  const list = await db.select().from(calendars).where(and(eq(calendars.workspaceId, ws.id), eq(calendars.active, true))).orderBy(asc(calendars.createdAt));
  return { host: ws.settings.businessName || ws.name, calendars: list.map((c) => toPublic(c, ws)) };
}

/** Open start times (UTC) for a calendar, from now until its booking window ends. */
export async function availableSlots(calendar: Calendar, opts: { now?: Date; excludeBookingId?: string } = {}) {
  const now = opts.now ?? new Date();
  const db = await getDb();
  const until = new Date(now.getTime() + (calendar.maxDaysAhead + 2) * 86_400_000);
  const busy = await db
    .select({ start: bookings.startAt, end: bookings.blockedUntil, id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.calendarId, calendar.id), inArray(bookings.status, ACTIVE_STATUSES), gt(bookings.blockedUntil, new Date(now.getTime() - 86_400_000)), lt(bookings.startAt, until)));
  return generateSlots(
    {
      rules: calendar.availability,
      timezone: calendar.timezone,
      durationMinutes: calendar.durationMinutes,
      intervalMinutes: calendar.slotIntervalMinutes,
      bufferMinutes: calendar.bufferMinutes,
      minNoticeMinutes: calendar.minNoticeMinutes,
      maxDaysAhead: calendar.maxDaysAhead,
    },
    busy.filter((b) => b.id !== opts.excludeBookingId),
    now,
  );
}

const bookingInputSchema = z.object({
  startAt: z.string().datetime({ offset: true }),
  name: z.string().trim().min(1, "Add your name.").max(120),
  email: z.string().trim().max(200).refine(isEmail, "That email doesn't look right."),
  phone: z.string().trim().max(40).default(""),
  timezone: z.string().max(64).default("UTC"),
  answers: z.record(z.string().max(40), z.string().max(2000)).default({}),
  honeypot: z.string().max(200).default(""),
});
export type BookingInput = z.input<typeof bookingInputSchema>;

const isConflict = (err: unknown): boolean => {
  const codes = [(err as { code?: string })?.code, (err as { cause?: { code?: string } })?.cause?.code];
  return codes.includes("23P01") || codes.includes("23505") || err instanceof BookingError;
};

function newManageToken() {
  const token = randomToken(24);
  return { token, hash: sha256hex(token), enc: encrypt(token) };
}

export const manageUrl = (token: string) => `${env.appUrl}/booking/${token}`;
const tokenOf = (b: Booking) => decrypt(b.manageTokenEnc);

/**
 * A visitor books a time. Throws BookingError with a message to show them. The slot must be one we
 * offer right now; the calendar row is locked while we check and insert, and the database refuses
 * any overlap anyway.
 */
export async function bookSlot(
  workspaceSlug: string,
  calendarSlug: string,
  raw: BookingInput,
  opts: { ip?: string | null; now?: Date } = {},
): Promise<{ booking: Booking; token: string; calendar: Calendar; workspace: Workspace }> {
  const parsed = bookingInputSchema.safeParse(raw);
  if (!parsed.success) throw new BookingError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const input = parsed.data;
  const row = await calendarBySlugs(workspaceSlug, calendarSlug);
  if (!row || !(await isOpen(row.calendar, row.workspace))) throw new BookingError("This booking page is closed right now.", "closed");
  const { calendar, workspace } = row;
  if (input.honeypot) throw new BookingError("Something went wrong. Please try again.");

  const email = normalizeEmail(input.email);
  const allowed =
    (await takeRateLimit(`book:ip:${opts.ip ?? "unknown"}`, [
      { seconds: 600, max: 8 },
      { seconds: 86_400, max: 30 },
    ])) && (await takeRateLimit(`book:email:${email}`, [{ seconds: 3600, max: 4 }]));
  if (!allowed) throw new BookingError("That's a lot of bookings in a short time. Please wait a few minutes and try again.", "limited");

  const phoneMode = calendar.locationType === "phone" ? "required" : calendar.phoneMode;
  const phone = phoneMode === "off" ? "" : normalizePhone(input.phone);
  if (phoneMode === "required" && phone.replace(/\D/g, "").length < 6) throw new BookingError("Add a phone number we can reach you on.");
  const answers: { label: string; value: string }[] = [];
  for (const q of calendar.questions) {
    const value = (input.answers[q.id] ?? "").trim().slice(0, 2000);
    if (q.required && !value) throw new BookingError(`Please answer: ${q.label}`);
    if (value) answers.push({ label: q.label, value });
  }

  const now = opts.now ?? new Date();
  const start = new Date(input.startAt);
  const offered = await availableSlots(calendar, { now });
  if (!offered.some((s) => s.getTime() === start.getTime())) throw new BookingError("That time was just taken or isn't available. Pick another one.", "taken");
  const end = new Date(start.getTime() + calendar.durationMinutes * 60_000);
  const blockedUntil = new Date(end.getTime() + calendar.bufferMinutes * 60_000);
  const tz = canonicalZone(input.timezone, calendar.timezone);
  const t = newManageToken();

  const db = await getDb();
  let booking: Booking;
  try {
    booking = await db.transaction(async (tx) => {
      // One booking at a time per calendar: lock the calendar row, then check and insert.
      await tx.execute(sql`select ${calendars.id} from ${calendars} where ${calendars.id} = ${calendar.id} for update`);
      const [clash] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.calendarId, calendar.id), inArray(bookings.status, ACTIVE_STATUSES), lt(bookings.startAt, blockedUntil), gt(bookings.blockedUntil, start)))
        .limit(1);
      if (clash) throw new BookingError("That time was just taken. Pick another one.", "taken");
      const [b] = await tx
        .insert(bookings)
        .values({
          workspaceId: workspace.id,
          calendarId: calendar.id,
          startAt: start,
          endAt: end,
          blockedUntil,
          timezone: tz,
          name: input.name,
          email,
          phone,
          answers,
          manageTokenHash: t.hash,
          manageTokenEnc: t.enc,
        })
        .returning();
      return b;
    });
  } catch (err) {
    if (isConflict(err)) throw new BookingError("That time was just taken. Pick another one.", "taken");
    throw err;
  }

  // The person: into the CRM, tagged, on the board, and on everyone's calendar.
  const [firstName, ...rest] = input.name.split(/\s+/);
  const { contact } = await upsertContact({ workspaceId: workspace.id, email, phone: phone || null, firstName, lastName: rest.join(" "), source: "calendar", sourceRef: calendar.id });
  if (phone && !contact.phone) await db.update(contacts).set({ phone }).where(eq(contacts.id, contact.id));
  await db.update(bookings).set({ contactId: contact.id }).where(eq(bookings.id, booking.id));
  booking = { ...booking, contactId: contact.id };
  await logActivity({ workspaceId: workspace.id, contactId: contact.id, type: "booking_created", refId: booking.id, data: { calendar: calendar.name, startAt: start.toISOString(), timezone: tz } });
  await addTag(workspace.id, contact.id, BOOKED_TAG);
  await markCallBooked(workspace.id, contact.id, `${calendar.name}: ${contactName(contact)}`).catch((err) => console.error("[booking] pipeline move failed", err));
  await sendBookingEmails("confirmed", booking, calendar, workspace, t.token);
  await scheduleReminders(booking);
  await emitEvent({ type: "appointment_booked", workspaceId: workspace.id, contactId: contact.id, bookingId: booking.id, calendarId: calendar.id, calendarSlug: calendar.slug, startAt: start.toISOString() });
  return { booking, token: t.token, calendar, workspace };
}

// ---------------------------------------------------------------------------
// Managing a booking (the booker's private link, or the owner in the app)
// ---------------------------------------------------------------------------

export async function bookingByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ booking: bookings, calendar: calendars, workspace: workspaces })
    .from(bookings)
    .innerJoin(calendars, eq(calendars.id, bookings.calendarId))
    .innerJoin(workspaces, eq(workspaces.id, bookings.workspaceId))
    .where(eq(bookings.manageTokenHash, sha256hex(token)))
    .limit(1);
  return row ?? null;
}

export const isActive = (b: Pick<Booking, "status">) => ACTIVE_STATUSES.includes(b.status);

/** Moves a booking to a new open time. Same link, same invite (updated), fresh reminders. */
export async function rescheduleBooking(bookingId: string, startIso: string, opts: { by: "booker" | "owner"; timezone?: string; now?: Date }) {
  const db = await getDb();
  const [row] = await db
    .select({ booking: bookings, calendar: calendars, workspace: workspaces })
    .from(bookings)
    .innerJoin(calendars, eq(calendars.id, bookings.calendarId))
    .innerJoin(workspaces, eq(workspaces.id, bookings.workspaceId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) throw new BookingError("That booking doesn't exist any more.");
  const { booking, calendar, workspace } = row;
  if (!isActive(booking)) throw new BookingError("This booking was cancelled, so it can't be moved. Book a new time instead.");
  if (!(await isOpen(calendar, workspace))) throw new BookingError("This calendar is closed right now.", "closed");
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) throw new BookingError("Pick a time.");
  const now = opts.now ?? new Date();
  const offered = await availableSlots(calendar, { now, excludeBookingId: booking.id });
  if (!offered.some((s) => s.getTime() === start.getTime())) throw new BookingError("That time was just taken or isn't available. Pick another one.", "taken");
  const end = new Date(start.getTime() + calendar.durationMinutes * 60_000);
  const blockedUntil = new Date(end.getTime() + calendar.bufferMinutes * 60_000);
  let updated: Booking;
  try {
    updated = await db.transaction(async (tx) => {
      await tx.execute(sql`select ${calendars.id} from ${calendars} where ${calendars.id} = ${calendar.id} for update`);
      const [clash] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.calendarId, calendar.id), ne(bookings.id, booking.id), inArray(bookings.status, ACTIVE_STATUSES), lt(bookings.startAt, blockedUntil), gt(bookings.blockedUntil, start)))
        .limit(1);
      if (clash) throw new BookingError("That time was just taken. Pick another one.", "taken");
      const [b] = await tx
        .update(bookings)
        .set({
          startAt: start,
          endAt: end,
          blockedUntil,
          status: "rescheduled",
          rescheduledAt: new Date(),
          icsSequence: booking.icsSequence + 1,
          ...(opts.timezone && isValidTimeZone(opts.timezone) ? { timezone: canonicalZone(opts.timezone) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id))
        .returning();
      return b;
    });
  } catch (err) {
    if (isConflict(err)) throw new BookingError("That time was just taken. Pick another one.", "taken");
    throw err;
  }
  if (updated.contactId) {
    await logActivity({ workspaceId: workspace.id, contactId: updated.contactId, type: "booking_rescheduled", refId: updated.id, data: { calendar: calendar.name, from: booking.startAt.toISOString(), startAt: start.toISOString(), timezone: updated.timezone, by: opts.by } });
  }
  await sendBookingEmails("rescheduled", updated, calendar, workspace, tokenOf(updated), { by: opts.by, previousStart: booking.startAt });
  await scheduleReminders(updated);
  return updated;
}

export async function cancelBooking(bookingId: string, opts: { by: "booker" | "owner"; reason?: string }) {
  const db = await getDb();
  const [row] = await db
    .select({ booking: bookings, calendar: calendars, workspace: workspaces })
    .from(bookings)
    .innerJoin(calendars, eq(calendars.id, bookings.calendarId))
    .innerJoin(workspaces, eq(workspaces.id, bookings.workspaceId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) throw new BookingError("That booking doesn't exist any more.");
  if (!isActive(row.booking)) return row.booking;
  const reason = (opts.reason ?? "").trim().slice(0, 500);
  const [updated] = await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: reason, icsSequence: row.booking.icsSequence + 1, updatedAt: new Date() })
    .where(and(eq(bookings.id, bookingId), inArray(bookings.status, ACTIVE_STATUSES)))
    .returning();
  if (!updated) return row.booking;
  if (updated.contactId) {
    await logActivity({ workspaceId: row.workspace.id, contactId: updated.contactId, type: "booking_cancelled", refId: updated.id, data: { calendar: row.calendar.name, startAt: updated.startAt.toISOString(), timezone: updated.timezone, by: opts.by, reason } });
  }
  await sendBookingEmails("cancelled", updated, row.calendar, row.workspace, tokenOf(updated), { by: opts.by, reason });
  return updated;
}

export async function getBooking(workspaceId: string, id: string) {
  if (!isUuid(id)) return null;
  const db = await getDb();
  const [b] = await db.select().from(bookings).where(and(eq(bookings.id, id), eq(bookings.workspaceId, workspaceId))).limit(1);
  return b ?? null;
}

/** The owner marks someone who didn't turn up. Only once the call has started. */
export async function markNoShow(workspaceId: string, id: string, undo = false) {
  const b = await getBooking(workspaceId, id);
  if (!b) throw new BookingError("That booking doesn't exist any more.");
  if (!undo && b.startAt.getTime() > Date.now()) throw new BookingError("You can mark a no-show once the call has started.");
  if (!undo && !isActive(b)) throw new BookingError("Only booked calls can be marked as a no-show.");
  if (undo && b.status !== "no_show") return b;
  const db = await getDb();
  const [row] = await db
    .update(bookings)
    .set({ status: undo ? "confirmed" : "no_show", updatedAt: new Date() })
    .where(eq(bookings.id, id))
    .returning();
  if (b.contactId && !undo) await logActivity({ workspaceId, contactId: b.contactId, type: "booking_no_show", refId: b.id, data: { startAt: b.startAt.toISOString(), timezone: b.timezone } });
  return row;
}

export type BookingRow = Booking & { calendarName: string; calendarSlug: string; calendarTimezone: string; durationMinutes: number };

export async function listBookings(workspaceId: string, opts: { from?: Date; to?: Date; statuses?: BookingStatus[]; contactId?: string; limit?: number; order?: "asc" | "desc" } = {}): Promise<BookingRow[]> {
  const db = await getDb();
  const conds = [eq(bookings.workspaceId, workspaceId)];
  if (opts.from) conds.push(gte(bookings.startAt, opts.from));
  if (opts.to) conds.push(lt(bookings.startAt, opts.to));
  if (opts.statuses?.length) conds.push(inArray(bookings.status, opts.statuses));
  if (opts.contactId && isUuid(opts.contactId)) conds.push(eq(bookings.contactId, opts.contactId));
  const rows = await db
    .select({ booking: bookings, calendarName: calendars.name, calendarSlug: calendars.slug, calendarTimezone: calendars.timezone, durationMinutes: calendars.durationMinutes })
    .from(bookings)
    .innerJoin(calendars, eq(calendars.id, bookings.calendarId))
    .where(and(...conds))
    .orderBy(opts.order === "desc" ? desc(bookings.startAt) : asc(bookings.startAt))
    .limit(Math.min(500, opts.limit ?? 200));
  return rows.map((r) => ({ ...r.booking, calendarName: r.calendarName, calendarSlug: r.calendarSlug, calendarTimezone: r.calendarTimezone, durationMinutes: r.durationMinutes }));
}

// ---------------------------------------------------------------------------
// Emails, invites and reminders
// ---------------------------------------------------------------------------

export function locationText(calendar: Calendar, booking: Pick<Booking, "phone">) {
  const v = calendar.locationValue.trim();
  switch (calendar.locationType) {
    case "phone":
      return `Phone call: we'll call you on ${booking.phone || "the number you gave"}${v ? ` (from ${v})` : ""}.`;
    case "in_person":
      return v ? `In person: ${v}` : "In person (we'll send the address).";
    case "zoom":
    case "google_meet":
      return v ? `${LOCATION_LABELS[calendar.locationType]}: ${v}` : `${LOCATION_LABELS[calendar.locationType]} (the link is on its way).`;
    default:
      return v || "We'll send the details.";
  }
}

/** The invite file both sides get. Cancellations carry METHOD:CANCEL so calendar apps remove it. */
export function inviteFor(booking: Booking, calendar: Calendar, host: string, ownerEmail: string | null, method: "REQUEST" | "CANCEL") {
  return buildIcs({
    uid: `${booking.id}@onex-booking`,
    sequence: booking.icsSequence,
    start: booking.startAt,
    end: booking.endAt,
    title: `${calendar.name} · ${host} & ${booking.name}`,
    description: `${calendar.name} with ${host}.\n${locationText(calendar, booking)}\nReschedule or cancel: ${manageUrl(tokenOf(booking))}`,
    location: calendar.locationValue || LOCATION_LABELS[calendar.locationType],
    organizer: { name: host, email: ownerEmail || env.emailReplyTo },
    attendee: { name: booking.name, email: booking.email },
    method,
  });
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

export async function sendBookingEmails(
  kind: "confirmed" | "rescheduled" | "cancelled",
  booking: Booking,
  calendar: Calendar,
  workspace: Workspace,
  token: string,
  extra: { by?: "booker" | "owner"; reason?: string; previousStart?: Date } = {},
) {
  const { queueEmail, workspaceOwnerEmail, workspaceOwnerFirstName } = await import("./email/send");
  const host = workspace.settings.businessName || workspace.name;
  const ownerEmail = await workspaceOwnerEmail(workspace.id);
  const ownerName = (await workspaceOwnerFirstName(workspace.id)) || host;
  const ics = inviteFor(booking, calendar, host, ownerEmail, kind === "cancelled" ? "CANCEL" : "REQUEST");
  const attachments = [{ name: kind === "cancelled" ? "cancelled.ics" : "invite.ics", contentType: `text/calendar; charset=utf-8; method=${kind === "cancelled" ? "CANCEL" : "REQUEST"}`, content: b64(ics) }];
  const manage = manageUrl(token);
  const gcal = googleCalendarUrl({ start: booking.startAt, end: booking.endAt, title: `${calendar.name} with ${host}`, details: `${locationText(calendar, booking)}\nReschedule or cancel: ${manage}`, location: calendar.locationValue });
  const bookerWhen = whenLine(booking.startAt, booking.endAt, booking.timezone);
  const ownerWhen = whenLine(booking.startAt, booking.endAt, calendar.timezone);
  const short = (tz: string) => `${formatInZone(booking.startAt, tz, { weekday: "short", month: "short", day: "numeric" })}, ${shortTime(booking.startAt, tz)}`;
  // Anything the booker typed goes in as a variable, so it can never become a link or formatting.
  const vars = {
    first_name: booking.name.split(/\s+/)[0] || "there",
    booker_name: booking.name,
    booker_email: booking.email,
    booker_phone: booking.phone || "not given",
    answers: booking.answers.map((a) => `${a.label}\n${a.value}`).join("\n\n") || "No answers.",
    reason: extra.reason || "No reason given.",
  };
  const contactLink = booking.contactId ? `${env.appUrl}/app/w/${workspace.id}/leads/${booking.contactId}` : `${env.appUrl}/app/w/${workspace.id}/calendar`;

  const toBooker =
    kind === "cancelled"
      ? {
          subject: `Cancelled: ${calendar.name} on ${short(booking.timezone)}`,
          body: `Hi {{first_name}},\n\n${extra.by === "owner" ? `${host} had to cancel your` : "Your"} ${calendar.name} on ${bookerWhen} is cancelled.${extra.by === "owner" && extra.reason ? "\n\nTheir note: {{reason}}" : ""}\n\nWant another time? [Book again](${bookingUrl(workspace.slug, calendar.slug)})\n\n${ownerName}`,
        }
      : {
          subject: `${kind === "rescheduled" ? "Moved" : "Booked"}: ${calendar.name} on ${short(booking.timezone)}`,
          body: `Hi {{first_name}},\n\n${kind === "rescheduled" ? "Your call has a new time." : `You're booked in with ${host}.`}\n\n**${calendar.name}**\n${bookerWhen}\n${locationText(calendar, booking)}${calendar.confirmationMessage && kind === "confirmed" ? `\n\n${calendar.confirmationMessage}` : ""}\n\n[Add to Google Calendar](${gcal}) · the invite is attached for Apple Calendar and Outlook.\n\nNeed a different time? [Reschedule or cancel](${manage})\n\nSee you then,\n${ownerName}`,
        };
  await queueEmail({ workspaceId: workspace.id, to: booking.email, subject: toBooker.subject, body: toBooker.body, vars, attachments });

  if (ownerEmail) {
    const who = "{{booker_name}}";
    const ownerSubject =
      kind === "cancelled"
        ? `Cancelled: ${booking.name} · ${short(calendar.timezone)}`
        : kind === "rescheduled"
          ? `Moved: ${booking.name} · ${short(calendar.timezone)}`
          : `New booking: ${booking.name} · ${short(calendar.timezone)}`;
    const head =
      kind === "cancelled"
        ? `${extra.by === "owner" ? "You cancelled" : `${who} cancelled`} their ${calendar.name}.${extra.by === "booker" ? "\n\nTheir reason: {{reason}}" : ""}`
        : kind === "rescheduled"
          ? `${extra.by === "owner" ? "You moved" : `${who} moved`} their ${calendar.name}${extra.previousStart ? ` (it was ${formatInZone(extra.previousStart, calendar.timezone, { weekday: "short", month: "short", day: "numeric" })}, ${shortTime(extra.previousStart, calendar.timezone)})` : ""}.`
          : `${who} booked a ${calendar.name}.`;
    await queueEmail({
      workspaceId: workspace.id,
      to: ownerEmail,
      subject: ownerSubject,
      body: `${head}\n\n**When:** ${ownerWhen}\n**Email:** {{booker_email}}\n**Phone:** {{booker_phone}}\n**Where:** ${locationText(calendar, booking)}\n\n${kind === "confirmed" ? "**Their answers**\n{{answers}}\n\n" : ""}[Open their contact](${contactLink})`,
      vars,
      attachments,
    });
  }
}

/** Reminders 24 h and 1 h before (only the ones still in the future). Keyed by the start time, so a reschedule gets fresh ones. */
export async function scheduleReminders(booking: Booking, now = new Date()) {
  for (const r of REMINDERS) {
    const runAt = new Date(booking.startAt.getTime() - r.minutes * 60_000);
    if (runAt.getTime() < now.getTime() + 5 * 60_000) continue;
    await enqueue("booking.reminder", { bookingId: booking.id, kind: r.key, startAt: booking.startAt.toISOString() }, { runAt, dedupeKey: `booking-reminder:${booking.id}:${booking.startAt.toISOString()}:${r.key}`, maxAttempts: 3 });
  }
}

/** The reminder job. Does nothing if the booking was cancelled or moved since it was queued. */
export async function processBookingReminder(payload: Record<string, unknown>) {
  const bookingId = String(payload.bookingId ?? "");
  if (!isUuid(bookingId)) return;
  const db = await getDb();
  const [row] = await db
    .select({ booking: bookings, calendar: calendars, workspace: workspaces })
    .from(bookings)
    .innerJoin(calendars, eq(calendars.id, bookings.calendarId))
    .innerJoin(workspaces, eq(workspaces.id, bookings.workspaceId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row || !isActive(row.booking) || row.booking.startAt.toISOString() !== payload.startAt) return;
  if (!(await isWorkspaceLive(row.workspace.id))) return;
  const { booking, calendar, workspace } = row;
  const r = REMINDERS.find((x) => x.key === payload.kind) ?? REMINDERS[1];
  const host = workspace.settings.businessName || workspace.name;
  const token = tokenOf(booking);
  const when = `${shortTime(booking.startAt, booking.timezone)} (${formatInZone(booking.startAt, booking.timezone, { weekday: "long", month: "short", day: "numeric" })})`;
  const { queueEmail } = await import("./email/send");
  await queueEmail({
    workspaceId: workspace.id,
    to: booking.email,
    subject: `Reminder: ${calendar.name} with ${host} ${r.label}`,
    body: `Hi {{first_name}},\n\nA quick reminder: your ${calendar.name} with ${host} is ${r.label}, at ${when}.\n\n${locationText(calendar, booking)}\n\nCan't make it? [Reschedule or cancel](${manageUrl(token)}). It helps a lot.\n\nSee you soon!`,
    vars: { first_name: booking.name.split(/\s+/)[0] || "there" },
  });
  if (booking.contactId) await logActivity({ workspaceId: workspace.id, contactId: booking.contactId, type: "booking_reminder", refId: booking.id, data: { kind: r.key } });
  await sendReminderSms(workspace.id, booking, `Reminder: ${calendar.name} with ${host} ${r.label} at ${when}. ${calendar.locationValue && calendar.locationType !== "in_person" ? `${calendar.locationValue} ` : ""}Change it: ${manageUrl(token)}`);
}

/** SMS too, when Twilio is set up, the workspace has a number and the booker gave a phone. */
async function sendReminderSms(workspaceId: string, booking: Booking, text: string) {
  const { smsConfigured, sendSms } = await import("./sms");
  if (!booking.phone || !smsConfigured()) return;
  const db = await getDb();
  const [conn] = await db
    .select()
    .from(channelConnections)
    .where(and(eq(channelConnections.workspaceId, workspaceId), eq(channelConnections.kind, "sms"), eq(channelConnections.status, "active")))
    .limit(1);
  if (!conn) return;
  const { chargeUsage, refundUsage, InsufficientBalanceError } = await import("./wallet");
  const body = text.slice(0, 459);
  const segments = Math.max(1, Math.ceil(body.length / 153));
  let charge: { billedMicros: number };
  try {
    charge = await chargeUsage(workspaceId, "sms_segment", segments, { description: "Booking reminder SMS" });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) return;
    throw err;
  }
  try {
    await sendSms({ from: conn.externalId, to: booking.phone, body });
  } catch (err) {
    await refundUsage(workspaceId, "sms_segment", segments, charge.billedMicros, "Refund: reminder SMS not sent");
    console.error("[booking] reminder SMS failed", err instanceof Error ? err.message : err);
  }
}
