import Link from "next/link";
import { ArrowRightIcon, CalendarRangeIcon, CheckIcon, ChevronDownIcon, FlagIcon, LockIcon, RouteIcon, TrendingUpIcon, TrophyIcon, type LucideIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { computePath, stageBadge } from "@/server/path";
import { getEntryTicket } from "@/server/unlocks";
import { cn } from "@/lib/utils";
import { Flash, NextStep, PageHead, Panel } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const metadata = { title: "Your path" };

/** Stage badges that are pictures, not numbers (see stageBadge). */
const BADGE_ICON: Record<"calendar" | "flag", LucideIcon> = { calendar: CalendarRangeIcon, flag: FlagIcon };

export default async function PathPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace, user } = await requireWorkspace(wid);
  const path = await computePath(workspace, user.id, { entryTicketOn: Boolean((await getEntryTicket())?.on) });
  const pct = Math.round((path.done / path.total) * 100);
  const loop = [
    { label: "Skool link clicks", value: path.loop.clicks, sub: "last 30 days", href: `/app/w/${wid}/growth` },
    { label: "Leads", value: path.loop.leads, sub: "last 30 days", href: `/app/w/${wid}/leads` },
    { label: "New customers", value: path.loop.customers, sub: "from your Monday check-in", href: `/app/w/${wid}/growth` },
  ];
  const loopEmpty = loop.every((n) => n.value === 0);
  const currentStage = path.stages.find((st) => st.steps.some((s) => s.key === path.next?.key))?.key;
  let n = 0;

  return (
    <>
      <PageHead
        eyebrow="The Skool Growth Ladder, inside your app"
        title="Your path"
        sub="The course, step by step. Every step ticks itself off when you do it, so you always know the one next thing. Lesson numbers match the classroom."
      />
      <Flash searchParams={await searchParams} />

      {path.next ? (
        <NextStep eyebrow={`Up next · Lesson ${path.next.lesson}`} title={path.next.title} body={path.next.why} href={path.next.href} cta="Do it now" icon={RouteIcon}>
          {/* How far along: a glass strip on the night panel. */}
          <div className="flex flex-col gap-2.5 rounded-2xl bg-white/[0.07] px-4 py-3.5 ring-1 ring-white/10 backdrop-blur-sm">
            <div className="flex items-baseline justify-between gap-3 text-sm text-white/80">
              <span>
                <b className="font-semibold text-white">{path.done}</b> of {path.total} steps <span className="px-1 text-white/40">·</span> Skool level{" "}
                <b className="font-semibold text-white">{path.level}</b>
              </span>
              <span className="font-semibold text-white tabular-nums">{pct}%</span>
            </div>
            <Progress value={pct} aria-label="Path progress" className="h-1.5 bg-white/15 ring-0 *:data-[slot=progress-indicator]:bg-pink-300" />
          </div>
        </NextStep>
      ) : (
        <Card className="bg-success-soft ring-success/25 dark:ring-success/25">
          <CardContent className="flex items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-success text-white dark:text-background">
              <TrophyIcon className="size-6" aria-hidden />
            </span>
            <div className="grid gap-0.5">
              <span className="font-display text-[28px] leading-tight">{path.done >= path.total ? "Every step done." : "Every to-do done."}</span>
              <span className="text-sm text-foreground/75">
                {path.done >= path.total ? "" : "The rest tick themselves as your Skool numbers grow. "}Keep the weekly rhythm: Monday check-in, one new ad, one Unlock.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="stages" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="stages" className="eyebrow">
            Every stage
          </h2>
          <span className="text-xs text-muted-foreground">Open a stage to see its steps. Each one links to where you do it.</span>
        </div>
        <ol className="flex flex-col gap-3">
          {path.stages.map((stage) => {
            const done = stage.steps.filter((s) => s.done).length;
            const complete = done === stage.steps.length;
            const isCurrent = stage.key === currentStage;
            const badge = stageBadge(stage);
            const BadgeIcon = BADGE_ICON[badge.icon ?? "flag"];
            return (
              <li key={stage.key}>
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
                        complete
                          ? "bg-success-soft text-success ring-success/15"
                          : isCurrent
                            ? "bg-primary text-primary-foreground shadow-press ring-white/10"
                            : "bg-muted text-muted-foreground ring-ink/[0.04] dark:ring-white/[0.05]",
                      )}
                    >
                      {complete ? (
                        <CheckIcon className="size-5" strokeWidth={2.5} aria-hidden />
                      ) : badge.num ? (
                        <span className="font-display text-[24px] leading-none tabular-nums">{badge.num}</span>
                      ) : (
                        <BadgeIcon className="size-[18px]" aria-hidden />
                      )}
                    </span>
                    <span className="grid min-w-0 flex-1 gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[11.5px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{stage.tag}</span>
                        {isCurrent ? <Badge variant="soft">You&apos;re here</Badge> : complete ? <Badge variant="success">Done</Badge> : null}
                      </span>
                      <span className="text-[16.5px] leading-snug font-semibold tracking-[-0.011em]">{stage.title}</span>
                    </span>
                    <span className="hidden w-28 flex-col items-end gap-2 sm:flex">
                      <span className={cn("text-xs font-semibold tabular-nums", complete ? "text-success" : "text-muted-foreground")}>
                        {done} of {stage.steps.length}
                      </span>
                      <Progress value={(done / stage.steps.length) * 100} aria-hidden className={cn("h-1.5", complete && "*:data-[slot=progress-indicator]:bg-success")} />
                    </span>
                    <span className={cn("text-xs font-semibold tabular-nums sm:hidden", complete ? "text-success" : "text-muted-foreground")}>
                      {done}/{stage.steps.length}
                    </span>
                    <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/stage:rotate-180" aria-hidden />
                  </summary>
                  <ul className="flex flex-col gap-1 border-t border-border/80 bg-background/40 px-2 py-2.5 md:px-3">
                    {stage.steps.map((step) => {
                      n += 1;
                      const isNext = path.next?.key === step.key;
                      return (
                        <li key={step.key}>
                          <Link
                            href={step.href}
                            className={cn(
                              "flex items-start gap-3.5 rounded-xl px-3 py-3 text-sm text-foreground transition-colors duration-150 hover:bg-card hover:no-underline hover:shadow-xs",
                              isNext && "bg-card shadow-card ring-1 ring-primary/20 hover:bg-card dark:ring-primary/40",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-px grid size-6 shrink-0 place-items-center rounded-full border text-[11.5px] font-semibold tabular-nums",
                                step.done
                                  ? "border-success bg-success text-white dark:text-background"
                                  : isNext
                                    ? "border-primary bg-primary text-primary-foreground shadow-press"
                                    : "border-border-strong bg-card text-muted-foreground",
                              )}
                            >
                              {step.done ? <CheckIcon className="size-3.5" strokeWidth={3} aria-hidden /> : n}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className={cn("font-medium", step.done && "text-muted-foreground line-through decoration-foreground/25", isNext && "font-semibold")}>{step.title}</span>
                              <span className="text-[13px] leading-relaxed text-muted-foreground">{step.why}</span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-1.5">
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                                  isNext ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
                                )}
                              >
                                Lesson {step.lesson}
                              </span>
                              {step.locked && !step.done ? (
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <LockIcon className="size-3" aria-hidden /> {step.locked}
                                </span>
                              ) : isNext ? (
                                <span className="flex items-center gap-1 text-[11.5px] font-semibold text-primary dark:text-violet-300">
                                  Up next <ArrowRightIcon className="size-3" aria-hidden />
                                </span>
                              ) : step.kind === "outcome" && !step.done ? (
                                // Outcomes wait on Skool's numbers, so Up next walks past them.
                                <span className="text-[11px] text-muted-foreground">Ticks itself</span>
                              ) : null}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </li>
            );
          })}
        </ol>
      </section>

      <Panel
        icon={TrendingUpIcon}
        tone="success"
        title="The Skool Loop, live"
        sub={
          loopEmpty
            ? "Ad → Skool link → lead → customer. The numbers fill in once your first ad runs."
            : "Ad → Skool link → lead → customer. Each number opens where it comes from."
        }
      >
        {loopEmpty ? (
          <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="The Skool Loop">
            {loop.map(({ label }, i) => (
              <li key={label} className="flex items-center gap-2">
                <span className="rounded-full border border-dashed border-border-strong bg-background/60 px-3.5 py-1.5 font-medium text-muted-foreground">{label}</span>
                {i < loop.length - 1 ? <ArrowRightIcon className="size-3.5 text-subtle-foreground" aria-hidden /> : null}
              </li>
            ))}
          </ol>
        ) : (
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
        )}
      </Panel>
    </>
  );
}
