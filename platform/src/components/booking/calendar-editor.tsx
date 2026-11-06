"use client";

import { useEffect, useId, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClockIcon,
  GlobeIcon,
  LinkIcon,
  MapPinIcon,
  PhoneIcon,
  PlusIcon,
  Settings2Icon,
  Trash2Icon,
  VideoIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { BookingQuestion, CalendarLocation, PhoneMode } from "@/lib/db/schema";
import type { CalendarInput } from "@/server/booking";
import { deleteCalendarAction, saveCalendarAction, setCalendarActiveAction } from "@/actions/calendar";
import { canonicalZone, isValidTimeZone } from "@/lib/booking";
import { slugify } from "@/lib/util";
import { cn } from "@/lib/utils";
import { IconTile, MoreOptions } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AvailabilityEditor, fromWeek, toWeek, weekErrors, type Week } from "./availability-editor";
import { durationLabel, LOCATION_FIELD, zoneOptions, type EditorCalendar } from "./shared";

type Form = Omit<EditorCalendar, "availability" | "id"> & { week: Week };
type Errors = Partial<Record<"name" | "slug" | "duration" | "location" | "timezone" | "questions" | "hours", string>> & { days?: Record<number, string>; q?: Record<number, string> };

const DURATIONS = [15, 30, 45, 60];
const PLACES: { value: CalendarLocation; label: string; icon: LucideIcon }[] = [
  { value: "zoom", label: "Zoom", icon: VideoIcon },
  { value: "google_meet", label: "Google Meet", icon: VideoIcon },
  { value: "phone", label: "Phone call", icon: PhoneIcon },
  { value: "in_person", label: "In person", icon: MapPinIcon },
  { value: "custom", label: "Somewhere else", icon: LinkIcon },
];
const PHONE_MODES: { value: PhoneMode; label: string }[] = [
  { value: "off", label: "Don't ask" },
  { value: "optional", label: "Optional" },
  { value: "required", label: "Required" },
];
const BUFFERS = [0, 5, 10, 15, 30, 45, 60];
const NOTICE = [0, 60, 120, 240, 720, 1440, 2880, 10080];
const AHEAD = [7, 14, 21, 30, 60, 90, 180];
const MAX_QUESTIONS = 5;

const noticeLabel = (m: number) => (m === 0 ? "None, book any time" : m < 1440 ? `${m / 60} hour${m === 60 ? "" : "s"}` : m % 10080 === 0 ? `${m / 10080} week${m === 10080 ? "" : "s"}` : `${Math.round(m / 1440)} day${m === 1440 ? "" : "s"}`);
const withValue = (list: number[], v: number) => (list.includes(v) ? list : [...list, v].sort((a, b) => a - b));

function toForm(c: EditorCalendar): Form {
  const { availability, id: _id, ...rest } = c;
  return { ...rest, week: toWeek(availability), questions: c.questions.map((q) => ({ ...q })) };
}

function validate(f: Form): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = "Give it a name, like Intro call.";
  if (!slugify(f.slug || f.name, 40)) e.slug = "Use letters and numbers, like intro-call.";
  if (!Number.isInteger(f.durationMinutes) || f.durationMinutes < 5 || f.durationMinutes > 480) e.duration = "Pick a length between 5 minutes and 8 hours.";
  const v = f.locationValue.trim();
  if ((f.locationType === "zoom" || f.locationType === "google_meet") && v && !/^https?:\/\/\S+$/i.test(v)) e.location = "Paste the whole link, starting with https://";
  if (!isValidTimeZone(f.timezone)) e.timezone = "Pick a time zone from the list.";
  const days = weekErrors(f.week);
  if (Object.keys(days).length) e.days = days;
  const q: Record<number, string> = {};
  f.questions.forEach((x, i) => {
    if (!x.label.trim()) q[i] = "Write the question, or remove it.";
  });
  if (Object.keys(q).length) e.q = q;
  return e;
}

const hasErrors = (e: Errors) => Object.keys(e).length > 0;

/** Server messages that belong to one field go next to it; anything else shows by the Save button. */
function placeServerError(msg: string): Errors | null {
  if (/name, like/i.test(msg)) return { name: msg };
  if (/time zone/i.test(msg)) return { timezone: msg };
  if (/range|end after it starts/i.test(msg)) return { hours: msg };
  return null;
}

