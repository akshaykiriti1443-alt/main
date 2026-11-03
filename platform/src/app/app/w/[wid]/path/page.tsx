import Link from "next/link";
import { ArrowRightIcon, CheckIcon, ChevronDownIcon, FlagIcon, LockIcon, RepeatIcon, RouteIcon, TrendingUpIcon, TrophyIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { computePath } from "@/server/path";
import { getEntryTicket } from "@/server/unlocks";
import { cn } from "@/lib/utils";
import { Flash, NextStep, PageHead, Panel } from "@/components/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const metadata = { title: "Your path" };

export default async function PathPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace, user } = await requireWorkspace(wid);
  const path = await computePath(workspace, user.id, { entryTicketOn: Boolean((await getEntryTicket())?.on) });
  const pct = Math.round((path.done / path.total) * 100);
  const loop = [
    { label: "Skool link clicks", value: path.loop.clicks, sub: "last 30 days", href: `/app/w/${wid}/growth` },
    { label: "Leads", value: path.loop.leads, sub: "last 30 days", href: `/app/w/${wid}/leads` },
    { label: "On trial", value: path.loop.trials, sub: "in Skool", href: `/app/w/${wid}/skool` },
    { label: "Paying", value: path.loop.paying, sub: "members", href: `/app/w/${wid}/skool` },
    { label: "Cancelling", value: path.loop.cancelling, sub: "worth saving", href: `/app/w/${wid}/leads?tag=skool-cancelling` },
    { label: "Churned", value: path.loop.churned, sub: "win-back list", href: `/app/w/${wid}/leads?stage=lost` },
  ];
  const loopEmpty = loop.every((n) => n.value === 0) && path.loop.wonBack === 0;
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
          <div className="flex flex-col gap-2 rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/15">
            <div className="flex items-baseline justify-between gap-3 text-sm text-white/90">
              <span>
                <b className="text-white">{path.done}</b> of {path.total} steps · Skool level <b className="text-white">{path.level}</b>
              </span>
              <span className="font-semibold tabular-nums">{pct}%</span>
            </div>
            <Progress value={pct} aria-label="Path progress" className="bg-white/20 ring-0 *:data-[slot=progress-indicator]:bg-[oklch(0.82_0.17_150)]" />
          </div>
        </NextStep>
      ) : (
        <Card className="bg-success-soft ring-success/30">
          <CardContent className="flex items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-success text-white dark:text-background">
              <TrophyIcon className="size-6" aria-hidden />
            </span>
            <p>
              <b className="font-heading text-lg">Every step done.</b>
              <br />
              Keep the weekly rhythm: Monday check-in, one new ad, one Unlock, member sync.
            </p>
          </CardContent>
        </Card>
      )}

      <ol className="flex flex-col gap-3">
        {path.stages.map((stage) => {
          const done = stage.steps.filter((s) => s.done).length;
          const complete = done === stage.steps.length;
          const isCurrent = stage.key === currentStage;
          const num = stage.tag.match(/\d+/)?.[0];
          return (
            <li key={stage.key}>
              <details
                open={isCurrent}
                className={cn(
                  "group/stage overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-foreground/[0.07] transition-shadow",
                  isCurrent && "ring-2 ring-primary/30",
                )}
              >
                <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-4 select-none hover:bg-muted/40 md:px-5 [&::-webkit-details-marker]:hidden">
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-xl font-heading text-base font-bold",
                      complete ? "bg-success text-white dark:text-background" : isCurrent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {complete ? <CheckIcon className="size-5" strokeWidth={3} aria-hidden /> : num ?? <FlagIcon className="size-4.5" aria-hidden />}
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-[11px] font-bold tracking-[0.09em] text-muted-foreground uppercase">
                      {stage.tag}
                      {isCurrent ? <span className="ml-2 rounded-full bg-accent px-1.5 py-px text-[10px] tracking-normal text-accent-foreground normal-case">You&apos;re here</span> : null}
                    </span>
                    <span className="font-heading text-[17px] leading-snug font-semibold">{stage.title}</span>
                  </span>
                  <span className="hidden w-24 flex-col items-end gap-1.5 sm:flex">
                    <span className={cn("text-xs font-semibold tabular-nums", complete ? "text-success" : "text-muted-foreground")}>
                      {done}/{stage.steps.length}
                    </span>
                    <Progress value={(done / stage.steps.length) * 100} aria-hidden className="h-1.5" />
                  </span>
                  <span className={cn("text-xs font-semibold tabular-nums sm:hidden", complete ? "text-success" : "text-muted-foreground")}>
                    {done}/{stage.steps.length}
                  </span>
                  <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open/stage:rotate-180" aria-hidden />
                </summary>
                <ul className="flex flex-col gap-0.5 border-t px-2 py-2 md:px-3">
                  {stage.steps.map((step) => {
                    n += 1;
                    const isNext = path.next?.key === step.key;
                    return (
                      <li key={step.key}>
                        <Link
                          href={step.href}
                          className={cn(
                            "flex items-start gap-3 rounded-xl px-2.5 py-2.5 text-sm text-foreground transition-colors hover:bg-muted hover:no-underline",
                            isNext && "bg-accent hover:bg-accent/80",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-px grid size-6 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold tabular-nums",
                              step.done ? "border-success bg-success text-white dark:text-background" : isNext ? "border-primary text-primary" : "border-foreground/15 text-muted-foreground",
                            )}
                          >
                            {step.done ? <CheckIcon className="size-3.5" strokeWidth={3} /> : n}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className={cn("font-medium", step.done && "text-muted-foreground line-through decoration-foreground/30", isNext && "font-semibold")}>{step.title}</span>
                            <span className="text-xs text-muted-foreground">{step.why}</span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums", isNext ? "bg-card text-primary shadow-xs" : "bg-muted text-muted-foreground")}>Lesson {step.lesson}</span>
                            {step.locked && !step.done ? (
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <LockIcon className="size-3" /> {step.locked}
                              </span>
                            ) : isNext ? (
                              <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
                                Up next <ArrowRightIcon className="size-3" />
                              </span>
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

      <Panel
        icon={TrendingUpIcon}
        tone="success"
        title="The Skool Loop, live"
        sub={
          loopEmpty
            ? "Ad → Skool link → lead → trial → paying. The numbers fill in once your first ad runs."
            : "Ad → Skool link → lead → trial → paying → (cancelling → churned → won back). Each number opens the people behind it."
        }
      >
        {loopEmpty ? (
          <ol className="flex flex-wrap items-center gap-1.5 text-sm" aria-label="The Skool Loop">
            {[...loop.map((l) => l.label), "Won back"].map((label, i, all) => (
              <li key={label} className="flex items-center gap-1.5">
                <span className={cn("rounded-full px-3 py-1 font-medium", label === "Won back" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>{label}</span>
                {i < all.length - 1 ? <ArrowRightIcon className="size-3.5 text-muted-foreground/60" aria-hidden /> : null}
              </li>
            ))}
          </ol>
        ) : (
          <ol className="grid grid-cols-2 gap-2 @xl/main:grid-cols-4 @4xl/main:grid-cols-7">
            {loop.map((node) => (
              <li key={node.label}>
                <Link href={node.href} className="flex h-full flex-col rounded-xl border bg-card px-3 py-2.5 text-foreground transition-colors hover:border-primary hover:no-underline">
                  <span className="text-xs text-muted-foreground">{node.label}</span>
                  <span className="font-heading text-2xl font-bold tabular-nums">{node.value.toLocaleString()}</span>
                  <span className="text-[11px] text-muted-foreground">{node.sub}</span>
                </Link>
              </li>
            ))}
            <li>
              <span className="flex h-full flex-col rounded-xl border border-success/40 bg-success-soft px-3 py-2.5">
                <span className="flex items-center gap-1 text-xs text-success">
                  <RepeatIcon className="size-3" aria-hidden /> Won back
                </span>
                <span className="font-heading text-2xl font-bold tabular-nums">{path.loop.wonBack.toLocaleString()}</span>
                <span className="text-[11px] text-muted-foreground">came back and paid</span>
              </span>
            </li>
          </ol>
        )}
      </Panel>
    </>
  );
}
