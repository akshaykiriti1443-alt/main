import type { ReactNode } from "react";
import { CalendarOffIcon, ClockIcon, ShieldCheckIcon } from "lucide-react";
import type { CalendarLocation } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme";
import { EmptyArt } from "@/components/ui";
import { durationLabel, PLACE_ICON } from "./shared";
import { EmbedFrame } from "./embed-frame";

export { PLACE_ICON };

// The frame for the public booking pages: marshmallow, a soft violet dawn, the theme toggle, and
// nothing else competing with the calendar. Server-rendered.

export function hostInitials(host: string) {
  return (
    host
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "★"
  );
}

export function HostMark({ host, className }: { host: string; className?: string }) {
  return (
    <span aria-hidden className={cn("brand-mark size-9 rounded-full text-[11px]", className)}>
      {hostInitials(host)}
    </span>
  );
}

export function PublicShell({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-svh flex-col items-center px-4 pt-16 pb-10 sm:px-6 md:pt-20">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center overflow-hidden">
        <div className="h-[460px] w-[980px] -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow-violet),transparent)] blur-2xl" />
        <div className="absolute top-0 left-[62%] h-[260px] w-[380px] -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow-pink),transparent)] blur-2xl" />
      </div>
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <main className="flex w-full max-w-[1080px] flex-col items-center gap-6">{children}</main>
      {note ? (
        <p className="mt-7 flex max-w-md items-start justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground">
          <ShieldCheckIcon className="mt-px size-3.5 shrink-0 text-success" aria-hidden />
          <span>{note}</span>
        </p>
      ) : null}
    </div>
  );
}

// Runs before the first paint: light theme for this visit (the host site is light, and the theme
// provider keeps it pinned, see components/theme.tsx). Only <html> is touched (it is the one element
// whose attributes may differ from the server's); the see-through page is plain CSS, so the frame
// shows the card it sits in.
const EMBED_BOOT = `(function(){var d=document.documentElement;d.dataset.forceTheme="light";d.classList.remove("dark");d.classList.add("light");d.style.colorScheme="light";})();`;
const EMBED_CSS = "html,body{background:transparent!important}";

/**
 * The frame for a booking page embedded in another page on the same site (?embed=1), like the
 * ScaleitAds /apply card: no backdrop, no theme toggle, no page background, tight padding, always
 * light. The iframe is sized to the content (EmbedFrame).
 */
export function EmbedShell({ children }: { children: ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: EMBED_BOOT }} />
      <style dangerouslySetInnerHTML={{ __html: EMBED_CSS }} />
      <EmbedFrame>
        <main className="w-full">{children}</main>
      </EmbedFrame>
    </>
  );
}

const PLACE_HINT: Record<CalendarLocation, string> = {
  zoom: "The link comes with your invite",
  google_meet: "The link comes with your invite",
  phone: "They'll call you",
  in_person: "The address comes with your invite",
  custom: "Details come with your invite",
};

/** Who you're booking with and what: the left side of the booking card. */
export function CalendarIntro({
  host,
  name,
  durationMinutes,
  locationType,
  locationLabel,
  description,
}: {
  host: string;
  name: string;
  durationMinutes: number;
  locationType: CalendarLocation;
  locationLabel: string;
  description: string;
}) {
  const Place = PLACE_ICON[locationType];
  return (
    <>
      <div className="flex items-center gap-2.5">
        <HostMark host={host} />
        <span className="min-w-0 truncate text-[14px] font-medium text-muted-foreground">{host}</span>
      </div>
      <h1 className="-mt-1 text-[32px] leading-[1.04] tracking-[-0.012em] md:mt-0 md:text-[38px]">{name}</h1>
      <ul className="flex flex-wrap gap-x-5 gap-y-3 text-[14px] md:flex-col">
        <li className="flex items-center gap-2.5">
          <ClockIcon className="size-4 shrink-0 text-primary dark:text-violet-300" aria-hidden />
          <span className="font-medium">{durationLabel(durationMinutes)}</span>
        </li>
        <li className="flex items-start gap-2.5">
          <Place className="mt-0.5 size-4 shrink-0 text-primary dark:text-violet-300" aria-hidden />
          <span className="grid gap-0.5">
            <span className="font-medium">{locationLabel}</span>
            <span className="text-[12.5px] text-muted-foreground max-md:hidden">{PLACE_HINT[locationType]}</span>
          </span>
        </li>
      </ul>
      {description ? <p className="text-[14px] leading-relaxed whitespace-pre-line text-foreground/80 md:border-t md:border-border/80 md:pt-5 md:text-[14.5px]">{description}</p> : null}
    </>
  );
}

export function ClosedCard({ host, title = "This booking page is closed", body, action }: { host: string; title?: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="w-full max-w-[520px] overflow-hidden rounded-3xl bg-card shadow-float ring-1 ring-ink/[0.06] dark:ring-white/[0.08]">
      <div className="flex flex-col items-center gap-4 px-6 pt-10 pb-9 text-center md:px-10">
        <EmptyArt icon={CalendarOffIcon} tone="muted" />
        <span className="inline-flex items-center gap-2 text-[13.5px] font-medium text-muted-foreground">
          <HostMark host={host} className="size-6 text-[9px]" />
          {host}
        </span>
        <h1 className="text-[32px] leading-[1.05] tracking-[-0.012em] md:text-[38px]">{title}</h1>
        <p className="max-w-[40ch] text-[15px] leading-relaxed text-muted-foreground">{body ?? `${host} isn't taking bookings here right now. Check back soon, or reach out to them directly.`}</p>
        {action}
      </div>
    </div>
  );
}
