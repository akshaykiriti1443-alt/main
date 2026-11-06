"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClockIcon,
  CalendarXIcon,
  EllipsisIcon,
  GlobeIcon,
  MailIcon,
  MessageSquareTextIcon,
  PhoneIcon,
  Undo2Icon,
  UserRoundIcon,
  UserRoundXIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { noShowAction, ownerCancelBookingAction } from "@/actions/calendar";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/crm-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { isActiveStatus, STATUS_LABEL, type BookingItem } from "./shared";

export type DayGroup = { key: string; label: string; items: BookingItem[] };
export type WeekDay = { key: string; weekday: string; dayNum: string; longLabel: string; isToday: boolean; hours: string | null; items: BookingItem[] };

const STATUS_CLASS: Record<BookingItem["status"], string> = {
  confirmed: "bg-success-soft text-success",
  rescheduled: "bg-accent text-accent-foreground",
  cancelled: "bg-secondary text-muted-foreground",
  no_show: "bg-warning-soft text-warning",
};

export function StatusChip({ b, className }: { b: Pick<BookingItem, "status" | "past">; className?: string }) {
  // A call that has started and wasn't marked a no-show is simply in the past.
  const label = b.past && isActiveStatus(b.status) ? "Past" : STATUS_LABEL[b.status];
  const cls = b.past && isActiveStatus(b.status) ? "bg-secondary text-muted-foreground" : STATUS_CLASS[b.status];
  return (
    <Badge variant="secondary" className={cn("gap-1.5 pl-2", cls, className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
      {label}
    </Badge>
  );
}

const canNoShow = (b: BookingItem) => b.past && isActiveStatus(b.status);
const canCancel = (b: BookingItem) => !b.past && isActiveStatus(b.status);

/** The owner's bookings: a day-by-day list or a Monday-to-Sunday week, with the same actions. */
export function BookingsView(props: { wid: string } & ({ mode: "list"; upcoming: DayGroup[]; past: DayGroup[] } | { mode: "week"; days: WeekDay[] })) {
  const { wid } = props;
  const router = useRouter();
  const [detail, setDetail] = useState<BookingItem | null>(null);
  const [cancelling, setCancelling] = useState<BookingItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  function noShow(b: BookingItem, undo = false) {
    setBusy(b.id);
    start(async () => {
      try {
        const res = await noShowAction(wid, b.id, undo);
        if (!res.ok) return void toast.error(res.error);
        setDetail(null);
        if (undo) toast.success(`${b.name} is back to booked`);
        else
          toast.success(`${b.name} marked as a no-show`, {
            description: "It's on their contact's timeline too.",
            action: { label: "Undo", onClick: () => noShow(b, true) },
          });
        router.refresh();
      } catch {
        toast.error("We couldn't reach OneX. Check your connection and try again.");
      } finally {
        setBusy(null);
      }
    });
  }

  const actions: RowActions = {
    wid,
    busy,
    open: setDetail,
    noShow,
    cancel: (b) => {
      setDetail(null);
      setCancelling(b);
    },
  };

  return (
    <>
      {props.mode === "list" ? <ListView upcoming={props.upcoming} past={props.past} actions={actions} /> : <WeekView days={props.days} actions={actions} />}
      <DetailDialog b={detail} actions={actions} onOpenChange={(o) => !o && setDetail(null)} />
      <CancelDialog
        wid={wid}
        b={cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        onDone={() => {
          setCancelling(null);
          router.refresh();
        }}
      />
    </>
  );
}

type RowActions = {
  wid: string;
  busy: string | null;
  open: (b: BookingItem) => void;
  noShow: (b: BookingItem, undo?: boolean) => void;
  cancel: (b: BookingItem) => void;
};

const contactHref = (wid: string, b: BookingItem) => (b.contactId ? `/app/w/${wid}/leads/${b.contactId}` : null);

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function ListView({ upcoming, past, actions }: { upcoming: DayGroup[]; past: DayGroup[]; actions: RowActions }) {
  return (
    <ul className="-mx-6 -mb-6 flex flex-col border-t border-border/80">
      {upcoming.map((g) => (
        <Group key={g.key} g={g} actions={actions} />
      ))}
      {past.length ? (
        <>
          <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border/80 px-6 pt-6 pb-3">
            <span className="text-[13.5px] font-semibold tracking-[-0.005em]">Last 7 days</span>
            <span className="text-[13px] text-muted-foreground">Mark anyone who didn&apos;t turn up, so you know who to chase.</span>
          </li>
          {past.map((g) => (
            <Group key={g.key} g={g} actions={actions} />
          ))}
        </>
      ) : null}
    </ul>
  );
}

function Group({ g, actions }: { g: DayGroup; actions: RowActions }) {
  return (
    <li>
      <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/45 px-6 py-2 dark:bg-white/[0.02]">
        <h3 className="text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">{g.label}</h3>
        <span className="text-[12px] text-subtle-foreground tabular-nums">
          {g.items.length} {g.items.length === 1 ? "call" : "calls"}
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-border/70 border-b border-border/80 last:border-b-0">
        {g.items.map((b) => (
          <Row key={b.id} b={b} actions={actions} />
        ))}
      </ul>
    </li>
  );
}

function Row({ b, actions }: { b: BookingItem; actions: RowActions }) {
  const off = b.status === "cancelled";
  const pending = actions.busy === b.id;
  return (
    <li className="group/row relative isolate flex items-center gap-3 px-6 py-3.5 transition-colors duration-150 ease-swift hover:bg-accent/60 dark:hover:bg-white/[0.03]">
      <button
        type="button"
        onClick={() => actions.open(b)}
        className="absolute inset-0 z-0 outline-none focus-visible:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:ring-inset"
        aria-label={`${b.name}, ${b.when}. Open details`}
      />
      <span className={cn("pointer-events-none relative grid w-[76px] shrink-0 gap-0.5 sm:w-[92px]", off && "opacity-60")}>
        <span className={cn("text-[14px] leading-tight font-semibold tracking-[-0.01em] tabular-nums", off && "line-through decoration-muted-foreground/60")}>{b.time}</span>
        <span className="text-[12px] text-subtle-foreground tabular-nums">
          {b.durationMinutes} min{b.otherZone ? ` · ${b.zone}` : ""}
        </span>
      </span>
      <Avatar name={b.name || b.email} className={cn("pointer-events-none relative max-sm:hidden", off && "opacity-60")} />
      <span className="pointer-events-none relative grid min-w-0 flex-1 gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("max-w-full truncate font-medium transition-colors group-hover/row:text-primary dark:group-hover/row:text-violet-300", off && "text-muted-foreground")}>{b.name || b.email}</span>
          <StatusChip b={b} />
        </span>
        <span className="truncate text-[12.5px] text-muted-foreground">
          {b.email}
          {b.phone ? ` · ${b.phone}` : ""}
          <span className="text-subtle-foreground"> · {b.calendarName}</span>
        </span>
      </span>
      <span className="relative z-10 flex shrink-0 items-center gap-1">
        {canNoShow(b) ? (
          <Button variant="outline" size="xs" disabled={pending} onClick={() => actions.noShow(b)} className="max-sm:size-7 max-sm:px-0">
            {pending ? <Spinner data-icon="inline-start" /> : <UserRoundXIcon data-icon="inline-start" />}
            <span className="max-sm:sr-only">No-show?</span>
          </Button>
        ) : null}
        {b.status === "no_show" ? (
          <Button variant="ghost" size="xs" disabled={pending} onClick={() => actions.noShow(b, true)} className="max-sm:size-7 max-sm:px-0">
            {pending ? <Spinner data-icon="inline-start" /> : <Undo2Icon data-icon="inline-start" />}
            <span className="max-sm:sr-only">Undo</span>
          </Button>
        ) : null}
        {contactHref(actions.wid, b) ? (
          <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground max-md:hidden">
            <Link href={contactHref(actions.wid, b)!} aria-label={`Open ${b.name}'s contact`} title="Open contact">
              <UserRoundIcon />
            </Link>
          </Button>
        ) : null}
        <RowMenu b={b} actions={actions} />
      </span>
    </li>
  );
}

function RowMenu({ b, actions }: { b: BookingItem; actions: RowActions }) {
  const href = contactHref(actions.wid, b);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`More for ${b.name}`}>
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem onSelect={() => actions.open(b)}>
          <CalendarClockIcon />
          Booking details
        </DropdownMenuItem>
        {href ? (
          <DropdownMenuItem asChild>
            <Link href={href}>
              <UserRoundIcon />
              Open contact
            </Link>
          </DropdownMenuItem>
        ) : null}
        {canNoShow(b) ? (
          <DropdownMenuItem onSelect={() => actions.noShow(b)}>
            <UserRoundXIcon />
            Mark as no-show
          </DropdownMenuItem>
        ) : null}
        {b.status === "no_show" ? (
          <DropdownMenuItem onSelect={() => actions.noShow(b, true)}>
            <Undo2Icon />
            Undo no-show
          </DropdownMenuItem>
        ) : null}
        {canCancel(b) ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => actions.cancel(b)}>
              <CalendarXIcon />
              Cancel booking…
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Week
// ---------------------------------------------------------------------------

function WeekView({ days, actions }: { days: WeekDay[]; actions: RowActions }) {
  return (
    <ol className="-mx-6 -mb-6 grid divide-y divide-border/80 border-t border-border/80 @3xl/main:grid-cols-7 @3xl/main:divide-x @3xl/main:divide-y-0">
      {days.map((d) => (
        <li
          key={d.key}
          aria-label={`${d.longLabel}${d.isToday ? " (today)" : ""}: ${d.items.length ? `${d.items.length} booking${d.items.length === 1 ? "" : "s"}` : "nothing booked"}`}
          className={cn(
            "flex min-w-0 gap-3 px-4 py-3.5 @3xl/main:min-h-[300px] @3xl/main:flex-col @3xl/main:gap-2.5 @3xl/main:px-2 @3xl/main:pt-3 @3xl/main:pb-4",
            d.isToday && "bg-accent/45 dark:bg-white/[0.025]",
            !d.hours && !d.isToday && "bg-[repeating-linear-gradient(135deg,transparent_0_7px,var(--muted)_7px_8px)] dark:bg-[repeating-linear-gradient(135deg,transparent_0_7px,rgb(255_255_255/0.025)_7px_8px)]",
          )}
        >
          <header className="flex w-14 shrink-0 flex-col items-center gap-1 pt-0.5 @3xl/main:w-auto">
            <span className={cn("text-[11px] font-semibold tracking-[0.08em] uppercase", d.isToday ? "text-primary dark:text-violet-300" : "text-muted-foreground")}>{d.weekday}</span>
            <span
              className={cn(
                "grid size-8 place-items-center rounded-full text-[15px] font-semibold tabular-nums",
                d.isToday ? "bg-primary text-primary-foreground shadow-press" : "text-foreground",
              )}
            >
              {d.dayNum}
            </span>
            <span className="text-center text-[11px] leading-tight text-subtle-foreground">{d.hours ?? "Off"}</span>
          </header>
          <ul className="flex min-w-0 flex-1 flex-col gap-1.5 self-center @3xl/main:self-stretch">
            {d.items.map((b) => (
              <li key={b.id}>
                <Chip b={b} onClick={() => actions.open(b)} />
              </li>
            ))}
            {d.items.length === 0 ? <li className="text-[13px] text-subtle-foreground @3xl/main:hidden">Nothing booked</li> : null}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function Chip({ b, onClick }: { b: BookingItem; onClick: () => void }) {
  const off = b.status === "cancelled";
  const tone = off
    ? "bg-muted text-muted-foreground ring-transparent hover:bg-secondary"
    : b.status === "no_show"
      ? "bg-warning-soft ring-warning/15 hover:ring-warning/30"
      : b.past
        ? "bg-muted/80 ring-ink/[0.04] hover:bg-secondary dark:ring-white/[0.04]"
        : "bg-accent ring-violet-200/70 hover:bg-accent-strong dark:ring-white/[0.06]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-[10px] px-2.5 py-2 text-left ring-1 transition-[background-color,box-shadow] duration-150 ease-swift ring-inset outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 @3xl/main:flex-col @3xl/main:items-start @3xl/main:gap-0.5 @3xl/main:px-2 @3xl/main:py-1.5",
        tone,
      )}
    >
      <span
        className={cn(
          "shrink-0 text-[12px] font-semibold tabular-nums @3xl/main:text-[11.5px]",
          off ? "line-through" : b.status === "no_show" ? "text-warning" : b.past ? "text-muted-foreground" : "text-accent-foreground",
        )}
      >
        {b.time}
      </span>
      <span className={cn("min-w-0 truncate text-[13px] font-medium @3xl/main:w-full @3xl/main:text-[12.5px]", off ? "text-muted-foreground" : "text-foreground")}>{b.name || b.email}</span>
      {b.status !== "confirmed" && !(b.past && isActiveStatus(b.status)) ? (
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground @3xl/main:ml-0">{STATUS_LABEL[b.status]}</span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Details and cancel
// ---------------------------------------------------------------------------

function DetailRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground dark:bg-white/[0.05]">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <dt className="text-[12px] font-medium text-subtle-foreground">{label}</dt>
        <dd className="min-w-0 text-[14px] leading-relaxed break-words text-foreground">{children}</dd>
      </div>
    </div>
  );
}

function DetailDialog({ b, actions, onOpenChange }: { b: BookingItem | null; actions: RowActions; onOpenChange: (open: boolean) => void }) {
  // Keep the last booking on screen while the dialog fades out.
  const [last, setLast] = useState<BookingItem | null>(b);
  if (b && b !== last) setLast(b);
  const x = b ?? last;
  const href = x ? contactHref(actions.wid, x) : null;
  const pending = x ? actions.busy === x.id : false;
  return (
    <Dialog open={!!b} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        {x ? (
          <>
            <DialogHeader className="flex-row items-center gap-3.5 pr-8">
              <Avatar name={x.name || x.email} size="lg" />
              <div className="grid min-w-0 gap-1">
                <DialogTitle className="truncate">{x.name || x.email}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-2">
                  <span>{x.calendarName}</span>
                  <StatusChip b={x} />
                </DialogDescription>
              </div>
            </DialogHeader>
            <dl className="grid gap-4">
              <DetailRow icon={CalendarClockIcon} label="When">
                <span className={cn(x.status === "cancelled" && "line-through decoration-muted-foreground/60")}>{x.when}</span>
                {x.theirTime ? (
                  <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <GlobeIcon className="size-3.5" aria-hidden />
                    For them: {x.theirTime}
                  </span>
                ) : null}
              </DetailRow>
              <DetailRow icon={MailIcon} label="Email">
                <a href={`mailto:${x.email}`} className="text-link underline-offset-4 hover:underline">
                  {x.email}
                </a>
              </DetailRow>
              {x.phone ? (
                <DetailRow icon={PhoneIcon} label="Phone">
                  <a href={`tel:${x.phone}`} className="text-link underline-offset-4 hover:underline">
                    {x.phone}
                  </a>
                </DetailRow>
              ) : null}
              {x.answers.map((a, i) => (
                <DetailRow key={i} icon={MessageSquareTextIcon} label={a.label}>
                  <span className="whitespace-pre-line">{a.value}</span>
                </DetailRow>
              ))}
            </dl>
            <DialogFooter className="sm:justify-between">
              {href ? (
                <Button asChild variant="outline">
                  <Link href={href}>
                    <UserRoundIcon data-icon="inline-start" />
                    Open contact
                  </Link>
                </Button>
              ) : (
                <span />
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {canNoShow(x) ? (
                  <Button variant="secondary" disabled={pending} onClick={() => actions.noShow(x)}>
                    {pending ? <Spinner data-icon="inline-start" /> : <UserRoundXIcon data-icon="inline-start" />}
                    Mark no-show
                  </Button>
                ) : null}
                {x.status === "no_show" ? (
                  <Button variant="secondary" disabled={pending} onClick={() => actions.noShow(x, true)}>
                    {pending ? <Spinner data-icon="inline-start" /> : <Undo2Icon data-icon="inline-start" />}
                    Undo no-show
                  </Button>
                ) : null}
                {canCancel(x) ? (
                  <Button variant="destructive" onClick={() => actions.cancel(x)}>
                    <CalendarXIcon data-icon="inline-start" />
                    Cancel booking
                  </Button>
                ) : null}
              </div>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ wid, b, onOpenChange, onDone }: { wid: string; b: BookingItem | null; onOpenChange: (open: boolean) => void; onDone: () => void }) {
  const [last, setLast] = useState<BookingItem | null>(b);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const noteId = useId();
  if (b && b !== last) {
    setLast(b);
    setNote("");
    setError(null);
  }
  const x = b ?? last;
  const first = x ? (x.name || "them").split(/\s+/)[0] : "them";

  function submit() {
    if (!x) return;
    setError(null);
    start(async () => {
      try {
        const res = await ownerCancelBookingAction(wid, x.id, note.trim());
        if (!res.ok) return setError(res.error);
        toast.success(`Cancelled. We've emailed ${first}${note.trim() ? " your note" : ""}.`);
        onDone();
      } catch {
        setError("We couldn't reach OneX. Check your connection and try again.");
      }
    });
  }

  return (
    <Dialog open={!!b} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[460px]">
        {x ? (
          <>
            <DialogHeader>
              <DialogTitle>Cancel {first}&apos;s call?</DialogTitle>
              <DialogDescription>
                {x.when}. {first} gets an email, the invite comes off their calendar, and the time opens up again.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor={noteId}>
                A note for {first} <span className="font-normal text-subtle-foreground">(optional)</span>
              </Label>
              <Textarea
                id={noteId}
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Something came up, sorry! Grab another time from the same link."
                className="min-h-24"
              />
              <span className="text-xs text-muted-foreground">It goes in the cancellation email.</span>
            </div>
            {error ? (
              <p role="alert" className="rounded-xl bg-destructive-soft px-3.5 py-2.5 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
                Keep it
              </Button>
              <Button variant="destructive" disabled={pending} onClick={submit}>
                {pending ? <Spinner data-icon="inline-start" /> : <CalendarXIcon data-icon="inline-start" />}
                {pending ? "Cancelling…" : "Cancel booking"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
