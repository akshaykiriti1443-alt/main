"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { googleCalendarUrl, isValidTimeZone } from "@/lib/booking";
import { clientIp } from "@/lib/ip";
import {
  availableSlots,
  bookingByToken,
  BookingError,
  bookSlot,
  cancelBooking,
  createCalendar,
  createStarterCalendar,
  deleteCalendar,
  getBooking,
  isActive,
  locationText,
  manageUrl,
  markNoShow,
  publicCalendar,
  rescheduleBooking,
  setCalendarActive,
  updateCalendar,
  type BookingInput,
  type CalendarInput,
} from "@/server/booking";
import { hasFeature } from "@/server/plans";
import { takeRateLimit } from "@/server/rateLimit";
import { requireWorkspace } from "@/server/tenancy";
import { errMsg, field, go } from "./helpers";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

const fail = (err: unknown): { ok: false; error: string; code?: string } => {
  if (err instanceof BookingError) return { ok: false, error: err.message, code: err.code };
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Check the form." };
  console.error("[calendar]", err);
  return { ok: false, error: errMsg(err) };
};

const uuid = z.string().uuid();

// ---------------------------------------------------------------------------
// Owner (in the app)
// ---------------------------------------------------------------------------

async function gate(wid: string, minRole: "user" | "admin" = "user") {
  const ctx = await requireWorkspace(wid, minRole);
  if (!hasFeature(ctx.workspace.plan, "calendar")) throw new BookingError("The booking calendar is on the Growth plan. Upgrade in Plan & wallet.");
  return ctx;
}
const done = (wid: string) => revalidatePath(`/app/w/${wid}/calendar`);

/** The first-visit button: a ready 30-minute intro call in the owner's own time zone. */
export async function createStarterCalendarAction(wid: string, fd: FormData) {
  try {
    await gate(wid, "admin");
  } catch (err) {
    go(`/app/w/${wid}/calendar`, { error: errMsg(err) });
  }
  const tz = field(fd, "timezone", 64);
  const cal = await createStarterCalendar(wid, isValidTimeZone(tz) ? tz : "UTC");
  go(`/app/w/${wid}/calendar?c=${cal.id}`, { ok: "Your booking page is live. Add your Zoom link, then copy the link and share it." });
}

/** Create (id null) or save a calendar's settings and availability. */
export async function saveCalendarAction(wid: string, id: string | null, input: CalendarInput): Promise<ActionResult<{ id: string; slug: string }>> {
  try {
    await gate(wid, "admin");
    const cal = id ? await updateCalendar(wid, uuid.parse(id), input) : await createCalendar(wid, input);
    done(wid);
    return { ok: true, id: cal.id, slug: cal.slug };
  } catch (err) {
    return fail(err);
  }
}

