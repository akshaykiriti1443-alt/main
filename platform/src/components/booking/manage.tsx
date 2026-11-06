"use client";

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarClockIcon,
  CalendarPlusIcon,
  CalendarXIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  MapPinIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { BookingStatus, CalendarLocation } from "@/lib/db/schema";
import { cancelByTokenAction, rescheduleByTokenAction, rescheduleSlotsAction } from "@/actions/calendar";
import { canonicalZone, isValidTimeZone, localDateKey, longDate } from "@/lib/booking";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { SlotPicker, ZonePicker } from "./slot-picker";
import { LocationText } from "./location-text";
import { fmtRange, PLACE_ICON, zoneLine } from "./shared";

type Mode = "view" | "pick" | "confirm" | "moved" | "cancel";

export type ManageProps = {
  token: string;
  booking: { startAt: string; endAt: string; status: BookingStatus; timezone: string; name: string; email: string; past: boolean };
  calendar: { name: string; durationMinutes: number; maxDaysAhead: number; timezone: string; locationLabel: string; locationType: CalendarLocation };
  host: string;
  /** Only while it's active. */
  location: string | null;
  slots: string[];
  now: number;
  links: { google: string | null; ics: string; bookAgain: string };
};

const STATUS: Record<BookingStatus, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "bg-success-soft text-success" },
  rescheduled: { label: "Confirmed · moved", className: "bg-success-soft text-success" },
  cancelled: { label: "Cancelled", className: "bg-secondary text-muted-foreground" },
  no_show: { label: "Missed", className: "bg-warning-soft text-warning" },
};

