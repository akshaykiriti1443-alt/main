// Booking calendar time maths, with no libraries: wall-clock times in an IANA time zone to UTC
// (DST-safe), open slots from weekly rules, and calendar invites. Client-safe: the public booking
// page uses the same functions to show times in the visitor's own zone.

export type Rule = { day: number; start: string; end: string };
export type Busy = { start: Date | number; end: Date | number };

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Old names some browsers still report, mapped to today's (so pickers don't list both).
const LEGACY_ZONES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
};

/** A valid zone with its current name, or the fallback. */
export function canonicalZone(tz: unknown, fallback = "UTC"): string {
  if (!isValidTimeZone(tz)) return fallback;
  return LEGACY_ZONES[tz] ?? tz;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
    dtfCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The wall clock in `tz` at this instant. */
export function zonedParts(date: Date | number, tz: string) {
  const parts = partsFormatter(tz).formatToParts(typeof date === "number" ? new Date(date) : date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const hour = Number(get("hour")) % 24;
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), hour, minute: Number(get("minute")), second: Number(get("second")), weekday: WEEKDAYS[get("weekday")] ?? 0 };
}

/** Minutes the zone is ahead of UTC at this instant (New York in winter: -300). */
export function tzOffsetMinutes(date: Date | number, tz: string): number {
  const t = typeof date === "number" ? date : date.getTime();
  const p = zonedParts(t, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(t / 1000) * 1000) / 60_000);
}

/**
 * The instant when the wall clock in `tz` shows y-m-d + minutes. Null when that wall time doesn't
 * exist (the hour skipped when clocks go forward). For the repeated hour in autumn, the first one.
 */
export function zonedTimeToUtc(y: number, m: number, d: number, minutes: number, tz: string): Date | null {
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  // The zone's offset a day either side covers both sides of any DST change near this time.
  const offsets = new Set([tzOffsetMinutes(wall - 86_400_000, tz), tzOffsetMinutes(wall, tz), tzOffsetMinutes(wall + 86_400_000, tz)]);
  const hits = [...offsets]
    .map((off) => wall - off * 60_000)
    .filter((t) => {
      const back = zonedParts(t, tz);
      return back.y === y && back.m === m && back.d === d && back.hour * 60 + back.minute === minutes % 1440;
    })
    .sort((a, b) => a - b);
  return hits.length ? new Date(hits[0]) : null;
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return Math.min(1440, Math.max(0, (h || 0) * 60 + (m || 0)));
};
export const fromMinutes = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** "2026-03-08" for an instant, in `tz`. */
export function localDateKey(date: Date | number, tz: string) {
  const p = zonedParts(date, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export type SlotSettings = {
  rules: Rule[];
  timezone: string;
  durationMinutes: number;
  /** 0 = every duration */
  intervalMinutes?: number;
  bufferMinutes?: number;
  minNoticeMinutes?: number;
  maxDaysAhead?: number;
};

/**
 * Every bookable start time, as UTC instants. Days are walked in the calendar's own zone and start
 * times step in wall-clock minutes, so 9:00 stays 9:00 across a DST change. A slot is open when it
 * fits its window, respects the notice, and [start, end + buffer) misses every busy range.
 */
export function generateSlots(s: SlotSettings, busy: Busy[], now: Date = new Date()): Date[] {
  const tz = isValidTimeZone(s.timezone) ? s.timezone : "UTC";
  const duration = Math.max(5, Math.round(s.durationMinutes));
  const step = Math.max(5, Math.round(s.intervalMinutes || duration));
  const buffer = Math.max(0, Math.round(s.bufferMinutes ?? 0));
  const earliest = now.getTime() + Math.max(0, s.minNoticeMinutes ?? 0) * 60_000;
  const days = Math.max(1, Math.min(365, s.maxDaysAhead ?? 30));
  const ranges = busy.map((b) => [+b.start, +b.end] as const);
  const today = zonedParts(now, tz);
  const out = new Map<number, Date>();
  for (let i = 0; i < days; i++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const [y, m, d, weekday] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), day.getUTCDay()];
    for (const rule of s.rules) {
      if (rule.day !== weekday) continue;
      const from = toMinutes(rule.start);
      const to = toMinutes(rule.end);
      for (let mins = from; mins + duration <= to; mins += step) {
        const start = zonedTimeToUtc(y, m, d, mins, tz);
        if (!start) continue;
        const t = start.getTime();
        if (t < earliest) continue;
        const blockedEnd = t + (duration + buffer) * 60_000;
        if (ranges.some(([bs, be]) => t < be && bs < blockedEnd)) continue;
        out.set(t, start);
      }
    }
  }
  return [...out.values()].sort((a, b) => a.getTime() - b.getTime());
}

