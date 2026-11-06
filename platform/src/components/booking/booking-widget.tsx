"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarCheck2Icon,
  CalendarPlusIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  MapPinIcon,
  PencilIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react";
import { bookAction, publicSlotsAction, type BookedView } from "@/actions/calendar";
import { canonicalZone, isValidTimeZone, localDateKey, longDate } from "@/lib/booking";
import { nextWithName, type BookingPrefill } from "@/lib/bookingEmbed";
import { isEmail } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { SlotPicker } from "./slot-picker";
import { LocationText } from "./location-text";
import { hostFrame, revealHostFrame } from "./embed-frame";
import { fmtRange, pathOf, PLACE_ICON, zoneLine, type WidgetCalendar } from "./shared";

type Step = "pick" | "form" | "done";
type Errors = { name?: string; email?: string; phone?: string; q?: Record<string, string> };

/**
 * After a booking made inside a frame: tells the host page (only one on this same site receives it;
 * the ScaleitAds /apply page fires its Meta Pixel "Schedule" event), then, with a `path`, goes there:
 * in the top window when that is this same site, else in this frame.
 */
function afterBooking(path: string | null) {
  const framed = Boolean(hostFrame()) || window.parent !== window;
  if (framed) {
    try {
      window.parent.postMessage({ type: "onex:booking-confirmed" }, window.location.origin);
    } catch {}
  }
  if (!path) return;
  const url = new URL(path, window.location.origin).href;
  // A moment for the host page's pixel to go out before the page changes.
  window.setTimeout(
    () => {
      try {
        if (window.top && window.top !== window && window.top.location.origin === window.location.origin) return window.top.location.assign(url);
      } catch {}
      window.location.assign(url);
    },
    framed ? 600 : 150,
  );
}

/**
 * The public booking flow, like Calendly: pick a day, pick a time, leave your details, done.
 * Times show in the visitor's own zone (detected, and changeable). The server re-checks every slot.
 * prefill fills the details form; embed is the chrome-light layout for an iframe on the same site;
 * next (a same-site path, already checked by the page) is where the visitor goes once booked.
 */
