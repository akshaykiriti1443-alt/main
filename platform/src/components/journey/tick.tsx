import { CheckIcon, Clock3Icon } from "lucide-react";
import { JOURNEY_COPY } from "@/lib/week";
import { cn } from "@/lib/utils";
import type { Tick as TickState } from "@/server/path";

const L = JOURNEY_COPY.strip;

/**
 * Three ticks that never look alike. Solid green: the app saw it. Outlined violet: the member
 * ticked it. A clock: someone else's turn. No tick yet: the step's number (filled when it's next).
 */
export function Tick({ tick, n, active, className }: { tick: TickState; n?: number; active?: boolean; className?: string }) {
  const base = "grid size-7 shrink-0 place-items-center rounded-full border text-[12.5px] font-semibold tabular-nums";
  // The tick draws itself once (off under reduced motion). Nothing else moves.
  const draw = "motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:fade-in-0 motion-safe:duration-200";
  if (tick === "app")
    return (
      <span className={cn(base, "border-success bg-success text-white dark:text-background", className)} title={L.legendApp}>
        <CheckIcon className={cn("size-3.5", draw)} strokeWidth={3} aria-hidden />
        <span className="sr-only">{L.legendApp}</span>
      </span>
    );
  if (tick === "you")
    return (
      <span className={cn(base, "border-[1.5px] border-primary bg-card text-primary dark:border-violet-300 dark:text-violet-300", className)} title={L.legendYou}>
        <CheckIcon className={cn("size-3.5", draw)} strokeWidth={3} aria-hidden />
        <span className="sr-only">{L.legendYou}</span>
      </span>
    );
  if (tick === "waiting")
    return (
      <span className={cn(base, "border-border-strong bg-muted text-muted-foreground", className)} title={L.legendWaiting}>
        <Clock3Icon className={cn("size-3.5", draw)} strokeWidth={2.5} aria-hidden />
        <span className="sr-only">{L.legendWaiting}</span>
      </span>
    );
  return (
    <span className={cn(base, active ? "border-primary bg-primary text-primary-foreground shadow-press" : "border-border-strong bg-card text-muted-foreground", className)}>
      {n}
    </span>
  );
}

/** The one-line key under the week strip on Your path. */
export function TickLegend({ className }: { className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground", className)}>
      {(["app", "you", "waiting"] as const).map((t) => (
        <span key={t} className="flex items-center gap-1.5">
          <span aria-hidden>
            <Tick tick={t} className="size-5" />
          </span>
          {t === "app" ? L.legendApp : t === "you" ? L.legendYou : L.legendWaiting}
        </span>
      ))}
    </p>
  );
}