export async function setCalendarActiveAction(wid: string, id: string, active: boolean): Promise<ActionResult> {
  try {
    await gate(wid, "admin");
    await setCalendarActive(wid, uuid.parse(id), Boolean(active));
    done(wid);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteCalendarAction(wid: string, id: string): Promise<ActionResult> {
  try {
    await gate(wid, "admin");
    await deleteCalendar(wid, uuid.parse(id));
    done(wid);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** The owner cancels a booking: the booker gets an email (with the note) and the invite is withdrawn. */
export async function ownerCancelBookingAction(wid: string, id: string, reason = ""): Promise<ActionResult> {
  try {
    await gate(wid);
    const b = await getBooking(wid, uuid.parse(id));
    if (!b) return { ok: false, error: "That booking doesn't exist any more." };
    await cancelBooking(b.id, { by: "owner", reason: z.string().max(500).parse(reason) });
    done(wid);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function noShowAction(wid: string, id: string, undo = false): Promise<ActionResult> {
  try {
    await gate(wid);
    await markNoShow(wid, uuid.parse(id), undo);
    done(wid);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Public (booking page and the booker's private link). No login: everything is validated here,
// and only the booker's own booking is ever returned.
// ---------------------------------------------------------------------------

export type BookedView = {
  startAt: string;
  endAt: string;
  timezone: string;
  location: string;
  confirmationMessage: string;
  manageUrl: string;
  googleUrl: string;
  icsUrl: string;
};

const slugRe = /^[a-z0-9-]{1,80}$/;

/** Fresh open times (ISO, UTC) for a calendar, e.g. after someone else took the one you picked. */
export async function publicSlotsAction(workspaceSlug: string, calendarSlug: string): Promise<string[]> {
  if (!slugRe.test(workspaceSlug) || !slugRe.test(calendarSlug)) return [];
  const pub = await publicCalendar(workspaceSlug, calendarSlug);
  if (!pub?.open) return [];
  return (await availableSlots(pub.raw)).map((d) => d.toISOString());
}

export async function bookAction(workspaceSlug: string, calendarSlug: string, input: BookingInput): Promise<ActionResult<{ booked: BookedView }> | { ok: false; error: string; code?: string; slots?: string[] }> {
  try {
    const ip = clientIp(await headers());
    const { booking, token, calendar } = await bookSlot(workspaceSlug, calendarSlug, input, { ip });
    const url = manageUrl(token);
    return {
      ok: true,
      booked: {
        startAt: booking.startAt.toISOString(),
        endAt: booking.endAt.toISOString(),
        timezone: booking.timezone,
        location: locationText(calendar, booking),
        confirmationMessage: calendar.confirmationMessage,
        manageUrl: url,
        icsUrl: `${url}/invite.ics`,
        googleUrl: googleCalendarUrl({ start: booking.startAt, end: booking.endAt, title: calendar.name, details: `${locationText(calendar, booking)}\nReschedule or cancel: ${url}`, location: calendar.locationValue }),
      },
    };
  } catch (err) {
    const f = fail(err);
    // Someone else got there first: send the fresh times so the page can redraw without a reload.
    if (f.code === "taken") return { ...f, slots: await publicSlotsAction(workspaceSlug, calendarSlug) };
    return f;
  }
}

async function manageGate(token: string) {
  const ip = clientIp(await headers());
  if (!(await takeRateLimit(`manage:ip:${ip ?? "unknown"}`, [{ seconds: 600, max: 30 }]))) throw new BookingError("Too many tries. Please wait a few minutes.", "limited");
  const row = await bookingByToken(z.string().max(80).parse(token));
  if (!row) throw new BookingError("This link doesn't work any more.");
  return row;
}

/** Open times for moving this booking (its own time counts as free). */
export async function rescheduleSlotsAction(token: string): Promise<string[]> {
  try {
    const row = await manageGate(token);
    if (!isActive(row.booking)) return [];
    return (await availableSlots(row.calendar, { excludeBookingId: row.booking.id })).map((d) => d.toISOString());
  } catch {
    return [];
  }
}

export async function rescheduleByTokenAction(token: string, startIso: string, timezone: string): Promise<ActionResult<{ booked: BookedView }> | { ok: false; error: string; code?: string; slots?: string[] }> {
  try {
    const row = await manageGate(token);
    const b = await rescheduleBooking(row.booking.id, z.string().datetime({ offset: true }).parse(startIso), { by: "booker", timezone });
    const url = manageUrl(token);
    return {
      ok: true,
      booked: {
        startAt: b.startAt.toISOString(),
        endAt: b.endAt.toISOString(),
        timezone: b.timezone,
        location: locationText(row.calendar, b),
        confirmationMessage: "",
        manageUrl: url,
        icsUrl: `${url}/invite.ics`,
        googleUrl: googleCalendarUrl({ start: b.startAt, end: b.endAt, title: row.calendar.name, details: `${locationText(row.calendar, b)}\nReschedule or cancel: ${url}`, location: row.calendar.locationValue }),
      },
    };
  } catch (err) {
    const f = fail(err);
    if (f.code === "taken") return { ...f, slots: await rescheduleSlotsAction(token) };
    return f;
  }
}

export async function cancelByTokenAction(token: string, reason: string): Promise<ActionResult> {
  try {
    const row = await manageGate(token);
    await cancelBooking(row.booking.id, { by: "booker", reason: z.string().max(500).parse(reason ?? "") });
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
