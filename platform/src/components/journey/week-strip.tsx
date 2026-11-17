import type { ReactNode } from "react";
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { fill, JOURNEY_COPY } from "@/lib/week";
import { cn } from "@/lib/utils";
import type { WeekDay } from "@/server/path";

/**
 * Seven circles on a line: a done day is a green tick, the current day is filled violet, the rest
 * are plain numbers. Never a padlock: every day opens, and each circle links to that day.
 */
export function WeekStrip({ days, current, size = "sm", wid, caption, className }: { days: WeekDay[]; current: number | null; size?: "sm" | "lg"; wid: string; caption?: ReactNode; className?: string }) {
  const lg = size === "lg";
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <ol className="flex items-center" aria-label={JOURNEY_COPY.path.eyebrow}>
        {days.map((d, i) => {
          const isCurrent = d.day === current && !d.complete;
          const label = `${fill(JOURNEY_COPY.strip.dayLink, { day: d.day })}: ${d.title}${d.complete ? `, ${JOURNEY_COPY.path.done}` : isCurrent ? `, ${JOURNEY_COPY.path.youreHere}` : ""}`;
          return (
            <li key={d.day} className={cn("flex items-center", i < days.length - 1 && "flex-1")}>
              <Link
                href={`/app/w/${wid}/path#day-${d.day}`}
                aria-label={label}
                aria-current={isCurrent ? "step" : undefined}
                title={label}
                className={cn(
                  "grid shrink-0 place-items-center rounded-full border font-semibold tabular-nums transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:no-underline",
                  lg ? "size-10 text-[14px]" : "size-8 text-[12.5px]",
                  d.complete
                    ? "border-success bg-success text-white dark:text-background"
                    : isCurrent
                      ? "border-primary bg-primary text-primary-foreground shadow-press ring-4 ring-primary/15"
                      : "border-border-strong bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {d.complete ? <CheckIcon className={lg ? "size-4" : "size-3.5"} strokeWidth={3} aria-hidden /> : d.day}
              </Link>
              {i < days.length - 1 ? <span aria-hidden className={cn("mx-1 h-0.5 flex-1 rounded-full", d.complete ? "bg-success/45" : "bg-border")} /> : null}
            </li>
          );
        })}
      </ol>
      {caption ? <p className="text-[13px] text-muted-foreground">{caption}</p> : null}
    </div>
  );
}
