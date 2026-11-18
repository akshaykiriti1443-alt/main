import Link from "next/link";
import { ArrowRightIcon, CheckIcon, ChevronDownIcon, Clock3Icon, FlagIcon, TrendingUpIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { loadPath, pathIntro } from "@/server/path";
import { startDayAction } from "@/actions/journey";
import { cn } from "@/lib/utils";
import { fill, JOURNEY_COPY } from "@/lib/week";
import { SubmitButton } from "@/components/client";
import { Callout, Flash, PageHead, Panel } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { JourneyHero } from "@/components/journey/journey-hero";
import { StepRow } from "@/components/journey/step-row";
import { Tick, TickLegend } from "@/components/journey/tick";
import { WeekStrip } from "@/components/journey/week-strip";

export const metadata = { title: "Your path" };

const C = JOURNEY_COPY.path;

export default async function PathPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { user } = await requireWorkspace(wid);
  const path = await loadPath(wid, user.id);
  const base = `/app/w/${wid}`;
  const back = `${base}/path`;
  const loop = [
    { label: C.loopClicks, value: path.loop.clicks, sub: C.last30, href: `${base}/growth` },
    { label: C.loopLeads, value: path.loop.leads, sub: C.last30, href: `${base}/leads` },
    { label: C.loopCustomers, value: path.loop.customers, sub: C.fromCheckin, href: `${base}/growth` },
  ];
  const cur = path.current;
  const curDay = cur ? path.days[cur.day - 1] : null;
  const openInCurrent = curDay ? curDay.steps.filter((s) => !s.done).length : 0;

  return (
    <>
      <PageHead eyebrow={C.eyebrow} title={C.title} sub={pathIntro(path)} />
      <Flash searchParams={await searchParams} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <WeekStrip days={path.days} current={cur?.day ?? null} size="lg" wid={wid} className="min-w-0 flex-1 basis-72" />
          <span className="text-sm font-semibold text-muted-foreground tabular-nums">{fill(JOURNEY_COPY.strip.pathCount, { done: path.done, total: path.total })}</span>
        </div>
        <TickLegend />
      </div>

      {path.state === "veteran" ? (
        <Callout
          tone="info"
          action={
            <form action={startDayAction.bind(null, wid, 1)}>
              <input type="hidden" name="back" value={back} />
              <SubmitButton variant="outline" size="sm">
                {C.veteranStart}
              </SubmitButton>
            </form>
          }
        >
          {C.veteranLine}
        </Callout>
      ) : (
        <JourneyHero path={path} wid={wid} back={back} />
      )}

      <ol className="flex flex-col gap-3" aria-label={C.eyebrow}>
        {path.days.map((day) => {
          const isCurrent = day.day === cur?.day && path.state !== "dayDone";
          // A day ahead of unfinished work opens as normal, with one quiet line about the earlier one.
          const ahead = curDay && day.day > curDay.day && !day.complete && openInCurrent > 0;
          return (
            <li key={day.day} id={`day-${day.day}`} className="scroll-mt-20">
              <details
                open={isCurrent}
                className={cn(
                  "group/stage overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-ink/[0.06] transition-shadow duration-200 open:shadow-lift dark:ring-white/[0.07]",
                  isCurrent && "ring-2 ring-primary/25 dark:ring-primary/45",
                )}
              >
                <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-4 transition-colors select-none hover:bg-accent/40 md:px-5 [&::-webkit-details-marker]:hidden">
                  <span
                    className={cn(
                      "grid size-11 shrink-0 place-items-center rounded-[14px] ring-1 ring-inset",
                      day.complete
                        ? "bg-success-soft text-success ring-success/15"
                        : isCurrent
                          ? "bg-primary text-primary-foreground shadow-press ring-white/10"
                          : "bg-muted text-muted-foreground ring-ink/[0.04] dark:ring-white/[0.05]",
                    )}
                  >
                    {day.complete ? <CheckIcon className="size-5" strokeWidth={2.5} aria-hidden /> : <span className="font-display text-[24px] leading-none tabular-nums">{day.day}</span>}
                  </span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[11.5px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{fill(C.dayTag, { day: day.day })}</span>
                      {isCurrent ? <Badge variant="soft">{C.youreHere}</Badge> : day.complete ? <Badge variant="success">{C.done}</Badge> : null}
                      {/* Course unlocks: when this day's lesson opens in Skool. The app's tools stay open. */}
                      {day.opens && !day.complete ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock3Icon className="size-3" aria-hidden />
                          {day.opens}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[16.5px] leading-snug font-semibold tracking-[-0.011em]">{day.title}</span>
                  </span>
                  <span className={cn("text-xs font-semibold tabular-nums", day.complete ? "text-success" : "text-muted-foreground")}>{fill(C.count, { done: day.done, total: day.total })}</span>
                  <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/stage:rotate-180" aria-hidden />
                </summary>
                <div className="flex flex-col gap-2 border-t border-border/80 bg-background/40 px-2 py-2.5 md:px-3">
                  {ahead && curDay ? (
                    <p className="px-2.5 pt-1 text-[13px] text-muted-foreground">
                      {fill(JOURNEY_COPY.row.aheadNote, {
                        day: curDay.day,
                        open: openInCurrent === 1 ? JOURNEY_COPY.row.oneStep : fill(JOURNEY_COPY.row.manySteps, { n: openInCurrent }),
                      })}
                    </p>
                  ) : null}
                  <ul className="flex flex-col gap-1">
                    {day.steps.map((step) => (
                      <StepRow key={step.key} step={step} wid={wid} back={back} current={step.key === cur?.key && path.state !== "dayDone"} variant="path" />
                    ))}
                  </ul>
                </div>
              </details>
            </li>
          );
        })}
      </ol>

      <details className="group/after overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
        <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-4 transition-colors select-none hover:bg-accent/40 md:px-5 [&::-webkit-details-marker]:hidden">
          <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-muted text-muted-foreground ring-1 ring-ink/[0.04] ring-inset dark:ring-white/[0.05]">
            <FlagIcon className="size-[18px]" aria-hidden />
          </span>
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-[16.5px] leading-snug font-semibold tracking-[-0.011em]">{C.afterTitle}</span>
            <span className="text-[13px] text-muted-foreground">{C.afterSub}</span>
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/after:rotate-180" aria-hidden />
        </summary>
        <ul className="flex flex-col gap-1 border-t border-border/80 bg-background/40 px-2 py-2.5 md:px-3">
          {path.after.map((step) => (
            <li key={step.key}>
              <Link href={step.href} className="flex items-start gap-3 rounded-xl px-2.5 py-2.5 text-sm text-foreground transition-colors duration-150 hover:bg-card hover:no-underline">
                <Tick tick={step.done ? "app" : null} className="mt-px" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("font-medium", step.done && "text-foreground/80")}>{step.title}</span>
                  <span className="text-[13px] leading-relaxed text-muted-foreground">{step.why}</span>
                </span>
                {step.done ? null : <span className="shrink-0 text-[11px] text-muted-foreground">{C.ticksItself}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </details>

      {loop.some((x) => x.value > 0) ? (
        <Panel icon={TrendingUpIcon} tone="success" title={C.loopTitle} sub={C.loopSub}>
          <ol className="grid grid-cols-1 gap-3 @xl/main:grid-cols-3">
            {loop.map((node, i) => (
              <li key={node.label} className="relative">
                <Link
                  href={node.href}
                  className="group flex h-full flex-col gap-1 rounded-xl bg-background/60 px-4 py-3.5 text-foreground ring-1 ring-ink/[0.06] transition-[background-color,box-shadow] duration-150 hover:bg-card hover:no-underline hover:shadow-card hover:ring-primary/25 dark:ring-white/[0.07]"
                >
                  <span className="text-[13px] font-medium text-muted-foreground">{node.label}</span>
                  <span className="font-display text-[34px] leading-none tracking-[-0.01em] tabular-nums">{node.value.toLocaleString()}</span>
                  <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    {node.sub}
                    <ArrowRightIcon className="size-3.5 text-subtle-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                  </span>
                </Link>
                {i < loop.length - 1 ? (
                  <ArrowRightIcon
                    className="absolute top-1/2 -right-[18px] z-10 hidden size-6 -translate-y-1/2 rounded-full bg-card p-1 text-subtle-foreground shadow-xs ring-1 ring-ink/[0.06] @xl/main:block dark:ring-white/[0.08]"
                    aria-hidden
                  />
                ) : null}
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}
    </>
  );
}
