"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CheckIcon, CopyIcon, ExternalLinkIcon, Link2Icon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { setCalendarActiveAction } from "@/actions/calendar";
import { cn } from "@/lib/utils";
import { IconTile } from "@/components/ui";
import { LiveDot } from "@/components/crm-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export type LinkCalendar = {
  id: string;
  name: string;
  url: string;
  active: boolean;
  meta: string;
  /** "Add your Zoom link" when the meeting place is still empty. */
  missing: string | null;
  editHref: string;
};

/** Copy with a tick. The variant is up to the caller, so the page can make one of these its pink button. */
export function CopyLinkButton({ text, variant = "outline", size = "sm", label = "Copy link", className }: { text: string; variant?: "cta" | "outline" | "secondary" | "default"; size?: "sm" | "default" | "lg"; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("min-w-[118px]", className)}
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          })
          .catch(() => toast.error("Couldn't copy. Select the link and copy it by hand."));
      }}
    >
      {done ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </Button>
  );
}

const shown = (url: string) => url.replace(/^https?:\/\//, "");

/** The booking link(s): the thing to share. The first calendar's Copy is the page's one pink button. */
export function BookingLinks({ wid, calendars, canEdit, allUrl }: { wid: string; calendars: LinkCalendar[]; canEdit: boolean; allUrl: string | null }) {
  return (
    <section
      aria-labelledby="links-title"
      data-guide="calendar-link"
      className="overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]"
    >
      <div className="relative isolate flex flex-wrap items-start gap-3 px-5 pt-5 pb-1 md:px-6 md:pt-6">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-28 bg-[radial-gradient(70%_100%_at_0%_0%,var(--accent),transparent_70%)] dark:bg-[radial-gradient(70%_100%_at_0%_0%,rgb(118_85_245/0.10),transparent_70%)]" />
        <IconTile icon={Link2Icon} className="-mt-0.5" />
        <div className="grid min-w-0 flex-1 basis-60 gap-1">
          <h2 id="links-title" className="text-base leading-snug font-semibold tracking-[-0.011em]">
            {calendars.length > 1 ? "Your booking links" : "Your booking link"}
          </h2>
          <p className="max-w-[64ch] text-sm leading-relaxed text-muted-foreground">
            Put it in your Skool About page, your welcome email and your DMs. People pick a time, and it lands here and in Leads.
          </p>
        </div>
        {allUrl ? (
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <a href={allUrl} target="_blank" rel="noreferrer">
              All calendars page
              <ExternalLinkIcon data-icon="inline-end" />
            </a>
          </Button>
        ) : null}
      </div>
      <ul className="flex flex-col divide-y divide-border/80">
        {calendars.map((c, i) => (
          <LinkRow key={c.id} wid={wid} cal={c} primary={i === 0} canEdit={canEdit} />
        ))}
      </ul>
    </section>
  );
}

function LinkRow({ wid, cal, primary, canEdit }: { wid: string; cal: LinkCalendar; primary: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState(cal.active);
  const [pending, start] = useTransition();

  function toggle(next: boolean) {
    setActive(next);
    start(async () => {
      try {
        const res = await setCalendarActiveAction(wid, cal.id, next);
        if (!res.ok) {
          setActive(!next);
          toast.error(res.error);
          return;
        }
        toast.success(next ? `${cal.name} is taking bookings again` : `${cal.name} is switched off. Its page now says it's closed.`);
        router.refresh();
      } catch {
        setActive(!next);
        toast.error("We couldn't reach OneX. Check your connection and try again.");
      }
    });
  }

  const switchId = `active-${cal.id}`;
  return (
    <li className="flex flex-col gap-3.5 px-5 py-5 md:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-2.5">
          <LiveDot on={active} />
          <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{cal.name}</span>
          <span className="truncate text-[13px] text-muted-foreground max-sm:hidden">{cal.meta}</span>
        </div>
        {canEdit ? (
          <label htmlFor={switchId} className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-muted-foreground select-none">
            {active ? "Taking bookings" : "Switched off"}
            <Switch id={switchId} checked={active} disabled={pending} onCheckedChange={toggle} aria-label={`Take bookings on ${cal.name}`} />
          </label>
        ) : (
          <span className="text-[13px] font-medium text-muted-foreground">{active ? "Taking bookings" : "Switched off"}</span>
        )}
      </div>
      <p className="-mt-2 text-[13px] text-muted-foreground sm:hidden">{cal.meta}</p>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div
          className={cn(
            "flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-muted/70 px-3.5 ring-1 ring-ink/[0.04] ring-inset dark:bg-white/[0.04] dark:ring-white/[0.05]",
            !active && "opacity-60",
          )}
        >
          <Link2Icon className="size-4 shrink-0 text-primary dark:text-violet-300" aria-hidden />
          <span className="min-w-0 truncate font-mono text-[13px] text-foreground/90 select-all" title={cal.url}>
            {shown(cal.url)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CopyLinkButton text={cal.url} variant={primary ? "cta" : "outline"} size={primary ? "default" : "sm"} className={primary ? "flex-1 sm:flex-none" : "flex-1 sm:flex-none"} />
          <Button asChild variant="outline" size={primary ? "default" : "sm"} className="flex-1 sm:flex-none">
            <a href={cal.url} target="_blank" rel="noreferrer">
              Open
              <ExternalLinkIcon data-icon="inline-end" />
            </a>
          </Button>
        </div>
      </div>

      {cal.missing && canEdit ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] ring-1 ring-warning/15 ring-inset">
          <TriangleAlertIcon className="size-4 shrink-0 text-warning" aria-hidden />
          <span className="min-w-0 flex-1 basis-52 text-foreground/80">
            <b className="font-semibold text-foreground">{cal.missing}</b> so people know where to join. It only shows after they book.
          </span>
          <Link href={cal.editHref} className="inline-flex items-center gap-1 font-semibold text-warning no-underline hover:underline">
            Add it
            <ArrowRightIcon className="size-3.5" aria-hidden />
          </Link>
        </div>
      ) : null}
    </li>
  );
}