export function CalendarEditor({
  wid,
  calendar,
  linkBase,
  calendars,
  now,
}: {
  wid: string;
  calendar: EditorCalendar;
  /** "https://app…/b/my-workspace/" */
  linkBase: string;
  /** For the switcher when there are several. */
  calendars: { id: string; name: string }[];
  /** Server clock, for the zone list's offsets. */
  now: number;
}) {
  const router = useRouter();
  const ids = useId();
  const isNew = calendar.id === null;
  const [form, setForm] = useState<Form>(() => toForm(calendar));
  const [baseline, setBaseline] = useState(() => JSON.stringify(toForm(calendar)));
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [customLength, setCustomLength] = useState(!DURATIONS.includes(calendar.durationMinutes));
  const [active, setActive] = useState(calendar.active);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detected, setDetected] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [togglePending, startToggle] = useTransition();

  useEffect(() => {
    const tz = canonicalZone(Intl.DateTimeFormat().resolvedOptions().timeZone, "");
    if (isValidTimeZone(tz)) setDetected(tz);
  }, []);
  // The link card can switch the calendar on or off too: follow it.
  useEffect(() => setActive(calendar.active), [calendar.active]);

  const dirty = JSON.stringify(form) !== baseline;
  const zones = useMemo(() => zoneOptions(now, form.timezone, detected), [now, form.timezone, detected]);
  const place = LOCATION_FIELD[form.locationType];

  function patch(p: Partial<Form>) {
    setForm((f) => ({ ...f, ...p }));
    // Fix-as-you-go: clear the messages for whatever just changed.
    if (hasErrors(errors)) setErrors((e) => (hasErrors(validate({ ...form, ...p })) ? validate({ ...form, ...p }) : {}));
    setServerError(null);
  }

  function setQuestions(qs: BookingQuestion[]) {
    patch({ questions: qs });
  }

  function toggleActive(next: boolean) {
    if (isNew) return patch({ active: next });
    setActive(next);
    startToggle(async () => {
      try {
        const res = await setCalendarActiveAction(wid, calendar.id!, next);
        if (!res.ok) {
          setActive(!next);
          return void toast.error(res.error);
        }
        toast.success(next ? "Taking bookings again" : "Switched off. The page now says it's closed.");
        router.refresh();
      } catch {
        setActive(!next);
        toast.error("We couldn't reach OneX. Check your connection and try again.");
      }
    });
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    setServerError(null);
    if (hasErrors(found)) {
      // Take them to the first problem.
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`#${CSS.escape(ids)}-form [aria-invalid=true]`)?.focus());
      return;
    }
    const input: CalendarInput = {
      name: form.name.trim(),
      slug: slugify(form.slug || form.name, 40),
      description: form.description,
      durationMinutes: form.durationMinutes,
      bufferMinutes: form.bufferMinutes,
      slotIntervalMinutes: form.slotIntervalMinutes,
      minNoticeMinutes: form.minNoticeMinutes,
      maxDaysAhead: form.maxDaysAhead,
      timezone: form.timezone,
      availability: fromWeek(form.week),
      locationType: form.locationType,
      locationValue: form.locationValue.trim(),
      phoneMode: form.locationType === "phone" ? "required" : form.phoneMode,
      questions: form.questions.map((q) => ({ ...q, label: q.label.trim() })),
      confirmationMessage: form.confirmationMessage,
      active: isNew ? form.active : active,
    };
    start(async () => {
      try {
        const res = await saveCalendarAction(wid, calendar.id, input);
        if (!res.ok) {
          const placed = placeServerError(res.error);
          if (placed) setErrors(placed);
          setServerError(res.error);
          return;
        }
        const saved = { ...form, slug: res.slug, name: form.name.trim() };
        setForm(saved);
        setBaseline(JSON.stringify(saved));
        if (isNew) {
          toast.success(`${saved.name} is ready. Copy its link above.`);
          router.replace(`/app/w/${wid}/calendar?c=${res.id}`, { scroll: false });
        } else {
          toast.success(res.slug !== slugify(form.slug || form.name, 40) ? `Saved. That link name was taken, so it's ${res.slug}.` : "Saved. Your booking page is up to date.");
        }
        router.refresh();
      } catch {
        setServerError("We couldn't reach OneX. Check your connection and try again.");
      }
    });
  }

  function remove() {
    if (!calendar.id) return;
    start(async () => {
      try {
        const res = await deleteCalendarAction(wid, calendar.id!);
        if (!res.ok) {
          setConfirmDelete(false);
          setServerError(res.error);
          return;
        }
        toast.success(`${form.name || "Calendar"} deleted`);
        router.replace(`/app/w/${wid}/calendar`, { scroll: false });
        router.refresh();
      } catch {
        setServerError("We couldn't reach OneX. Check your connection and try again.");
      }
    });
  }

  function discard() {
    setForm(JSON.parse(baseline));
    setErrors({});
    setServerError(null);
    setCustomLength(!DURATIONS.includes(JSON.parse(baseline).durationMinutes));
  }

  const slugPreview = slugify(form.slug || form.name, 40) || "your-link";

  return (
    <section id="settings" aria-labelledby={`${ids}-title`} className="scroll-mt-20 rounded-2xl bg-card shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 pt-6 pb-5 md:px-6">
        <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
          <IconTile icon={Settings2Icon} className="-mt-0.5" />
          <div className="grid min-w-0 gap-1">
            <h2 id={`${ids}-title`} className="text-base leading-snug font-semibold tracking-[-0.011em]">
              {isNew ? "New calendar" : "Booking page settings"}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {isNew ? "Another kind of call, with its own link, length and hours. Like a 60-minute strategy session." : "What people see on your booking page, and when they can book. Changes show the moment you save."}
            </p>
          </div>
        </div>
        <label className="flex h-9 cursor-pointer items-center gap-2.5 rounded-full bg-muted/60 py-1 pr-1.5 pl-3.5 text-[13px] font-medium select-none dark:bg-white/[0.04]">
          {(isNew ? form.active : active) ? "Taking bookings" : "Switched off"}
          <Switch checked={isNew ? form.active : active} disabled={togglePending} onCheckedChange={toggleActive} aria-label="Take bookings on this calendar" />
        </label>
      </header>

      {calendars.length > 1 || isNew ? (
        <nav aria-label="Your calendars" className="flex gap-1.5 overflow-x-auto px-5 pb-5 md:px-6">
          {calendars.map((c) => {
            const on = c.id === calendar.id;
            return (
              <Link
                key={c.id}
                href={`/app/w/${wid}/calendar?c=${c.id}#settings`}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap no-underline ring-1 transition-colors duration-150 ease-swift ring-inset",
                  on ? "bg-accent text-accent-foreground ring-violet-200 dark:ring-white/10" : "text-muted-foreground ring-border-strong hover:bg-muted hover:text-foreground dark:ring-white/10",
                )}
              >
                {c.name}
              </Link>
            );
          })}
          <span
            aria-current={isNew ? "page" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap ring-1 ring-inset",
              isNew ? "bg-accent text-accent-foreground ring-violet-200 dark:ring-white/10" : "hidden",
            )}
          >
            <PlusIcon className="size-3.5" aria-hidden />
            New calendar
          </span>
        </nav>
      ) : null}

      <form id={`${ids}-form`} onSubmit={save} noValidate>
        <Section title="The basics" help="The name and the length of the call. This is the first thing people see.">
          <Field data-invalid={!!errors.name || undefined}>
            <FieldLabel htmlFor={`${ids}-name`}>Name</FieldLabel>
            <Input
              id={`${ids}-name`}
              value={form.name}
              maxLength={80}
              placeholder="e.g. Intro call"
              aria-invalid={!!errors.name || undefined}
              onChange={(e) => {
                const name = e.target.value;
                // A new calendar's link follows its name until you edit the link yourself.
                patch(isNew && (!form.slug || form.slug === slugify(form.name, 40)) ? { name, slug: slugify(name, 40) } : { name });
              }}
            />
            {errors.name ? <FieldError>{errors.name}</FieldError> : null}
          </Field>

          <Field data-invalid={!!errors.slug || undefined}>
            <FieldLabel htmlFor={`${ids}-slug`}>Link</FieldLabel>
            <div
              className={cn(
                "flex h-10 min-w-0 items-center overflow-hidden rounded-lg border border-input bg-card shadow-xs transition-[box-shadow,border-color] duration-150 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20 hover:border-border-strong dark:bg-white/[0.03]",
                errors.slug && "border-destructive ring-[3px] ring-destructive/15",
              )}
            >
              <span className="flex h-full max-w-[55%] shrink-0 items-center truncate border-r border-border bg-muted/60 px-3 font-mono text-[12.5px] text-muted-foreground dark:bg-white/[0.03]" title={linkBase}>
                <span className="truncate" dir="rtl">
                  <bdi>{linkBase.replace(/^https?:\/\//, "")}</bdi>
                </span>
              </span>
              <input
                id={`${ids}-slug`}
                value={form.slug}
                maxLength={40}
                placeholder={slugify(form.name, 40) || "intro-call"}
                aria-invalid={!!errors.slug || undefined}
                onChange={(e) => patch({ slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") })}
                onBlur={() => form.slug && patch({ slug: slugify(form.slug, 40) })}
                className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[13px] outline-none placeholder:text-subtle-foreground"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {errors.slug ? <FieldError>{errors.slug}</FieldError> : <FieldDescription>Changing it breaks the old link, so update anywhere you&apos;ve shared it.</FieldDescription>}
          </Field>

          <Field>
            <FieldLabel htmlFor={`${ids}-desc`}>
              Description <span className="font-normal text-subtle-foreground">(optional)</span>
            </FieldLabel>
            <Textarea
              id={`${ids}-desc`}
              value={form.description}
              maxLength={1000}
              placeholder="e.g. A relaxed 30-minute chat about your goals. No pressure, no pitch."
              onChange={(e) => patch({ description: e.target.value })}
              className="min-h-20"
            />
          </Field>

          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2.5 text-[13.5px] leading-none font-medium">How long</legend>
            <div className="flex flex-wrap items-center gap-2">
              {DURATIONS.map((d) => (
                <Chip key={d} name={`${ids}-dur`} checked={!customLength && form.durationMinutes === d} onChange={() => (setCustomLength(false), patch({ durationMinutes: d }))}>
                  {durationLabel(d)}
                </Chip>
              ))}
              <Chip name={`${ids}-dur`} checked={customLength} onChange={() => setCustomLength(true)}>
                Other
              </Chip>
              {customLength ? (
                <span className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={5}
                    max={480}
                    step={5}
                    value={Number.isFinite(form.durationMinutes) ? form.durationMinutes : ""}
                    aria-label="Length in minutes"
                    aria-invalid={!!errors.duration || undefined}
                    onChange={(e) => patch({ durationMinutes: e.target.value === "" ? NaN : Math.round(Number(e.target.value)) })}
                    className="h-9 w-[84px] tabular-nums"
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </span>
              ) : null}
            </div>
            {errors.duration ? <FieldError>{errors.duration}</FieldError> : null}
          </fieldset>
        </Section>

        <Section id="where" title="Where you'll meet" help="Only people who book see the link or address. It goes in their invite and reminders.">
          <fieldset>
            <legend className="sr-only">Meeting place</legend>
            <div className="flex flex-wrap gap-2">
              {PLACES.map((p) => (
                <Chip key={p.value} name={`${ids}-place`} checked={form.locationType === p.value} onChange={() => patch({ locationType: p.value })} icon={p.icon}>
                  {p.label}
                </Chip>
              ))}
            </div>
          </fieldset>
          <Field data-invalid={!!errors.location || undefined}>
            <FieldLabel htmlFor={`${ids}-where`}>{place.label}</FieldLabel>
            {form.locationType === "in_person" || form.locationType === "custom" ? (
              <Textarea
                id={`${ids}-where`}
                value={form.locationValue}
                maxLength={500}
                placeholder={place.placeholder}
                onChange={(e) => patch({ locationValue: e.target.value })}
                className="min-h-16"
              />
            ) : (
              <Input
                id={`${ids}-where`}
                value={form.locationValue}
                maxLength={500}
                inputMode={form.locationType === "phone" ? "tel" : "url"}
                placeholder={place.placeholder}
                aria-invalid={!!errors.location || undefined}
                onChange={(e) => patch({ locationValue: e.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
            )}
            {errors.location ? <FieldError>{errors.location}</FieldError> : <FieldDescription>{place.help}</FieldDescription>}
          </Field>
        </Section>

        <Section id="hours" title="When you're free" help="People can only book inside these hours. Bookings, a buffer and your notice time are taken out for you.">
          <Field data-invalid={!!errors.timezone || undefined}>
            <FieldLabel htmlFor={`${ids}-tz`}>
              <GlobeIcon className="size-3.5 text-muted-foreground" aria-hidden />
              Your time zone
            </FieldLabel>
            <NativeSelect id={`${ids}-tz`} value={form.timezone} onChange={(e) => patch({ timezone: e.target.value })} aria-invalid={!!errors.timezone || undefined} className="w-full max-w-sm">
              {zones.map((z) => (
                <NativeSelectOption key={z.value} value={z.value}>
                  {z.label}
                  {z.value === detected ? " · this device" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {errors.timezone ? <FieldError>{errors.timezone}</FieldError> : <FieldDescription>Visitors see times in their own zone automatically.</FieldDescription>}
          </Field>
          <AvailabilityEditor week={form.week} onChange={(week) => patch({ week })} errors={errors.days ?? {}} />
          {errors.hours ? <FieldError>{errors.hours}</FieldError> : null}
          {form.week.every((d) => d.length === 0) ? (
            <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-foreground/80 ring-1 ring-warning/15 ring-inset">
              <b className="font-semibold text-warning">No open hours yet.</b> Switch on at least one day, or nobody can book.
            </p>
          ) : null}
        </Section>

        <Section title="What you ask" help="Name and email are always asked. Add up to five questions so you walk in prepared.">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2.5 text-[13.5px] leading-none font-medium">Phone number</legend>
            <Segmented
              name={`${ids}-phone`}
              value={form.locationType === "phone" ? "required" : form.phoneMode}
              options={PHONE_MODES}
              disabled={form.locationType === "phone"}
              onChange={(v) => patch({ phoneMode: v as PhoneMode })}
            />
            <FieldDescription>
              {form.locationType === "phone" ? "Always required for phone calls, so you can ring them." : "With a number, they also get a text reminder when SMS is set up."}
            </FieldDescription>
          </fieldset>
          <QuestionsEditor questions={form.questions} errors={errors.q ?? {}} onChange={setQuestions} />
        </Section>

        <Section title="After they book" help="A short, warm note on the confirmation screen and in their email.">
          <Field>
            <FieldLabel htmlFor={`${ids}-thanks`}>
              Confirmation message <span className="font-normal text-subtle-foreground">(optional)</span>
            </FieldLabel>
            <Textarea
              id={`${ids}-thanks`}
              value={form.confirmationMessage}
              maxLength={2000}
              placeholder="e.g. Can't wait to meet you! Have a think about your #1 goal before we chat."
              onChange={(e) => patch({ confirmationMessage: e.target.value })}
              className="min-h-20"
            />
          </Field>
        </Section>

        <div className="border-t border-border/80 px-5 py-6 md:px-6">
          <MoreOptions title="Timing rules" sub="Breathing room between calls, how much notice you need, how far ahead people can book." icon={ClockIcon}>
            <div className="grid gap-5 @2xl/main:grid-cols-2">
              <NumberSelect
                id={`${ids}-buffer`}
                label="Break after each call"
                help="Kept free after every booking, so calls never run back to back."
                value={form.bufferMinutes}
                options={withValue(BUFFERS, form.bufferMinutes)}
                format={(m) => (m === 0 ? "No break" : `${m} min`)}
                onChange={(v) => patch({ bufferMinutes: v })}
              />
              <NumberSelect
                id={`${ids}-step`}
                label="Start times every"
                help="How often a new start time is offered: 9:00, 9:30, 10:00…"
                value={form.slotIntervalMinutes}
                options={withValue([0, 15, 30, 60], form.slotIntervalMinutes)}
                format={(m) => (m === 0 ? `${durationLabel(form.durationMinutes || 30)} (the call length)` : `${m} min`)}
                onChange={(v) => patch({ slotIntervalMinutes: v })}
              />
              <NumberSelect
                id={`${ids}-notice`}
                label="Minimum notice"
                help="Nobody can book a call starting sooner than this."
                value={form.minNoticeMinutes}
                options={withValue(NOTICE, form.minNoticeMinutes)}
                format={noticeLabel}
                onChange={(v) => patch({ minNoticeMinutes: v })}
              />
              <NumberSelect
                id={`${ids}-ahead`}
                label="How far ahead"
                help="The furthest day people can pick."
                value={form.maxDaysAhead}
                options={withValue(AHEAD, form.maxDaysAhead)}
                format={(d) => `${d} days`}
                onChange={(v) => patch({ maxDaysAhead: v })}
              />
            </div>
          </MoreOptions>
        </div>

        <div className="sticky bottom-0 z-20 [body:has(.guide-fab)_&]:bottom-[84px] flex flex-col gap-3 rounded-b-2xl border-t border-border/80 bg-card/90 px-5 py-3.5 backdrop-blur-md supports-backdrop-filter:bg-card/80 md:px-6">
          {serverError ? (
            <p role="alert" className="rounded-xl bg-destructive-soft px-3.5 py-2.5 text-[13.5px] text-destructive">
              {serverError}
            </p>
          ) : hasErrors(errors) ? (
            <p role="alert" className="text-[13px] text-destructive">
              Fix the highlighted bits, then save.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {!isNew ? (
              confirmDelete ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-destructive">Delete {form.name || "this calendar"} for good?</span>
                  <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={remove}>
                    {pending ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
                    Yes, delete
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </Button>
                </span>
              ) : (
                <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2Icon data-icon="inline-start" />
                  Delete
                </Button>
              )
            ) : (
              <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
                <Link href={`/app/w/${wid}/calendar`} scroll={false}>
                  Cancel
                </Link>
              </Button>
            )}
            <span className="ml-auto flex items-center gap-2">
              <span className="text-[13px] text-muted-foreground max-sm:hidden" aria-live="polite">
                {pending ? "Saving…" : dirty ? "Unsaved changes" : isNew ? "" : "All saved"}
              </span>
              {dirty && !isNew ? (
                <Button type="button" variant="ghost" size="sm" onClick={discard} disabled={pending}>
                  Discard
                </Button>
              ) : null}
              <Button type="submit" disabled={pending || (!dirty && !isNew)}>
                {pending ? <Spinner data-icon="inline-start" /> : null}
                {isNew ? "Create calendar" : "Save changes"}
              </Button>
            </span>
          </div>
          <p className="sr-only">Your link will be {linkBase + slugPreview}</p>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Section({ id, title, help, children }: { id?: string; title: string; help: string; children: ReactNode }) {
  return (
    <div id={id} className="grid scroll-mt-24 gap-x-10 gap-y-5 border-t border-border/80 px-5 py-7 md:px-6 @3xl/main:grid-cols-[minmax(0,13.5rem)_minmax(0,1fr)]">
      <div className="grid content-start gap-1">
        <h3 className="text-[15px] leading-snug font-semibold tracking-[-0.01em]">{title}</h3>
        <p className="max-w-[46ch] text-[13.5px] leading-relaxed text-muted-foreground">{help}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </div>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-[13px] leading-snug text-destructive">
      {children}
    </p>
  );
}

/** A pill you pick one of, like a radio button. */
function Chip({ name, checked, onChange, icon: Icon, children }: { name: string; checked: boolean; onChange: () => void; icon?: LucideIcon; children: ReactNode }) {
  return (
    <label className="relative">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        className={cn(
          "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border-strong bg-card px-3.5 text-[13.5px] font-medium text-foreground/80 shadow-xs transition-[color,background-color,border-color,box-shadow] duration-150 ease-swift select-none hover:border-violet-200 hover:text-foreground",
          "peer-checked:border-primary/60 peer-checked:bg-accent peer-checked:text-accent-foreground peer-checked:shadow-none peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/30",
          "dark:border-white/12 dark:bg-white/[0.03] dark:hover:border-white/20 dark:peer-checked:border-violet-300/50 dark:peer-checked:bg-accent",
        )}
      >
        {Icon ? <Icon className={cn("size-4", checked ? "text-primary dark:text-violet-300" : "text-muted-foreground")} aria-hidden /> : null}
        {children}
      </span>
    </label>
  );
}

function Segmented<T extends string>({ name, value, options, onChange, disabled }: { name: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className={cn("flex w-fit max-w-full flex-wrap gap-0.5 rounded-full bg-muted p-1 ring-1 ring-ink/[0.03] ring-inset dark:ring-white/[0.04]", disabled && "opacity-60")}>
      {options.map((o) => (
        <label key={o.value} className="relative">
          <input type="radio" name={name} value={o.value} checked={value === o.value} disabled={disabled} onChange={() => onChange(o.value)} className="peer sr-only" />
          <span className="inline-flex h-8 cursor-pointer items-center rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] duration-150 ease-swift peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-[0_1px_2px_rgb(var(--shadow-color)/0.08),0_2px_8px_-2px_rgb(var(--shadow-color)/0.08)] peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/30 peer-disabled:cursor-not-allowed hover:text-foreground dark:peer-checked:bg-white/[0.09]">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

function NumberSelect({ id, label, help, value, options, format, onChange }: { id: string; label: string; help: string; value: number; options: number[]; format: (n: number) => string; onChange: (n: number) => void }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect id={id} value={String(value)} onChange={(e) => onChange(Number(e.target.value))} className="w-full">
        {options.map((o) => (
          <NativeSelectOption key={o} value={String(o)}>
            {format(o)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <FieldDescription>{help}</FieldDescription>
    </Field>
  );
}

let qSeq = 0;
const newQuestionId = () => `q${Date.now().toString(36)}${(qSeq++).toString(36)}`;

function QuestionsEditor({ questions, errors, onChange }: { questions: BookingQuestion[]; errors: Record<number, string>; onChange: (qs: BookingQuestion[]) => void }) {
  const ids = useId();
  const update = (i: number, p: Partial<BookingQuestion>) => onChange(questions.map((q, j) => (j === i ? { ...q, ...p } : q)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...questions];
    const [q] = next.splice(i, 1);
    next.splice(i + by, 0, q);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[13.5px] font-medium">Questions</span>
      {questions.length ? (
        <ol className="flex flex-col gap-2.5">
          {questions.map((q, i) => (
            <li key={q.id} className="flex flex-col gap-3 rounded-xl bg-muted/35 p-3 ring-1 ring-border-strong/60 ring-inset dark:bg-white/[0.02] dark:ring-white/[0.07]">
              <div className="flex items-start gap-2">
                <span className="mt-2 grid size-6 shrink-0 place-items-center rounded-full bg-card text-[11.5px] font-semibold text-muted-foreground tabular-nums ring-1 ring-ink/[0.06] dark:bg-white/[0.06] dark:ring-white/[0.06]">{i + 1}</span>
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <Input
                    value={q.label}
                    maxLength={200}
                    placeholder="e.g. What would you love help with?"
                    aria-label={`Question ${i + 1}`}
                    aria-invalid={!!errors[i] || undefined}
                    onChange={(e) => update(i, { label: e.target.value })}
                    className="bg-card"
                  />
                  {errors[i] ? <FieldError>{errors[i]}</FieldError> : null}
                </div>
                <div className="flex shrink-0 items-center">
                  <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground max-sm:hidden" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move question ${i + 1} up`}>
                    <ArrowUpIcon />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground max-sm:hidden" disabled={i === questions.length - 1} onClick={() => move(i, 1)} aria-label={`Move question ${i + 1} down`}>
                    <ArrowDownIcon />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => onChange(questions.filter((_, j) => j !== i))} aria-label={`Remove question ${i + 1}`}>
                    <XIcon />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 pl-8">
                <Segmented
                  name={`${ids}-type-${q.id}`}
                  value={q.type}
                  options={[
                    { value: "short", label: "Short answer" },
                    { value: "long", label: "Paragraph" },
                  ]}
                  onChange={(v) => update(i, { type: v })}
                />
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-muted-foreground select-none">
                  <Switch size="sm" checked={q.required} onCheckedChange={(v) => update(i, { required: v })} aria-label={`Question ${i + 1} is required`} />
                  Required
                </label>
                <span className="flex items-center gap-0.5 sm:hidden">
                  <Button type="button" variant="ghost" size="icon-xs" className="text-muted-foreground" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move question ${i + 1} up`}>
                    <ArrowUpIcon />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" className="text-muted-foreground" disabled={i === questions.length - 1} onClick={() => move(i, 1)} aria-label={`Move question ${i + 1} down`}>
                    <ArrowDownIcon />
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-3.5 text-[13.5px] text-muted-foreground">No questions. People just leave their name and email.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={questions.length >= MAX_QUESTIONS}
          onClick={() => onChange([...questions, { id: newQuestionId(), label: "", type: "short", required: false }])}
        >
          <PlusIcon data-icon="inline-start" />
          Add a question
        </Button>
        <span className="text-[12.5px] text-subtle-foreground">{questions.length >= MAX_QUESTIONS ? "That's the most: five questions." : `${MAX_QUESTIONS - questions.length} more allowed`}</span>
      </div>
    </div>
  );
}
