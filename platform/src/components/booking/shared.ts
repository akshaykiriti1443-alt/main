import { GlobeIcon, MapPinIcon, PhoneIcon, VideoIcon, type LucideIcon } from "lucide-react";
import type { AvailabilityRule, BookingQuestion, BookingStatus, CalendarLocation, PhoneMode } from "@/lib/db/schema";
import { cityOf, COMMON_ZONES, isValidTimeZone } from "@/lib/booking";

// Client-safe shapes and helpers for the booking UI. Pages build plain JSON from the server
// (no Dates, nothing server-only) and pre-format every time string, so server and browser render
// exactly the same text.

/** Mirrors LOCATION_LABELS in src/server/booking.ts (a server file, so it's copied, not imported). */
export const LOCATION_LABELS: Record<CalendarLocation, string> = {
  zoom: "Zoom",
  google_meet: "Google Meet",
  phone: "Phone call",
  in_person: "In person",
  custom: "Online",
};

/** What the settings editor edits. id null = a new calendar. */
export type EditorCalendar = {
  id: string | null;
  name: string;
  slug: string;
  description: string;
  durationMinutes: number;
  bufferMinutes: number;
  slotIntervalMinutes: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  timezone: string;
  availability: AvailabilityRule[];
  locationType: CalendarLocation;
  locationValue: string;
  phoneMode: PhoneMode;
  questions: BookingQuestion[];
  confirmationMessage: string;
  active: boolean;
};

/** A calendar's public bits, for the booking widget (never the meeting link). */
export type WidgetCalendar = {
  name: string;
  slug: string;
  workspaceSlug: string;
  host: string;
  durationMinutes: number;
  timezone: string;
  locationType: CalendarLocation;
  locationLabel: string;
  phoneMode: PhoneMode;
  questions: BookingQuestion[];
  maxDaysAhead: number;
  description: string;
};

/** One booking for the owner's list and week views, with every string already formatted. */
export type BookingItem = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: BookingStatus;
  contactId: string | null;
  calendarName: string;
  answers: { label: string; value: string }[];
  /** Epoch ms. */
  startMs: number;
  /** The call has started (server clock at render). */
  past: boolean;
  /** "9:00 AM" in the calendar's zone. */
  time: string;
  /** "9:00 – 9:30 AM" */
  range: string;
  /** "EST" */
  zone: string;
  /** The calendar's zone differs from the page's, so the row says which zone it's in. */
  otherZone: boolean;
  /** "Tue, Nov 10" */
  shortDay: string;
  /** "Tuesday, November 10 · 9:00 – 9:30 AM EST" */
  when: string;
  /** In the booker's own zone when it differs from the calendar's: "2:00 PM in London (GMT)". */
  theirTime: string | null;
  durationMinutes: number;
};

export const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Booked",
  rescheduled: "Moved",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const isActiveStatus = (s: BookingStatus) => s === "confirmed" || s === "rescheduled";

// ---------------------------------------------------------------------------
// Date keys ("2026-11-10") as plain calendar maths, no time zones involved.
// ---------------------------------------------------------------------------

export function keyParts(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}
const keyDate = (key: string) => {
  const { y, m, d } = keyParts(key);
  return new Date(Date.UTC(y, m - 1, d));
};
export const dateKey = (dt: Date) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
export const addDays = (key: string, n: number) => {
  const dt = keyDate(key);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dateKey(dt);
};
/** 0 = Sunday ... 6 = Saturday */
export const weekdayOf = (key: string) => keyDate(key).getUTCDay();
/** The Monday on or before this day. */
export const mondayOf = (key: string) => addDays(key, -((weekdayOf(key) + 6) % 7));
export const isDateKey = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(keyDate(s).getTime());
/** Format a date key without any zone shifting: { weekday: "short", day: "numeric" } -> "Tue 10". */
export const formatKey = (key: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(keyDate(key));
export const monthKey = (key: string) => key.slice(0, 7);

// ---------------------------------------------------------------------------
// Times and zones
// ---------------------------------------------------------------------------

/** "GMT-5", "GMT+5:30", "GMT" */
export function gmtOffset(tz: string, at: number) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date(at)).find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

