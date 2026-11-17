import Link from "next/link";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { startDayAction } from "@/actions/journey";
import { SubmitButton } from "@/components/client";
import { PennyFace } from "@/components/companion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DAY6_WAITING_LINE, fill, JOURNEY_COPY, WEEK } from "@/lib/week";
import { cn } from "@/lib/utils";
import type { Shelf, WeekDay } from "@/server/path";
import { Tick } from "./tick";

const C = JOURNEY_COPY.dayDone;

/** What the app can honestly see of the week. A missing fact is a quiet zero, never red. */
export function ShelfList({ shelf, className, tone = "light" }: { shelf: Shelf; className?: string; tone?: "light" | "night" }) {
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {shelf.items.map((item) => (
        <li key={item.key} className="flex items-start gap-3 text-sm">
          <span
            className={cn(
              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
              item.have ? (tone === "night" ? "bg-white/20 text-white" : "bg-accent text-primary dark:text-violet-300") : tone === "night" ? "bg-white/10" : "bg-muted",
            )}
            aria-hidden
          >
            {item.have ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-medium">{item.label}</span>
            <span className={cn("tabular-nums", tone === "night" ? "text-white/70" : "text-muted-foreground")}>{item.note}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The day's line under "You're done for today.": Day 6 says so when the numbers need more time. */
export function dayLine(day: WeekDay): string {
  if (day.day === 6 && day.steps.some((s) => s.key === "review" && s.tick === "waiting")) return DAY6_WAITING_LINE;
  return WEEK[day.day - 1]?.line ?? "";
}

/**
 * A calm finish. It asks for nothing: no pink button, tomorrow is only named, and starting it
 * early is one quiet click away.
 */
export function DayDone({ day, next, wid, back }: { day: WeekDay; next: WeekDay; wid: string; back: string }) {
  return (
    <Card className="bg-success-soft ring-success/25 dark:ring-success/25">
      <CardContent className="flex flex-col gap-5 md:flex-row md:items-start md:gap-7">
        <PennyFace size={88} crop="full" pose="wave" className="shrink-0 self-center md:self-start" />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="grid gap-1">
            <h2 className="font-display text-[30px] leading-tight tracking-[-0.01em]">{C.heading}</h2>
            <p className="text-[15px] text-foreground/80">{dayLine(day)}</p>
          </div>
          <div className="flex flex-col gap-2.5">
            <p className="text-sm font-semibold">{C.exists}</p>
            <ul className="flex flex-col gap-2">
              {day.steps
                .filter((s) => s.done)
                .map((s) => (
                  <li key={s.key} className="flex items-start gap-2.5 text-sm">
                    <Tick tick={s.tick} className="size-5 border" />
                    <span className="min-w-0 leading-relaxed">
                      {s.win}
                      {s.proof?.href ? (
                        <>
                          {" "}
                          <Link href={s.proof.href} {...(/^https?:/.test(s.proof.href) ? { target: "_blank", rel: "noreferrer" } : {})} className="font-medium">
                            {s.proof.text}
                          </Link>
                        </>
                      ) : null}
                      {s.tick === "you" || s.tick === "waiting" ? <span className="text-muted-foreground"> {C.youTicked}</span> : null}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3 border-t border-success/20 pt-4">
            <p className="text-sm font-medium">{fill(C.tomorrow, { day: next.day, title: next.title })}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <form action={startDayAction.bind(null, wid, next.day)}>
                <input type="hidden" name="back" value={back} />
                <SubmitButton variant="outline">{fill(C.start, { day: next.day })}</SubmitButton>
              </form>
              <span className="text-sm text-muted-foreground">{C.comeBack}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** The week's end, from what the app can see, then the one small weekly job. */
export function WeekDone({ shelf, wid }: { shelf: Shelf; wid: string }) {
  return (
    <Card className="bg-success-soft ring-success/25 dark:ring-success/25">
      <CardContent className="flex flex-col gap-5 md:flex-row md:items-start md:gap-7">
        <PennyFace size={88} crop="full" pose="wave" className="shrink-0 self-center md:self-start" />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <h2 className="font-display text-[30px] leading-tight tracking-[-0.01em]">{JOURNEY_COPY.weekDone.heading}</h2>
          <ShelfList shelf={shelf} />
          <p className="text-[15px] text-foreground/80">{JOURNEY_COPY.weekDone.after}</p>
          <Button variant="cta" size="lg" asChild className="self-start">
            <Link href={`/app/w/${wid}/growth`}>
              {JOURNEY_COPY.weekDone.cta}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