/** The booker's private page: their one booking, in their zone, with reschedule and cancel. */
export function ManageBooking({ token, booking, calendar, host, location, slots: initialSlots, now: serverNow, links }: ManageProps) {
  const router = useRouter();
  const ids = useId();
  const [tz, setTz] = useState(isValidTimeZone(booking.timezone) ? booking.timezone : calendar.timezone);
  const [detected, setDetected] = useState<string | null>(null);
  const [now, setNow] = useState(serverNow);
  const [mode, setMode] = useState<Mode>("view");
  const [slots, setSlots] = useState(initialSlots);
  const [picked, setPicked] = useState<string | null>(null);
  const [lastPicked, setLastPicked] = useState<string | null>(null);
  const [moved, setMoved] = useState<{ startAt: string; endAt: string } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const d = canonicalZone(Intl.DateTimeFormat().resolvedOptions().timeZone, "");
    if (isValidTimeZone(d)) setDetected(d);
    setNow(Date.now());
  }, []);
  useEffect(() => setSlots(initialSlots), [initialSlots]);
  useEffect(() => {
    if (mode !== "view") heading.current?.focus({ preventScroll: true });
  }, [mode]);

  const active = booking.status === "confirmed" || booking.status === "rescheduled";
  const canChange = active && !booking.past;
  const startD = new Date(booking.startAt);
  const endD = new Date(booking.endAt);
  const status = booking.past && active ? { label: "Done", className: "bg-secondary text-muted-foreground" } : STATUS[booking.status];

  function go(next: Mode) {
    setError(null);
    setMode(next);
  }

  async function freshSlots() {
    try {
      setSlots(await rescheduleSlotsAction(token));
    } catch {
      /* keep what we have */
    }
  }

  function reschedule() {
    if (!picked) return;
    setError(null);
    start(async () => {
      try {
        const res = await rescheduleByTokenAction(token, picked, tz);
        if (res.ok) {
          setMoved({ startAt: res.booked.startAt, endAt: res.booked.endAt });
          setMode("moved");
          router.refresh();
          return;
        }
        if (res.code === "taken") {
          if ("slots" in res && Array.isArray(res.slots)) setSlots(res.slots);
          else await freshSlots();
          setPicked(null);
          setMode("pick");
          setError("Someone else just booked that time. Pick another one.");
          return;
        }
        setError(res.error);
      } catch {
        setError("We couldn't reach the booking page. Check your connection and try again.");
      }
    });
  }

  function cancel() {
    setError(null);
    start(async () => {
      try {
        const res = await cancelByTokenAction(token, reason.trim());
        if (!res.ok) return setError(res.error);
        toast.success(`Cancelled. We've let ${host} know.`);
        setMode("view");
        router.refresh();
      } catch {
        setError("We couldn't reach the booking page. Check your connection and try again.");
      }
    });
  }

  const wide = mode === "pick";

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-3xl bg-card shadow-float ring-1 ring-ink/[0.06] transition-[max-width] duration-250 ease-soft dark:ring-white/[0.08]",
        wide ? "max-w-[880px]" : "max-w-[580px]",
      )}
    >
      {mode === "moved" && moved ? (
        <div className="flex flex-col items-center gap-4 px-6 py-10 text-center duration-250 animate-in fade-in-0 zoom-in-[0.98] md:px-10">
          <span className="grid size-16 place-items-center rounded-full bg-success-soft text-success ring-8 ring-success/[0.07]">
            <CheckIcon className="size-8" strokeWidth={2.5} aria-hidden />
          </span>
          <h1 ref={heading} tabIndex={-1} className="text-[36px] leading-[1.04] tracking-[-0.012em] outline-none md:text-[42px]">
            Moved. See you then!
          </h1>
          <p className="grid gap-0.5 text-[15px]">
            <span className="font-semibold">{longDate(new Date(moved.startAt), tz)}</span>
            <span className="text-muted-foreground tabular-nums">
              {fmtRange(new Date(moved.startAt), new Date(moved.endAt), tz)} · {zoneLine(tz, Date.parse(moved.startAt))}
            </span>
          </p>
          <p className="max-w-[40ch] text-[13.5px] leading-relaxed text-muted-foreground">We&apos;ve emailed you the updated invite, and let {host} know.</p>
          <Button variant="outline" onClick={() => go("view")}>
            Done
          </Button>
        </div>
      ) : mode === "pick" ? (
        <div className="flex flex-col gap-6 p-5 duration-200 animate-in fade-in-0 sm:p-6 md:p-8">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon-sm" className="-ml-2 shrink-0 text-muted-foreground" onClick={() => go("view")} aria-label="Back to your booking">
              <ArrowLeftIcon />
            </Button>
            <div className="grid gap-1">
              <h1 ref={heading} tabIndex={-1} className="font-sans text-[19px] leading-snug font-semibold tracking-[-0.015em] outline-none">
                Pick a new time
              </h1>
              <p className="text-[13.5px] text-muted-foreground">
                Now: {longDate(startD, tz).replace(/, \d{4}$/, "")}, {fmtRange(startD, endD, tz)}. Your old time stays booked until you confirm.
              </p>
            </div>
          </div>
          {error ? <Alert>{error}</Alert> : null}
          <SlotPicker
            slots={slots}
            tz={tz}
            onTzChange={setTz}
            now={now}
            detected={detected}
            maxDaysAhead={calendar.maxDaysAhead}
            picked={picked}
            current={booking.startAt}
            day={lastPicked ? localDateKey(new Date(lastPicked), tz) : null}
            durationMinutes={calendar.durationMinutes}
            onPick={(iso) => {
              setPicked(iso);
              setLastPicked(iso);
              go("confirm");
            }}
          />
        </div>
      ) : mode === "confirm" && picked ? (
        <div className="flex flex-col gap-6 p-6 duration-200 animate-in fade-in-0 slide-in-from-bottom-1 md:p-9">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon-sm" className="-ml-2 shrink-0 text-muted-foreground" onClick={() => go("pick")} aria-label="Back to times">
              <ArrowLeftIcon />
            </Button>
            <h1 ref={heading} tabIndex={-1} className="pt-0.5 font-sans text-[19px] leading-snug font-semibold tracking-[-0.015em] outline-none">
              Move your call?
            </h1>
          </div>
          <ol className="grid gap-2.5">
            <li className="flex items-center gap-3.5 rounded-2xl bg-muted/50 px-4 py-3.5 dark:bg-white/[0.03]">
              <span className="w-10 shrink-0 text-[11.5px] font-semibold tracking-[0.06em] text-subtle-foreground uppercase">From</span>
              <span className="grid gap-0.5 text-[14px] text-muted-foreground line-through decoration-muted-foreground/50">
                <span>{longDate(startD, tz)}</span>
                <span className="tabular-nums">{fmtRange(startD, endD, tz)}</span>
              </span>
            </li>
            <li className="flex items-center gap-3.5 rounded-2xl bg-accent px-4 py-3.5 ring-1 ring-violet-200/70 ring-inset dark:ring-white/[0.06]">
              <span className="w-10 shrink-0 text-[11.5px] font-semibold tracking-[0.06em] text-accent-foreground uppercase">To</span>
              <span className="grid gap-0.5 text-[14.5px]">
                <span className="font-semibold">{longDate(new Date(picked), tz)}</span>
                <span className="text-accent-foreground tabular-nums">
                  {fmtRange(new Date(picked), new Date(Date.parse(picked) + calendar.durationMinutes * 60_000), tz)} · {zoneLine(tz, Date.parse(picked))}
                </span>
              </span>
            </li>
          </ol>
          {error ? <Alert>{error}</Alert> : null}
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center">
            <Button variant="ghost" onClick={() => go("pick")} disabled={pending}>
              Pick another time
            </Button>
            <Button variant="cta" size="lg" onClick={reschedule} disabled={pending} className="sm:ml-auto">
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {pending ? "Moving it…" : "Move my booking"}
              {pending ? null : <ArrowRightIcon data-icon="inline-end" />}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative isolate flex flex-col items-center gap-3 px-6 pt-9 pb-7 text-center md:px-10">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-36 bg-[radial-gradient(60%_100%_at_50%_0%,var(--accent),transparent_75%)] dark:bg-[radial-gradient(60%_100%_at_50%_0%,rgb(118_85_245/0.10),transparent_75%)]" />
            <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold", status.className)}>
              <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
              {status.label}
            </span>
            <h1 ref={heading} tabIndex={-1} className={cn("text-[36px] leading-[1.04] tracking-[-0.012em] outline-none md:text-[42px]", !active && "text-foreground/80")}>
              {calendar.name}
            </h1>
            <p className="text-[15px] text-muted-foreground">with {host}</p>
          </div>

          <div className="flex flex-col gap-5 border-t border-border/80 px-6 py-6 md:px-10">
            <dl className="grid gap-4">
              <Row icon={ClockIcon} label="When">
                <span className={cn("font-semibold", !active && "text-muted-foreground line-through decoration-muted-foreground/50")}>{longDate(startD, tz)}</span>
                <span className={cn("text-muted-foreground tabular-nums", !active && "line-through decoration-muted-foreground/50")}>
                  {fmtRange(startD, endD, tz)} · {Math.round((endD.getTime() - startD.getTime()) / 60_000)} min
                </span>
              </Row>
              {location ? (
                <Row icon={PLACE_ICON[calendar.locationType] ?? MapPinIcon} label="Where">
                  <LocationText text={location} />
                </Row>
              ) : null}
              <Row icon={UserRoundIcon} label="Booked by">
                <span>
                  {booking.name} <span className="text-muted-foreground">· {booking.email}</span>
                </span>
              </Row>
            </dl>
            <ZonePicker tz={tz} onChange={setTz} now={now} detected={detected} className="rounded-xl bg-muted/40 px-3 py-2.5 dark:bg-white/[0.02]" />
          </div>

          <div className="flex flex-col gap-4 border-t border-border/80 bg-background/50 px-6 py-6 md:px-10 dark:bg-white/[0.01]">
            {mode === "cancel" ? (
              <div className="flex flex-col gap-4 duration-200 animate-in fade-in-0">
                <div className="grid gap-1">
                  <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Cancel this call?</h2>
                  <p className="text-[13.5px] text-muted-foreground">We&apos;ll let {host} know and take it off your calendar.</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${ids}-reason`}>
                    Anything {host} should know? <span className="font-normal text-subtle-foreground">(optional)</span>
                  </Label>
                  <Textarea id={`${ids}-reason`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Something came up at work. I'll book again next week." className="min-h-20 bg-card" />
                </div>
                {error ? <Alert>{error}</Alert> : null}
                <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                  <Button variant="outline" onClick={() => go("view")} disabled={pending}>
                    Keep my booking
                  </Button>
                  <Button variant="destructive" onClick={cancel} disabled={pending}>
                    {pending ? <Spinner data-icon="inline-start" /> : <CalendarXIcon data-icon="inline-start" />}
                    {pending ? "Cancelling…" : "Yes, cancel it"}
                  </Button>
                </div>
              </div>
            ) : canChange ? (
              <>
                {error ? <Alert>{error}</Alert> : null}
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Button
                    size="lg"
                    onClick={() => {
                      setPicked(null);
                      go("pick");
                      void freshSlots();
                    }}
                  >
                    <CalendarClockIcon data-icon="inline-start" />
                    Reschedule
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => go("cancel")}>
                    <CalendarXIcon data-icon="inline-start" />
                    Cancel booking
                  </Button>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px]">
                  {links.google ? (
                    <a href={links.google} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-link underline-offset-4 hover:underline">
                      <CalendarPlusIcon className="size-3.5" aria-hidden />
                      Add to Google Calendar
                    </a>
                  ) : null}
                  <a href={links.ics} download="invite.ics" className="inline-flex items-center gap-1.5 font-medium text-link underline-offset-4 hover:underline">
                    <DownloadIcon className="size-3.5" aria-hidden />
                    Download invite (.ics)
                  </a>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
                  {booking.status === "cancelled"
                    ? "This call is cancelled, and it's off the calendar. Want a new time?"
                    : booking.status === "no_show"
                      ? "This call was missed. No worries: grab a new time whenever suits you."
                      : "This call has already happened. Want another one?"}
                </p>
                <Button asChild variant="cta" size="lg">
                  <a href={links.bookAgain}>
                    Book a new time
                    <ArrowRightIcon data-icon="inline-end" />
                  </a>
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-primary dark:text-violet-300">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="grid min-w-0 gap-0.5 pt-0.5">
        <dt className="sr-only">{label}</dt>
        <dd className="grid gap-0.5 text-[14.5px] leading-snug">{children}</dd>
      </div>
    </div>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-destructive-soft px-4 py-3 text-[13.5px] text-destructive">
      {children}
    </p>
  );
}
