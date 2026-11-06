import type { ReactNode } from "react";
import Link from "next/link";
import {
  BellRingIcon,
  CalendarCheck2Icon,
  CalendarClockIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListIcon,
  PlusIcon,
  SquareKanbanIcon,
} from "lucide-react";
import { createStarterCalendarAction } from "@/actions/calendar";
import { cityOf, formatInZone, isValidTimeZone, localDateKey, zoneAbbrev, zonedTimeToUtc } from "@/lib/booking";
import { cn } from "@/lib/utils";
import { bookingUrl, listBookings, listCalendars, WEEKDAYS_9_TO_5, type BookingRow, type Calendar } from "@/server/booking";
import { hasFeature } from "@/server/plans";
import { requireWorkspace } from "@/server/tenancy";
import { BookingsView, type DayGroup, type WeekDay } from "@/components/booking/bookings";
import { CalendarEditor } from "@/components/booking/calendar-editor";
import { BookingLinks, CopyLinkButton, type LinkCalendar } from "@/components/booking/link-card";
import {
  addDays,
  availabilitySummary,
  durationLabel,
  fmtRange,
  fmtTime,
  formatKey,
  gmtOffset,
  hoursSummary,
  isDateKey,
  keyParts,
  LOCATION_LABELS,
  mondayOf,
  weekdayOf,
  type BookingItem,
  type EditorCalendar,
} from "@/components/booking/shared";
import { StarterForm } from "@/components/booking/starter-form";
import { Empty, Flash, IconTile, Locked, NextStep, PageHead, Panel } from "@/components/ui";
import { QuietEmpty } from "@/components/crm-ui";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Calendar" };

const SUB = "Your booking page, like Calendly: people pick a time, and it lands here and in Leads.";
const DAY = 86_400_000;

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** "Add your Zoom link" when a calendar can't tell people where to join yet. */
function missingPlace(c: Calendar) {
  if (c.locationValue.trim()) return null;
  if (c.locationType === "zoom") return "Add your Zoom link";
  if (c.locationType === "google_meet") return "Add your Google Meet link";
  if (c.locationType === "in_person") return "Add your address";
  return null;
}

function toItem(b: BookingRow, now: number, pageTz: string): BookingItem {
  const tz = isValidTimeZone(b.calendarTimezone) ? b.calendarTimezone : "UTC";
  const start = b.startAt;
  const end = b.endAt;
  const zone = zoneAbbrev(start, tz);
  // Where the booker is, when that's a different clock from the calendar's.
  const theirs = isValidTimeZone(b.timezone) && gmtOffset(b.timezone, start.getTime()) !== gmtOffset(tz, start.getTime()) ? b.timezone : null;
  return {
    id: b.id,
    name: b.name,
    email: b.email,
    phone: b.phone,
    status: b.status,
    contactId: b.contactId,
    calendarName: b.calendarName,
    answers: b.answers,
    startMs: start.getTime(),
    past: start.getTime() <= now,
    time: fmtTime(start, tz),
    range: fmtRange(start, end, tz),
    zone,
    otherZone: gmtOffset(tz, start.getTime()) !== gmtOffset(pageTz, start.getTime()),
    shortDay: formatInZone(start, tz, { weekday: "short", month: "short", day: "numeric" }),
    when: `${formatInZone(start, tz, { weekday: "long", month: "long", day: "numeric" })} · ${fmtRange(start, end, tz)} ${zone}`,
    theirTime: theirs ? `${fmtTime(start, theirs)} in ${cityOf(theirs)} (${gmtOffset(theirs, start.getTime())})` : null,
    durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
  };
}

function dayLabel(key: string, today: string) {
  const long = formatKey(key, { weekday: "long", month: "short", day: "numeric" });
  const short = formatKey(key, { weekday: "short", month: "short", day: "numeric" });
  if (key === today) return `Today · ${short}`;
  if (key === addDays(today, 1)) return `Tomorrow · ${short}`;
  if (key === addDays(today, -1)) return `Yesterday · ${short}`;
  return long;
}

