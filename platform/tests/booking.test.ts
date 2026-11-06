import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, automationRuns, bookings, channelConnections, contacts, emailMessages, jobs, opportunities, workspaces } from "@/lib/db/schema";
import { buildIcs, generateSlots, groupByLocalDate, localDateKey, zonedTimeToUtc } from "@/lib/booking";
import {
  availableSlots,
  bookingByToken,
  bookSlot,
  BookingError,
  cancelBooking,
  createCalendar,
  createStarterCalendar,
  markNoShow,
  processBookingReminder,
  publicCalendar,
  rescheduleBooking,
} from "@/server/booking";
import { saveAutomation } from "@/server/automations";
import { ensureDefaultPipeline, stageNamed } from "@/server/pipelines";
import { runDueJobs } from "@/server/jobs/runner";
import { makeWorkspace } from "./helpers";

const iso = (s: string) => new Date(s).toISOString();
const ALL_DAY = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "00:00", end: "24:00" }));

describe("slot generation", () => {
  it("keeps 9:00 local on both sides of a DST change (New York, March)", () => {
    const slots = generateSlots(
      { rules: [1, 2, 3, 4, 5].map((day) => ({ day, start: "09:00", end: "11:00" })), timezone: "America/New_York", durationMinutes: 60, maxDaysAhead: 5 },
      [],
      new Date("2026-03-06T12:00:00Z"), // Friday 7:00 EST
    );
    // Friday is still EST (UTC-5); Monday is EDT (UTC-4) after the clocks went forward on Sunday.
    expect(slots.map((s) => s.toISOString())).toEqual([iso("2026-03-06T14:00:00Z"), iso("2026-03-06T15:00:00Z"), iso("2026-03-09T13:00:00Z"), iso("2026-03-09T14:00:00Z"), iso("2026-03-10T13:00:00Z"), iso("2026-03-10T14:00:00Z")]);
  });

  it("skips wall times that don't exist and handles the repeated autumn hour (London)", () => {
    expect(zonedTimeToUtc(2026, 3, 8, 150, "America/New_York")).toBeNull(); // 02:30 never happens
    const spring = generateSlots({ rules: [{ day: 0, start: "00:00", end: "03:00" }], timezone: "Europe/London", durationMinutes: 30, maxDaysAhead: 2 }, [], new Date("2026-03-28T23:00:00Z"));
    expect(spring.map((s) => s.toISOString())).toEqual([iso("2026-03-29T00:00:00Z"), iso("2026-03-29T00:30:00Z"), iso("2026-03-29T01:00:00Z"), iso("2026-03-29T01:30:00Z")]);
    const autumn = generateSlots({ rules: [{ day: 0, start: "00:00", end: "03:00" }], timezone: "Europe/London", durationMinutes: 60, maxDaysAhead: 2 }, [], new Date("2026-10-24T22:00:00Z"));
    // 00:00 BST, 01:00 (first, BST), 02:00 GMT: no duplicates, all in order.
    expect(autumn.map((s) => s.toISOString())).toEqual([iso("2026-10-24T23:00:00Z"), iso("2026-10-25T00:00:00Z"), iso("2026-10-25T02:00:00Z")]);
  });

  it("shows each visitor the day in their own zone", () => {
    const s = new Date("2026-03-09T20:00:00Z"); // 16:00 in New York
    expect(localDateKey(s, "America/New_York")).toBe("2026-03-09");
    expect(Object.keys(groupByLocalDate([s], "Asia/Tokyo"))).toEqual(["2026-03-10"]);
    expect(Object.keys(groupByLocalDate([s], "Asia/Kolkata"))).toEqual(["2026-03-10"]);
  });

  it("respects buffers, notice and how far ahead people can book", () => {
    const base = { rules: [{ day: 2, start: "13:00", end: "16:00" }], timezone: "UTC", durationMinutes: 30, intervalMinutes: 15, bufferMinutes: 15 };
    const now = new Date("2026-11-09T00:00:00Z"); // Monday
    // A booking 14:00-14:30 blocks until 14:45.
    const slots = generateSlots({ ...base, maxDaysAhead: 3 }, [{ start: new Date("2026-11-10T14:00:00Z"), end: new Date("2026-11-10T14:45:00Z") }], now).map((d) => d.toISOString().slice(11, 16));
    expect(slots).toEqual(["13:00", "13:15", "14:45", "15:00", "15:15", "15:30"]);
    expect(generateSlots({ ...base, maxDaysAhead: 1 }, [], now)).toHaveLength(0); // Tuesday is outside a 1-day window
    expect(generateSlots({ ...base, maxDaysAhead: 3, minNoticeMinutes: 60 * 38 }, [], now).map((d) => d.toISOString().slice(11, 16))).toEqual(["14:00", "14:15", "14:30", "14:45", "15:00", "15:15", "15:30"]);
  });

  it("builds a valid, folded invite", () => {
    const ics = buildIcs({ uid: "abc@onex", sequence: 2, start: new Date("2026-11-10T14:00:00Z"), end: new Date("2026-11-10T14:30:00Z"), title: "Intro call; with, commas", description: "x".repeat(200), method: "CANCEL" });
    expect(ics).toContain("METHOD:CANCEL\r\n");
    expect(ics).toContain("DTSTART:20261110T140000Z");
    expect(ics).toContain("SUMMARY:Intro call\\; with\\, commas");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});

async function growthCalendar(overrides: Partial<Parameters<typeof createCalendar>[1]> = {}) {
  const made = await makeWorkspace({ plan: "growth" });
  const cal = await createCalendar(made.ws.id, {
    name: "Intro call",
    durationMinutes: 30,
    bufferMinutes: 10,
    minNoticeMinutes: 0,
    maxDaysAhead: 14,
    timezone: "UTC",
    availability: ALL_DAY,
    locationType: "zoom",
    locationValue: "https://zoom.us/j/123",
    questions: [{ id: "goal", label: "What do you want help with?", type: "long", required: true }],
    confirmationMessage: "Bring one question.",
    ...overrides,
  });
  return { ...made, cal };
}

/** A slot at least two days out, so both reminders are in the future. */
async function laterSlot(cal: Awaited<ReturnType<typeof createCalendar>>, skip = 0) {
  const slots = await availableSlots(cal);
  return slots.filter((s) => s.getTime() > Date.now() + 2 * 86_400_000)[skip];
}

let ipN = 0;
const ip = () => `10.0.0.${++ipN}`;

describe("double booking", () => {
  it("is refused by the database itself, overlap and buffer included", async () => {
    const { ws, cal } = await growthCalendar();
    const db = await getDb();
    const row = (start: string, end: string, blocked: string, n: number) => ({
      workspaceId: ws.id,
      calendarId: cal.id,
      startAt: new Date(start),
      endAt: new Date(end),
      blockedUntil: new Date(blocked),
      email: `p${n}@example.com`,
      manageTokenHash: `hash-${n}-${Math.random()}`,
      manageTokenEnc: "x",
    });
    await db.insert(bookings).values(row("2030-01-01T10:00:00Z", "2030-01-01T10:30:00Z", "2030-01-01T10:40:00Z", 1));
    // Starts inside the buffer of the first one.
    await expect(db.insert(bookings).values(row("2030-01-01T10:35:00Z", "2030-01-01T11:05:00Z", "2030-01-01T11:15:00Z", 2))).rejects.toThrow();
    // Same start time.
    await expect(db.insert(bookings).values(row("2030-01-01T10:00:00Z", "2030-01-01T10:30:00Z", "2030-01-01T10:40:00Z", 3))).rejects.toThrow();
    // Right after the buffer: fine. And a cancelled booking never blocks.
    await db.insert(bookings).values(row("2030-01-01T10:40:00Z", "2030-01-01T11:10:00Z", "2030-01-01T11:20:00Z", 4));
    await db.insert(bookings).values({ ...row("2030-01-01T10:00:00Z", "2030-01-01T10:30:00Z", "2030-01-01T10:40:00Z", 5), status: "cancelled" });
  });

  it("lets only one of two people grab the same time at once", async () => {
    const { ws, cal } = await growthCalendar();
    const slot = await laterSlot(cal);
    const results = await Promise.allSettled(
      ["ana@example.com", "ben@example.com"].map((email) => bookSlot(ws.slug, cal.slug, { startAt: slot.toISOString(), name: "Same Time", email, answers: { goal: "x" } }, { ip: ip() })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(BookingError);
    expect((failed.reason as BookingError).code).toBe("taken");
    expect((await availableSlots(cal)).some((s) => s.getTime() === slot.getTime())).toBe(false);
  });
});

describe("booking a call", () => {
  it("adds the contact, moves the opportunity, fires automations, emails both sides and queues reminders", async () => {
    const { ws, cal } = await growthCalendar();
    await saveAutomation(ws.id, null, { name: "Booked", trigger: { type: "appointment_booked", value: "intro-call" }, actions: [{ type: "add_tag", tag: "call-prep" }], active: true });
    const db = await getDb();
    const slot = await laterSlot(cal);
    const { booking, token } = await bookSlot(ws.slug, cal.slug, { startAt: slot.toISOString(), name: "Jamie Doyle", email: "Jamie@Example.com", phone: "+1 555 201 3344", timezone: "America/New_York", answers: { goal: "Get my first 10 members" } }, { ip: ip() });

    expect(booking).toMatchObject({ status: "confirmed", email: "jamie@example.com", timezone: "America/New_York", answers: [{ label: "What do you want help with?", value: "Get my first 10 members" }] });
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(booking.manageTokenHash).not.toContain(token);
    const [contact] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, ws.id), eq(contacts.email, "jamie@example.com")));
    expect(contact).toMatchObject({ firstName: "Jamie", lastName: "Doyle", phone: "+15552013344", source: "calendar" });
    expect(contact.tags).toContain("booked-call");
    expect((await db.select().from(activities).where(and(eq(activities.contactId, contact.id), eq(activities.type, "booking_created"))))).toHaveLength(1);

    const p = await ensureDefaultPipeline(ws.id);
    const [deal] = await db.select().from(opportunities).where(eq(opportunities.contactId, contact.id));
    expect(deal.stageId).toBe(stageNamed(p, "Call booked")!.id);

    const runs = await db.select().from(automationRuns).where(eq(automationRuns.workspaceId, ws.id));
    expect(runs.some((r) => (r.context as { type?: string }).type === "appointment_booked")).toBe(true);

    const mails = await db.select().from(emailMessages).where(eq(emailMessages.workspaceId, ws.id));
    const toBooker = mails.find((m) => m.toEmail === "jamie@example.com")!;
    const toOwner = mails.find((m) => m.toEmail !== "jamie@example.com" && m.subject.startsWith("New booking"))!;
    expect(toBooker.subject).toMatch(/^Booked: Intro call on /);
    expect(toBooker.text).toContain("https://zoom.us/j/123");
    expect(toBooker.text).toContain("Bring one question.");
    expect(toBooker.html).toContain("calendar.google.com/calendar/render");
    expect(toBooker.text).toContain(`/booking/${token}`);
    const ics = Buffer.from(toBooker.attachments![0].content, "base64").toString();
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain(`UID:${booking.id}@onex-booking`);
    expect(toOwner.text).toContain("Get my first 10 members");
    expect(toOwner.attachments).toHaveLength(1);

    const reminders = await db.select().from(jobs).where(like(jobs.dedupeKey, `booking-reminder:${booking.id}:%`));
    expect(reminders.map((j) => j.runAt.getTime()).sort()).toEqual([slot.getTime() - 24 * 3600_000, slot.getTime() - 3600_000]);

    // The emails actually go out through the queue.
    await runDueJobs();
    const sent = await db.select().from(emailMessages).where(eq(emailMessages.workspaceId, ws.id));
    expect(sent.filter((m) => m.status === "sent").length).toBeGreaterThanOrEqual(2);
    const [tagged] = await db.select().from(contacts).where(eq(contacts.id, contact.id));
    expect(tagged.tags).toContain("call-prep");
  });

  it("checks the form, the slot and the plan", async () => {
    const { ws, cal } = await growthCalendar({ phoneMode: "required" });
    const slot = await laterSlot(cal);
    const base = { startAt: slot.toISOString(), name: "Kim", email: "kim@example.com", phone: "+44 7700 900123", answers: { goal: "x" } };
    await expect(bookSlot(ws.slug, cal.slug, { ...base, phone: "" }, { ip: ip() })).rejects.toThrow(/phone/);
    await expect(bookSlot(ws.slug, cal.slug, { ...base, answers: {} }, { ip: ip() })).rejects.toThrow(/Please answer/);
    await expect(bookSlot(ws.slug, cal.slug, { ...base, email: "nope" }, { ip: ip() })).rejects.toThrow(/email/);
    await expect(bookSlot(ws.slug, cal.slug, { ...base, startAt: new Date(slot.getTime() + 60_000).toISOString() }, { ip: ip() })).rejects.toThrow(/isn't available/);
    await expect(bookSlot(ws.slug, "nope", base, { ip: ip() })).rejects.toThrow(/closed/);
    const db = await getDb();
    await db.update(workspaces).set({ plan: "starter" }).where(eq(workspaces.id, ws.id));
    await expect(bookSlot(ws.slug, cal.slug, base, { ip: ip() })).rejects.toThrow(/closed/);
  });

  it("rate-limits one person booking over and over", async () => {
    const { ws, cal } = await growthCalendar();
    const slots = (await availableSlots(cal)).filter((s) => s.getTime() > Date.now() + 2 * 86_400_000);
    const one = ip();
    for (let i = 0; i < 4; i++) await bookSlot(ws.slug, cal.slug, { startAt: slots[i * 3].toISOString(), name: "Spam", email: "spam@example.com", answers: { goal: "x" } }, { ip: one });
    await expect(bookSlot(ws.slug, cal.slug, { startAt: slots[20].toISOString(), name: "Spam", email: "spam@example.com", answers: { goal: "x" } }, { ip: one })).rejects.toThrow(/a lot of bookings/);
  });

  it("never shows visitors the meeting link", async () => {
    const { ws, cal } = await growthCalendar();
    const pub = await publicCalendar(ws.slug, cal.slug);
    expect(pub?.open).toBe(true);
    expect(JSON.stringify(pub?.calendar)).not.toContain("zoom.us");
    expect(Object.keys(pub!.calendar)).not.toContain("locationValue");
  });
});

describe("rescheduling and cancelling", () => {
  it("moves a booking with its private link and tells both sides", async () => {
    const { ws, cal } = await growthCalendar();
    const db = await getDb();
    const first = await laterSlot(cal);
    const { booking, token } = await bookSlot(ws.slug, cal.slug, { startAt: first.toISOString(), name: "Priya Nair", email: "priya@example.com", answers: { goal: "x" } }, { ip: ip() });
    const found = await bookingByToken(token);
    expect(found?.booking.id).toBe(booking.id);
    expect(await bookingByToken("x".repeat(32))).toBeNull();

    const next = await laterSlot(cal, 5);
    const moved = await rescheduleBooking(booking.id, next.toISOString(), { by: "booker", timezone: "Europe/London" });
    expect(moved).toMatchObject({ status: "rescheduled", icsSequence: 1, timezone: "Europe/London" });
    expect(moved.startAt.getTime()).toBe(next.getTime());
    const open = await availableSlots(cal);
    expect(open.some((s) => s.getTime() === first.getTime())).toBe(true);
    expect(open.some((s) => s.getTime() === next.getTime())).toBe(false);
    const mails = await db.select().from(emailMessages).where(eq(emailMessages.workspaceId, ws.id));
    expect(mails.some((m) => m.toEmail === "priya@example.com" && m.subject.startsWith("Moved:"))).toBe(true);
    expect(mails.some((m) => m.subject.startsWith("Moved: Priya Nair"))).toBe(true);
    const fresh = await db.select().from(jobs).where(like(jobs.dedupeKey, `booking-reminder:${booking.id}:${next.toISOString()}:%`));
    expect(fresh).toHaveLength(2);

    // The old reminder (queued for the first time) does nothing now.
    const before = (await db.select().from(emailMessages).where(eq(emailMessages.workspaceId, ws.id))).length;
    await processBookingReminder({ bookingId: booking.id, kind: "24h", startAt: first.toISOString() });
    expect((await db.select().from(emailMessages).where(eq(emailMessages.workspaceId, ws.id))).length).toBe(before);
    // The current one sends.
    await processBookingReminder({ bookingId: booking.id, kind: "1h", startAt: next.toISOString() });
    const after = await db.select().from(emailMessages).where(eq(emailMessages.workspaceId, ws.id));
    expect(after.some((m) => m.subject === "Reminder: Intro call with Fit Dads Club in 1 hour")).toBe(true);

    // Cancel: the time opens up, both sides hear about it, the invite says CANCEL.
    const cancelled = await cancelBooking(booking.id, { by: "booker", reason: "Kid is sick" });
    expect(cancelled.status).toBe("cancelled");
    expect((await availableSlots(cal)).some((s) => s.getTime() === next.getTime())).toBe(true);
    const all = await db.select().from(emailMessages).where(eq(emailMessages.workspaceId, ws.id));
    const toOwner = all.find((m) => m.subject.startsWith("Cancelled: Priya Nair"))!;
    expect(toOwner.text).toContain("Kid is sick");
    const toBooker = all.find((m) => m.toEmail === "priya@example.com" && m.subject.startsWith("Cancelled:"))!;
    expect(Buffer.from(toBooker.attachments![0].content, "base64").toString()).toContain("METHOD:CANCEL");
    await expect(rescheduleBooking(booking.id, next.toISOString(), { by: "booker" })).rejects.toThrow(/cancelled/);
    const timeline = await db.select().from(activities).where(eq(activities.contactId, cancelled.contactId!));
    expect(timeline.map((a) => a.type)).toEqual(expect.arrayContaining(["booking_created", "booking_rescheduled", "booking_cancelled", "booking_reminder"]));
  });

  it("texts a reminder when Twilio is set up and they gave a phone", async () => {
    const { ws, cal } = await growthCalendar();
    const db = await getDb();
    await db.update(workspaces).set({ plan: "owner" }).where(eq(workspaces.id, ws.id));
    await db.insert(channelConnections).values({ workspaceId: ws.id, kind: "sms", externalId: "+15550001111", name: "+15550001111" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ sid: "SM1" }), { status: 201 }));
    const slot = await laterSlot(cal);
    const { booking } = await bookSlot(ws.slug, cal.slug, { startAt: slot.toISOString(), name: "Sam", email: "sam@example.com", phone: "+15552223333", answers: { goal: "x" } }, { ip: ip() });
    await processBookingReminder({ bookingId: booking.id, kind: "24h", startAt: slot.toISOString() });
    const twilioCall = fetchSpy.mock.calls.find(([url]) => String(url).includes("/Messages.json"));
    expect(twilioCall).toBeTruthy();
    const form = new URLSearchParams(String((twilioCall![1] as RequestInit).body));
    expect(form.get("To")).toBe("+15552223333");
    expect(form.get("From")).toBe("+15550001111");
    expect(form.get("Body")).toMatch(/^Reminder: Intro call with Fit Dads Club tomorrow/);
  });

  it("lets the owner mark a no-show only after the start", async () => {
    const { ws, cal } = await growthCalendar();
    const slot = await laterSlot(cal);
    const { booking } = await bookSlot(ws.slug, cal.slug, { startAt: slot.toISOString(), name: "Lee", email: "lee@example.com", answers: { goal: "x" } }, { ip: ip() });
    await expect(markNoShow(ws.id, booking.id)).rejects.toThrow(/once the call has started/);
    const db = await getDb();
    await db.update(bookings).set({ startAt: new Date(Date.now() - 3600_000), endAt: new Date(Date.now() - 1800_000), blockedUntil: new Date(Date.now() - 1200_000) }).where(eq(bookings.id, booking.id));
    expect((await markNoShow(ws.id, booking.id)).status).toBe("no_show");
    expect((await markNoShow(ws.id, booking.id, true)).status).toBe("confirmed");
    const other = await makeWorkspace({ plan: "growth" });
    await expect(markNoShow(other.ws.id, booking.id)).rejects.toThrow(/doesn't exist/);
  });

  it("gives a beginner a sensible first calendar", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    const cal = await createStarterCalendar(ws.id, "Europe/Berlin");
    expect(cal).toMatchObject({ slug: "intro-call", durationMinutes: 30, timezone: "Europe/Berlin", active: true });
    expect(cal.availability).toHaveLength(5);
    expect((await createStarterCalendar(ws.id, "Asia/Calcutta")).timezone).toBe("Asia/Kolkata");
    const again = await createStarterCalendar(ws.id, "Not/AZone");
    expect(again).toMatchObject({ slug: "intro-call-3", timezone: "UTC" });
  });
});

afterEach(() => vi.restoreAllMocks());