function offsetMinutes(label: string) {
  const m = label.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** Zones for a picker, west to east, always including the ones passed in. */
export function zoneOptions(at: number, ...extra: (string | null | undefined)[]) {
  const set = new Set<string>(COMMON_ZONES);
  for (const z of extra) if (z && isValidTimeZone(z)) set.add(z);
  return [...set]
    .map((tz) => {
      const off = gmtOffset(tz, at);
      return { value: tz, label: tz === "UTC" ? "UTC" : `${cityOf(tz)} (${off || tz})`, sort: offsetMinutes(off) };
    })
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
}

/** "9:00 AM", "12:30 PM", "Midnight" for "HH:MM" wall times in the editor. */
export function wallLabel(hhmm: string) {
  if (hhmm === "24:00" || hhmm === "00:00") return hhmm === "24:00" ? "Midnight" : "12:00 AM";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "9–5" style summary of one day's hours: "9:00 AM – 5:00 PM", or several joined. */
export function hoursSummary(rules: AvailabilityRule[], day: number) {
  const mine = rules.filter((r) => r.day === day).sort((a, b) => a.start.localeCompare(b.start));
  if (!mine.length) return null;
  if (mine.length === 1 && mine[0].start === "00:00" && mine[0].end === "24:00") return "all day";
  return mine.map((r) => `${compactWall(r.start)}–${compactWall(r.end)}`).join(", ");
}

/** "09:00" -> "9am", "17:30" -> "5:30pm", for small labels. */
export function compactWall(hhmm: string) {
  if (hhmm === "24:00") return "12am";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}${suffix}`;
}

/** "30 min", "1 hr", "1 hr 30 min" */
export function durationLabel(mins: number) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} hr${m ? ` ${m} min` : ""}`;
}

/** "Weekdays, 9am–5pm" when it's that simple, else "5 days a week". */
export function availabilitySummary(rules: AvailabilityRule[]) {
  if (!rules.length) return "No open hours yet";
  const days = [...new Set(rules.map((r) => r.day))].sort();
  const same = days.every((d) => hoursSummary(rules, d) === hoursSummary(rules, days[0]));
  const weekdays = days.length === 5 && days.join() === "1,2,3,4,5";
  const everyDay = days.length === 7;
  if (same && everyDay && hoursSummary(rules, 0) === "all day") return "Any time, any day";
  if (same && (weekdays || everyDay)) return `${weekdays ? "Weekdays" : "Every day"}, ${hoursSummary(rules, days[0])}`;
  return `${days.length} day${days.length === 1 ? "" : "s"} a week`;
}

/** The relative path of an absolute app URL, so links stay on whatever host the page is on. */
export function pathOf(url: string) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/** Placeholder and label per meeting place, for the settings editor. */
export const LOCATION_FIELD: Record<CalendarLocation, { label: string; placeholder: string; help: string }> = {
  zoom: { label: "Your Zoom link", placeholder: "https://zoom.us/j/1234567890", help: "Your personal meeting room link works well. Only people who book see it." },
  google_meet: { label: "Your Google Meet link", placeholder: "https://meet.google.com/abc-defg-hij", help: "Only people who book see it. It goes in their invite." },
  phone: { label: "The number you'll call from (optional)", placeholder: "+1 555 010 2030", help: "We ask every booker for their number, and you call them." },
  in_person: { label: "The address", placeholder: "Studio 4, 12 High Street, London", help: "Only people who book see it." },
  custom: { label: "Where to join", placeholder: "A link, or a short instruction", help: "Only people who book see it." },
};

/** shortTime, with plain spaces (some engines put a narrow no-break space before AM/PM). */
export const fmtTime = (d: Date | number, tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(typeof d === "number" ? new Date(d) : d).replace(/\u202f/g, " ");

/** "2:00 – 2:30 PM", or "11:30 AM – 12:00 PM" across noon. */
export function fmtRange(start: Date | number, end: Date | number, tz: string) {
  const a = fmtTime(start, tz);
  const b = fmtTime(end, tz);
  const [aTime, aSuffix] = a.split(" ");
  const [, bSuffix] = b.split(" ");
  return aSuffix && aSuffix === bSuffix ? `${aTime} – ${b}` : `${a} – ${b}`;
}

/** "London time (GMT+1)" */
export const zoneLine = (tz: string, at: number) => (tz === "UTC" ? "UTC" : `${cityOf(tz)} time (${gmtOffset(tz, at)})`);

export const PLACE_ICON: Record<CalendarLocation, LucideIcon> = {
  zoom: VideoIcon,
  google_meet: VideoIcon,
  phone: PhoneIcon,
  in_person: MapPinIcon,
  custom: GlobeIcon,
};