/** Slots grouped by the visitor's local date: { "2026-11-10": [Date, ...] }. */
export function groupByLocalDate(slots: (Date | string)[], tz: string) {
  const out: Record<string, Date[]> = {};
  for (const s of slots) {
    const d = typeof s === "string" ? new Date(s) : s;
    (out[localDateKey(d, tz)] ??= []).push(d);
  }
  return out;
}

export function formatInZone(date: Date | number, tz: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(typeof date === "number" ? new Date(date) : date);
}

/** "Tuesday, November 10, 2026" */
export const longDate = (d: Date, tz: string) => formatInZone(d, tz, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
/** "2:00 PM" */
export const shortTime = (d: Date, tz: string) => formatInZone(d, tz, { hour: "numeric", minute: "2-digit" });
/** "GMT+1", "EST" */
export const zoneAbbrev = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? tz;

/** "Tuesday, November 10, 2026 · 2:00 – 2:30 PM (EST)" */
export function whenLine(start: Date, end: Date, tz: string) {
  return `${longDate(start, tz)} · ${shortTime(start, tz)} – ${shortTime(end, tz)} (${zoneAbbrev(start, tz)})`;
}

/** "Europe/London" -> "London", "America/Argentina/Buenos_Aires" -> "Buenos Aires" */
export const cityOf = (tz: string) => canonicalZone(tz, tz).split("/").pop()!.replace(/_/g, " ");

// ---------------------------------------------------------------------------
// Calendar invites
// ---------------------------------------------------------------------------

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets continue on the next line after a space (RFC 5545). */
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (curBytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export type InviteInput = {
  uid: string;
  sequence: number;
  start: Date;
  end: Date;
  title: string;
  description?: string;
  location?: string;
  organizer?: { name: string; email: string };
  attendee?: { name: string; email: string };
  method?: "REQUEST" | "CANCEL" | "PUBLISH";
  stamp?: Date;
};

export function buildIcs(e: InviteInput): string {
  const method = e.method ?? "REQUEST";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OneX//Booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${icsDate(e.stamp ?? new Date())}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(e.end)}`,
    `SUMMARY:${icsText(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.organizer ? [`ORGANIZER;CN=${icsText(e.organizer.name).replace(/:/g, "")}:mailto:${e.organizer.email}`] : []),
    ...(e.attendee ? [`ATTENDEE;CN=${icsText(e.attendee.name || e.attendee.email).replace(/:/g, "")};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${e.attendee.email}`] : []),
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    ...(method === "CANCEL"
      ? []
      : ["BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.title)}`, "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** An "add to Google Calendar" link. */
export function googleCalendarUrl(e: { start: Date; end: Date; title: string; details?: string; location?: string }) {
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${icsDate(e.start)}/${icsDate(e.end)}` });
  if (e.details) q.set("details", e.details.slice(0, 1500));
  if (e.location) q.set("location", e.location.slice(0, 500));
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** A short list of zones for the picker, plus whatever the visitor's browser says they're in. */
export const COMMON_ZONES = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/New_York",
  "America/Halifax",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/Mexico_City",
  "America/Bogota",
  "America/Toronto",
  "America/Vancouver",
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Athens",
  "Europe/Istanbul",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Perth",
  "Australia/Brisbane",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];