export function BookingWidget({
  calendar,
  slots: initialSlots,
  now: serverNow,
  aside,
  prefill,
  next = null,
  embed = false,
}: {
  calendar: WidgetCalendar;
  slots: string[];
  now: number;
  aside: ReactNode;
  prefill?: BookingPrefill;
  next?: string | null;
  embed?: boolean;
}) {
  const ids = useId();
  const [tz, setTz] = useState(calendar.timezone);
  const [detected, setDetected] = useState<string | null>(null);
  const [now, setNow] = useState(serverNow);
  const [slots, setSlots] = useState(initialSlots);
  const [picked, setPicked] = useState<string | null>(null);
  /** The last time they chose, so the picker reopens on that day. */
  const [lastPicked, setLastPicked] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [notice, setNotice] = useState<string | null>(null);
  const [values, setValues] = useState({ name: prefill?.name ?? "", email: prefill?.email ?? "", phone: prefill?.phone ?? "", website: "" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [booked, setBooked] = useState<BookedView | null>(null);
  const [pending, start] = useTransition();
  const card = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // The visitor's own zone, once we're in their browser.
  useEffect(() => {
    const d = canonicalZone(Intl.DateTimeFormat().resolvedOptions().timeZone, "");
    if (isValidTimeZone(d)) {
      setDetected(d);
      setTz(d);
    }
    setNow(Date.now());
  }, []);

  // Each new step starts at its top, with focus on its heading for screen readers. Embedded, the
  // frame grows and shrinks with the step, so the host page scrolls back to the frame's top instead.
  useEffect(() => {
    if (step === "pick" && !notice) return;
    const el = card.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
    heading.current?.focus({ preventScroll: true });
    if (embed) {
      const t = window.setTimeout(revealHostFrame, 80);
      return () => window.clearTimeout(t);
    }
  }, [step, notice, embed]);

  const phoneMode = calendar.phoneMode;
  const start_ = picked ? new Date(picked) : null;
  const end_ = start_ ? new Date(start_.getTime() + calendar.durationMinutes * 60_000) : null;

  function choose(iso: string) {
    setPicked(iso);
    setLastPicked(iso);
    setNotice(null);
    setServerError(null);
    setStep("form");
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!values.name.trim()) e.name = "Add your name.";
    if (!isEmail(values.email.trim())) e.email = values.email.trim() ? "That email doesn't look right." : "Add your email, so we can send the invite.";
    if (phoneMode === "required" && values.phone.replace(/\D/g, "").length < 6) e.phone = "Add a phone number we can reach you on.";
    const q: Record<string, string> = {};
    for (const x of calendar.questions) if (x.required && !(answers[x.id] ?? "").trim()) q[x.id] = "Please answer this one.";
    if (Object.keys(q).length) e.q = q;
    return e;
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!picked) return setStep("pick");
    const found = validate();
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`#${CSS.escape(ids)}-form [aria-invalid=true]`)?.focus());
      return;
    }
    start(async () => {
      try {
        const res = await bookAction(calendar.workspaceSlug, calendar.slug, {
          startAt: picked,
          name: values.name.trim(),
          email: values.email.trim(),
          phone: phoneMode === "off" ? "" : values.phone.trim(),
          timezone: tz,
          answers,
          honeypot: values.website,
        });
        if (res.ok) {
          setBooked(res.booked);
          setStep("done");
          afterBooking(next ? nextWithName(next, values.name.trim()) : null);
          return;
        }
        if (res.code === "taken") {
          const fresh = "slots" in res && Array.isArray(res.slots) ? res.slots : await publicSlotsAction(calendar.workspaceSlug, calendar.slug);
          setSlots(fresh);
          setPicked(null);
          setNotice("Someone else just booked it. Here's what's still free.");
          setStep("pick");
          return;
        }
        const msg = res.error;
        if (/your name/i.test(msg)) setErrors({ name: msg });
        else if (/email/i.test(msg)) setErrors({ email: msg });
        else if (/phone/i.test(msg)) setErrors({ phone: msg });
        else {
          const q = calendar.questions.find((x) => msg.includes(x.label));
          if (q) setErrors({ q: { [q.id]: "Please answer this one." } });
          else setServerError(msg);
        }
      } catch {
        setServerError("We couldn't reach the booking page. Check your connection and try again.");
      }
    });
  }

  if (step === "done" && booked) {
    return <Booked booked={booked} calendar={calendar} email={values.email.trim()} embed={embed} leaving={Boolean(next)} />;
  }

  return (
    <div
      ref={card}
      className={cn(
        "w-full",
        embed
          ? "bg-transparent"
          : "scroll-mt-6 overflow-hidden rounded-3xl bg-card shadow-float ring-1 ring-ink/[0.06] md:grid md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] dark:ring-white/[0.08]",
      )}
    >
      {/* Embedded, the host page already says who and what (the ScaleitAds card: "45 minutes with me"). */}
      {embed ? null : <aside className="flex flex-col gap-5 border-b border-border/80 bg-background/40 p-6 md:border-r md:border-b-0 md:p-8 dark:bg-white/[0.01]">{aside}</aside>}

      <div className={cn("min-w-0", embed ? "p-0" : "p-5 sm:p-6 md:p-8")}>
        {step === "pick" ? (
          <div key="pick" className={cn("flex flex-col duration-200 animate-in fade-in-0", embed ? "gap-4" : "gap-6")}>
            <div className="grid gap-1">
              <h2 ref={heading} tabIndex={-1} className={cn("text-[19px] leading-snug font-semibold tracking-[-0.015em] outline-none", embed && "sr-only")}>
                Pick a time
              </h2>
              <p className="text-[13.5px] text-muted-foreground">Times are in {zoneLine(tz, now)}.</p>
            </div>
            {notice ? (
              <p role="alert" className="rounded-xl bg-warning-soft px-4 py-3 text-[13.5px] text-foreground ring-1 ring-warning/15 ring-inset">
                <b className="font-semibold text-warning">That time&apos;s gone.</b> {notice}
              </p>
            ) : null}
            <SlotPicker
              slots={slots}
              tz={tz}
              onTzChange={setTz}
              now={now}
              detected={detected}
              maxDaysAhead={calendar.maxDaysAhead}
              picked={picked}
              day={lastPicked ? localDateKey(new Date(lastPicked), tz) : null}
              onPick={choose}
              durationMinutes={calendar.durationMinutes}
            />
          </div>
        ) : (
          <form key="form" id={`${ids}-form`} onSubmit={submit} noValidate className={cn("flex flex-col duration-200 animate-in fade-in-0 slide-in-from-bottom-1", embed ? "gap-5" : "mx-auto max-w-[520px] gap-6 md:mx-0")}>
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" size="icon-sm" className="-ml-2 text-muted-foreground" onClick={() => setStep("pick")} aria-label="Back to times">
                <ArrowLeftIcon />
              </Button>
              <h2 ref={heading} tabIndex={-1} className="text-[19px] leading-snug font-semibold tracking-[-0.015em] outline-none">
                Your details
              </h2>
            </div>

            {start_ && end_ ? (
              <div className="flex items-start gap-3.5 rounded-2xl bg-accent px-4 py-3.5 ring-1 ring-violet-200/70 ring-inset sm:items-center dark:ring-white/[0.06]">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-primary shadow-xs ring-1 ring-ink/[0.05] max-sm:hidden dark:bg-white/[0.06] dark:text-violet-300 dark:ring-white/[0.06]">
                  <CalendarCheck2Icon className="size-[18px]" aria-hidden />
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-[14.5px] font-semibold tracking-[-0.01em] text-foreground">{longDate(start_, tz).replace(/, \d{4}$/, "")}</span>
                  <span className="text-[13px] text-accent-foreground tabular-nums">
                    {fmtRange(start_, end_, tz)} <span className="whitespace-nowrap">· {zoneLine(tz, start_.getTime())}</span>
                  </span>
                </div>
                <Button type="button" variant="ghost" size="sm" className="-mr-1.5 shrink-0 text-accent-foreground hover:bg-card/70 max-sm:-mt-1 max-sm:h-7 max-sm:px-2.5" onClick={() => setStep("pick")}>
                  <PencilIcon data-icon="inline-start" className="max-sm:hidden" />
                  Change
                </Button>
              </div>
            ) : null}

            {serverError ? (
              <p role="alert" className="rounded-xl bg-destructive-soft px-4 py-3 text-[13.5px] text-destructive">
                {serverError}
              </p>
            ) : null}

            {/* Bots fill every field; people never see this one. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="hidden"
              value={values.website}
              onChange={(e) => setValues((v) => ({ ...v, website: e.target.value }))}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!errors.name || undefined}>
                <FieldLabel htmlFor={`${ids}-name`}>Your name</FieldLabel>
                <Input
                  id={`${ids}-name`}
                  name="name"
                  autoComplete="name"
                  value={values.name}
                  maxLength={120}
                  aria-invalid={!!errors.name || undefined}
                  onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                  className="h-11"
                />
                {errors.name ? <Err>{errors.name}</Err> : null}
              </Field>
              <Field data-invalid={!!errors.email || undefined}>
                <FieldLabel htmlFor={`${ids}-email`}>Email</FieldLabel>
                <Input
                  id={`${ids}-email`}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={values.email}
                  maxLength={200}
                  aria-invalid={!!errors.email || undefined}
                  onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                  className="h-11"
                />
                {errors.email ? <Err>{errors.email}</Err> : null}
              </Field>
            </div>

            {phoneMode !== "off" ? (
              <Field data-invalid={!!errors.phone || undefined}>
                <FieldLabel htmlFor={`${ids}-phone`}>
                  Phone {phoneMode === "optional" ? <span className="font-normal text-subtle-foreground">(optional)</span> : null}
                </FieldLabel>
                <Input
                  id={`${ids}-phone`}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={values.phone}
                  maxLength={40}
                  placeholder="+1 555 010 2030"
                  aria-invalid={!!errors.phone || undefined}
                  onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
                  className="h-11"
                />
                {errors.phone ? (
                  <Err>{errors.phone}</Err>
                ) : (
                  <FieldDescription>{calendar.locationType === "phone" ? `${calendar.host} will call you on this number.` : "For a text reminder before the call."}</FieldDescription>
                )}
              </Field>
            ) : null}

            {calendar.questions.map((q) => {
              const err = errors.q?.[q.id];
              const id = `${ids}-q-${q.id}`;
              const common = {
                id,
                value: answers[q.id] ?? "",
                maxLength: 2000,
                "aria-invalid": !!err || undefined,
                onChange: (e: { target: { value: string } }) => setAnswers((a) => ({ ...a, [q.id]: e.target.value })),
              };
              return (
                <Field key={q.id} data-invalid={!!err || undefined}>
                  <FieldLabel htmlFor={id} className="leading-snug">
                    <span>
                      {q.label} {q.required ? null : <span className="font-normal text-subtle-foreground">(optional)</span>}
                    </span>
                  </FieldLabel>
                  {q.type === "long" ? <Textarea {...common} className="min-h-24" /> : <Input {...common} className="h-11" />}
                  {err ? <Err>{err}</Err> : null}
                </Field>
              );
            })}

            <div className="flex flex-col gap-3 pt-1">
              <Button type="submit" variant="cta" size="lg" disabled={pending} className="w-full sm:w-auto sm:self-start">
                {pending ? <Spinner data-icon="inline-start" /> : null}
                {pending ? "Booking…" : "Confirm booking"}
                {pending ? null : <ArrowRightIcon data-icon="inline-end" />}
              </Button>
              <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
                <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                <span>You&apos;ll get an email with the invite, and a link to reschedule or cancel if plans change.</span>
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Err({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-[13px] leading-snug text-destructive">
      {children}
    </p>
  );
}

/**
 * The tick, the time, the place, and the three things people want next. leaving: the page is about
 * to move on (?next=), so it says so; the details and the manage link stay in case it can't.
 */
function Booked({ booked, calendar, email, embed = false, leaving = false }: { booked: BookedView; calendar: WidgetCalendar; email: string; embed?: boolean; leaving?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (embed) revealHostFrame();
  }, [embed]);
  const start = new Date(booked.startAt);
  const end = new Date(booked.endAt);
  const tz = isValidTimeZone(booked.timezone) ? booked.timezone : calendar.timezone;
  return (
    <div
      className={cn(
        "w-full overflow-hidden bg-card duration-250 animate-in fade-in-0 zoom-in-[0.98]",
        embed ? "rounded-2xl ring-1 ring-ink/[0.06]" : "max-w-[600px] rounded-3xl shadow-float ring-1 ring-ink/[0.06] dark:ring-white/[0.08]",
      )}
    >
      <div className="relative isolate flex flex-col items-center gap-4 px-6 pt-10 pb-7 text-center md:px-10">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,var(--success-soft),transparent_75%)] dark:bg-[radial-gradient(60%_100%_at_50%_0%,rgb(79_209_161/0.10),transparent_75%)]" />
        <span className="grid size-16 place-items-center rounded-full bg-success-soft text-success ring-8 ring-success/[0.07]">
          <CheckIcon className="size-8" strokeWidth={2.5} aria-hidden />
        </span>
        <h1 ref={heading} tabIndex={-1} className="text-[38px] leading-[1.02] tracking-[-0.012em] outline-none md:text-[44px]">
          You&apos;re booked
        </h1>
        <p className="max-w-[42ch] text-[15px] leading-relaxed text-muted-foreground">
          {calendar.name} with {calendar.host}. {email ? <>The invite is on its way to <span className="font-medium text-foreground">{email}</span>.</> : null}
        </p>
        {leaving ? (
          <p role="status" className="inline-flex items-center gap-2 text-[13.5px] font-medium text-foreground">
            <Spinner aria-hidden />
            Taking you to the next step…
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-6 border-t border-border/80 bg-background/40 px-6 py-7 md:px-10 dark:bg-white/[0.01]">
        <dl className="grid gap-4 rounded-2xl bg-card p-5 shadow-xs ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
          <Detail icon={ClockIcon} label="When">
            <span className="font-semibold">{longDate(start, tz)}</span>
            <span className="text-muted-foreground tabular-nums">
              {fmtRange(start, end, tz)} · {zoneLine(tz, start.getTime())}
            </span>
          </Detail>
          {booked.location ? (
            <Detail icon={PLACE_ICON[calendar.locationType] ?? MapPinIcon} label="Where">
              <LocationText text={booked.location} />
            </Detail>
          ) : null}
        </dl>

        {booked.confirmationMessage ? (
          <figure className="grid gap-2 rounded-2xl bg-accent px-5 py-4 ring-1 ring-violet-200/60 ring-inset dark:ring-white/[0.06]">
            <figcaption className="text-[12px] font-semibold tracking-[0.06em] text-accent-foreground uppercase">A note from {calendar.host}</figcaption>
            <blockquote className="text-[14.5px] leading-relaxed whitespace-pre-line text-foreground/90">{booked.confirmationMessage}</blockquote>
          </figure>
        ) : null}

        <div className="grid gap-2.5 sm:grid-cols-2">
          <Button asChild variant="outline" size="lg" className="text-[14px]">
            <a href={booked.googleUrl} target="_blank" rel="noreferrer">
              <CalendarPlusIcon data-icon="inline-start" />
              Add to Google Calendar
            </a>
          </Button>
          <Button asChild variant="outline" size="lg" className="text-[14px]">
            <a href={pathOf(booked.icsUrl)} download="invite.ics">
              <DownloadIcon data-icon="inline-start" />
              Download invite (.ics)
            </a>
          </Button>
        </div>
        <p className={cn("text-center text-[13.5px] text-muted-foreground")}>
          Plans changed?{" "}
          <a href={pathOf(booked.manageUrl)} className="font-semibold text-link underline-offset-4 hover:underline">
            Reschedule or cancel
          </a>
        </p>
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3.5 text-left">
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