function groupByDay(rows: BookingRow[], tz: string, today: string, now: number, newestFirst = false): DayGroup[] {
  const map = new Map<string, BookingItem[]>();
  for (const b of rows) {
    const key = localDateKey(b.startAt, tz);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(toItem(b, now, tz));
  }
  const keys = [...map.keys()].sort();
  if (newestFirst) keys.reverse();
  return keys.map((key) => ({ key, label: dayLabel(key, today), items: map.get(key)! }));
}

function toEditor(c: Calendar): EditorCalendar {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    durationMinutes: c.durationMinutes,
    bufferMinutes: c.bufferMinutes,
    slotIntervalMinutes: c.slotIntervalMinutes,
    minNoticeMinutes: c.minNoticeMinutes,
    maxDaysAhead: c.maxDaysAhead,
    timezone: c.timezone,
    availability: c.availability,
    locationType: c.locationType,
    locationValue: c.locationValue,
    phoneMode: c.phoneMode,
    questions: c.questions,
    confirmationMessage: c.confirmationMessage,
    active: c.active,
  };
}

/** A segmented List | Week switch that keeps your place on the page. */
function ViewSwitch({ items }: { items: { href: string; label: string; active: boolean; icon: typeof ListIcon }[] }) {
  return (
    <nav aria-label="How to show bookings" className="inline-flex items-center gap-0.5 rounded-full bg-muted p-1 ring-1 ring-ink/[0.03] ring-inset dark:ring-white/[0.04]">
      {items.map(({ href, label, active, icon: Icon }) => (
        <Link
          key={label}
          href={href}
          scroll={false}
          aria-current={active ? "page" : undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground no-underline transition-[color,background-color,box-shadow] duration-150 ease-swift hover:text-foreground",
            active && "bg-card text-foreground shadow-[0_1px_2px_rgb(var(--shadow-color)/0.08),0_2px_8px_-2px_rgb(var(--shadow-color)/0.08)] dark:bg-white/[0.09] dark:shadow-none",
          )}
        >
          <Icon className={cn("size-3.5", active && "text-primary dark:text-violet-300")} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

const WHAT_YOU_GET: { icon: typeof ListIcon; title: string; body: ReactNode }[] = [
  { icon: CalendarDaysIcon, title: "A page like Calendly", body: "People see your open times in their own time zone and pick one. No back-and-forth." },
  { icon: SquareKanbanIcon, title: "Straight into your CRM", body: "They land in Leads, tagged booked-call, and move to Call booked on your Pipeline." },
  { icon: BellRingIcon, title: "Reminders send themselves", body: "A confirmation with a calendar invite, then reminders 24 hours and 1 hour before." },
];

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<SP> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace, role } = await requireWorkspace(wid);
  const base = `/app/w/${wid}/calendar`;

  if (!hasFeature(workspace.plan, "calendar")) {
    return (
      <>
        <PageHead eyebrow="Talk" title="Calendar" sub={SUB} />
        <Locked feature="The booking calendar" wid={wid} />
      </>
    );
  }

  const cals = await listCalendars(wid);
  const canEdit = role === "owner" || role === "admin";

  // ---- First visit: one button makes a ready booking page -----------------
  if (!cals.length) {
    return (
      <>
        <PageHead eyebrow="Talk" title="Calendar" sub={SUB} first={canEdit ? "Press the button below. Your booking page is ready in a second." : undefined} />
        <Flash searchParams={sp} />
        {canEdit ? (
          <NextStep
            data-guide="calendar-start"
            eyebrow="Start here"
            title="Get your booking page"
            body="You get a 30-minute intro call, open weekdays 9 to 5 in your time zone. Confirmations and reminders go out on their own."
            icon={CalendarCheck2Icon}
          >
            <StarterForm action={createStarterCalendarAction.bind(null, wid)} />
          </NextStep>
        ) : (
          <Empty icon={CalendarClockIcon} title="No booking page yet" body="Ask the owner of this account to set one up. It takes one click." />
        )}
        <section aria-label="What you get" className="grid gap-3 @2xl/main:grid-cols-3">
          {WHAT_YOU_GET.map((x) => (
            <div key={x.title} className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
              <IconTile icon={x.icon} />
              <div className="grid gap-1">
                <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{x.title}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{x.body}</p>
              </div>
            </div>
          ))}
        </section>
      </>
    );
  }

  // ---- With calendars ------------------------------------------------------
  const now = Date.now();
  const tz = isValidTimeZone(cals[0].timezone) ? cals[0].timezone : "UTC";
  const today = localDateKey(now, tz);
  const view = str(sp.view) === "week" ? "week" : "list";
  const cParam = str(sp.c);
  const editing = cParam === "new" ? null : (cals.find((c) => c.id === cParam) ?? cals[0]);
  const linkBase = bookingUrl(workspace.slug, "");
  const keep = (q: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (cParam) p.set("c", cParam);
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  const [nextUp, anyEver] = await Promise.all([
    listBookings(wid, { from: new Date(now), statuses: ["confirmed", "rescheduled"], limit: 1 }),
    listBookings(wid, { limit: 1, order: "desc" }),
  ]);

  // List: everything from a week ago on. Week: Monday to Sunday in the owner's zone.
  let listData: { upcoming: DayGroup[]; past: DayGroup[] } | null = null;
  let weekData: { days: WeekDay[]; key: string; label: string; count: number } | null = null;
  if (view === "list") {
    const rows = await listBookings(wid, { from: new Date(now - 7 * DAY), order: "asc", limit: 400 });
    const upcoming = rows.filter((b) => b.endAt.getTime() > now);
    const past = rows.filter((b) => b.endAt.getTime() <= now && b.status !== "cancelled");
    listData = { upcoming: groupByDay(upcoming, tz, today, now), past: groupByDay(past, tz, today, now, true) };
  } else {
    const wk = mondayOf(isDateKey(str(sp.week)) ? str(sp.week)! : today);
    const at = (key: string) => {
      const { y, m, d } = keyParts(key);
      return zonedTimeToUtc(y, m, d, 0, tz) ?? new Date(Date.UTC(y, m - 1, d));
    };
    const rows = await listBookings(wid, { from: at(wk), to: at(addDays(wk, 7)), order: "asc", limit: 500 });
    const rules = cals[0].availability;
    const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
      const key = addDays(wk, i);
      return {
        key,
        weekday: formatKey(key, { weekday: "short" }),
        dayNum: String(keyParts(key).d),
        longLabel: formatKey(key, { weekday: "long", month: "long", day: "numeric" }),
        isToday: key === today,
        hours: hoursSummary(rules, weekdayOf(key)),
        items: rows.filter((b) => localDateKey(b.startAt, tz) === key).map((b) => toItem(b, now, tz)),
      };
    });
    const end = addDays(wk, 6);
    const sameMonth = wk.slice(0, 7) === end.slice(0, 7);
    const label = `${formatKey(wk, { month: "short", day: "numeric" })} – ${sameMonth ? keyParts(end).d : formatKey(end, { month: "short", day: "numeric" })}, ${keyParts(end).y}`;
    weekData = { days, key: wk, label, count: rows.filter((b) => b.status !== "cancelled").length };
  }

  const firstMissing = cals.filter((c) => c.active).map(missingPlace).find(Boolean) ?? null;
  const first = firstMissing
    ? `${firstMissing}, then copy your booking link and put it in your Skool About page.`
    : anyEver.length === 0
      ? "Copy your booking link and put it in your Skool About page."
      : "Check who's booked next. After each call, mark anyone who didn't show up.";

  const next = nextUp[0] ? toItem(nextUp[0], now, tz) : null;
  const nextLine = next
    ? `Next up: ${next.name || next.email}, ${localDateKey(next.startMs, tz) === today ? "today" : localDateKey(next.startMs, tz) === addDays(today, 1) ? "tomorrow" : next.shortDay} at ${next.time}.`
    : "Upcoming calls, plus the last 7 days so you can mark no-shows.";

  const links: LinkCalendar[] = cals.map((c) => ({
    id: c.id,
    name: c.name,
    url: bookingUrl(workspace.slug, c.slug),
    active: c.active,
    meta: `${durationLabel(c.durationMinutes)} · ${LOCATION_LABELS[c.locationType]} · ${availabilitySummary(c.availability)}`,
    missing: missingPlace(c),
    editHref: `${base}?c=${c.id}#where`,
  }));

  const newDefaults: EditorCalendar = {
    id: null,
    name: "",
    slug: "",
    description: "",
    durationMinutes: 30,
    bufferMinutes: 0,
    slotIntervalMinutes: 0,
    minNoticeMinutes: 240,
    maxDaysAhead: 30,
    timezone: tz,
    availability: cals[0].availability.length ? cals[0].availability : WEEKDAYS_9_TO_5,
    // Most people reuse the same meeting room, so start from the first calendar's.
    locationType: cals[0].locationType,
    locationValue: cals[0].locationValue,
    phoneMode: "optional",
    questions: [],
    confirmationMessage: "",
    active: true,
  };

  const zoneNote = `Times in ${cityOf(tz)} time (${zoneAbbrev(new Date(now), tz)}).`;

  return (
    <>
      <PageHead
        eyebrow="Talk"
        title="Calendar"
        sub={SUB}
        first={first}
        actions={
          canEdit ? (
            <Button variant="outline" asChild>
              <Link href={`${base}?c=new#settings`}>
                <PlusIcon data-icon="inline-start" />
                New calendar
              </Link>
            </Button>
          ) : null
        }
      />
      <Flash searchParams={sp} />

      <BookingLinks wid={wid} calendars={links} canEdit={canEdit} allUrl={cals.length > 1 ? linkBase.replace(/\/$/, "") : null} />

      <Panel
        id="bookings"
        icon={CalendarClockIcon}
        title="Bookings"
        sub={nextLine}
        className="scroll-mt-20"
        action={
          <ViewSwitch
            items={[
              { href: keep({}), label: "List", active: view === "list", icon: ListIcon },
              { href: keep({ view: "week" }), label: "Week", active: view === "week", icon: CalendarDaysIcon },
            ]}
          />
        }
      >
        {listData ? (
          listData.upcoming.length === 0 && listData.past.length === 0 ? (
            <Empty
              icon={CalendarClockIcon}
              title="No bookings yet"
              body="Share your link in your Skool About page, your welcome email and your DMs. When someone books, they show up here and in Leads."
              action={<CopyLinkButton text={links[0].url} variant="secondary" size="default" label="Copy your link" />}
            />
          ) : (
            <>
              {listData.upcoming.length === 0 ? (
                <QuietEmpty
                  icon={CalendarClockIcon}
                  tone="primary"
                  title="Nothing coming up yet"
                  body="Share your link again: a quick post in your community usually does it."
                  action={<CopyLinkButton text={links[0].url} variant="outline" size="sm" />}
                />
              ) : (
                <p className="-mt-1 text-[12.5px] text-subtle-foreground">{zoneNote}</p>
              )}
              <BookingsView wid={wid} mode="list" upcoming={listData.upcoming} past={listData.past} />
            </>
          )
        ) : weekData ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-1">
                <Button asChild variant="outline" size="icon-sm">
                  <Link href={keep({ view: "week", week: addDays(weekData.key, -7) })} scroll={false} aria-label="Previous week">
                    <ChevronLeftIcon />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="icon-sm">
                  <Link href={keep({ view: "week", week: addDays(weekData.key, 7) })} scroll={false} aria-label="Next week">
                    <ChevronRightIcon />
                  </Link>
                </Button>
              </div>
              <h3 className="text-[15px] font-semibold tracking-[-0.01em] tabular-nums">{weekData.label}</h3>
              {weekData.key !== mondayOf(today) ? (
                <Button asChild variant="ghost" size="sm" className="text-primary dark:text-violet-300">
                  <Link href={keep({ view: "week" })} scroll={false}>
                    Back to this week
                  </Link>
                </Button>
              ) : null}
              <span className="text-[12.5px] text-subtle-foreground sm:ml-auto">
                {weekData.count} {weekData.count === 1 ? "call" : "calls"} · {zoneNote}
              </span>
            </div>
            <BookingsView wid={wid} mode="week" days={weekData.days} />
          </>
        ) : null}
      </Panel>

      {canEdit ? (
        <CalendarEditor
          key={editing?.id ?? "new"}
          wid={wid}
          calendar={editing ? toEditor(editing) : newDefaults}
          linkBase={linkBase}
          calendars={cals.map((c) => ({ id: c.id, name: c.name }))}
          now={now}
        />
      ) : (
        <p className="text-center text-[13px] text-muted-foreground">Only the owner and admins can change the booking page settings.</p>
      )}
    </>
  );
}
