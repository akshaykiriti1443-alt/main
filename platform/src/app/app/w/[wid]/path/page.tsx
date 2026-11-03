import Link from "next/link";
import { ArrowRightIcon, CheckIcon, LockIcon, RepeatIcon, TrophyIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { computePath } from "@/server/path";
import { getEntryTicket } from "@/server/unlocks";
import { cn } from "@/lib/utils";
import { Flash, PageHead, Panel } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  return (
    <>
      <PageHead
        eyebrow="The Skool Growth Ladder, inside your app"
        title="Your path"
        sub="The course, step by step. Every step ticks itself off when you do it, so you always know the one next thing. Lesson numbers match the classroom."
      />
      <Flash searchParams={await searchParams} />

      {path.next ? (
        <Card className="border-0 bg-linear-to-br from-primary to-primary/80 text-primary-foreground ring-0">
          <CardContent className="flex flex-col gap-4 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium tracking-wide text-primary-foreground/80 uppercase">Up next · Lesson {path.next.lesson}</span>
              <h2 className="text-xl font-semibold">{path.next.title}</h2>
              <p className="text-primary-foreground/85">{path.next.why}</p>
            </div>
            <Button variant="secondary" size="lg" asChild className="shrink-0">
              <Link href={path.next.href}>
                Do it now <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-success/40 bg-success-soft">
          <CardContent className="flex items-center gap-3 py-2">
            <TrophyIcon className="size-6 text-success" />
            <p>
              <b>Every step done.</b> Keep the weekly rhythm: Monday check-in, one new ad, one Unlock, member sync.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-sm">
          <span>
            <b>{path.done}</b> of {path.total} steps · Skool growth level <b>{path.level}</b>
          </span>
          <span className="text-muted-foreground tabular-nums">{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" aria-label="Path progress" />
      </div>

      <Panel title="The Skool Loop, live" sub="Ad → Skool link → lead → trial → paying → (cancelling → churned → won back). Each number opens the people behind it.">
        <ol className="flex flex-wrap items-stretch gap-2">
          {loop.map((n, i) => (
            <li key={n.label} className="flex items-center gap-2">
              <Link href={n.href} className="flex min-w-28 flex-col rounded-lg border bg-card px-3 py-2 hover:border-primary hover:no-underline">
                <span className="text-xs text-muted-foreground">{n.label}</span>
                <span className="text-xl font-semibold text-foreground tabular-nums">{n.value.toLocaleString()}</span>
                <span className="text-[11px] text-muted-foreground">{n.sub}</span>
              </Link>
              {i < loop.length - 1 ? <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <RepeatIcon className="size-4 shrink-0 text-success" aria-hidden />
            <span className="flex min-w-28 flex-col rounded-lg border border-success/40 bg-success-soft px-3 py-2">
              <span className="text-xs text-success">Won back</span>
              <span className="text-xl font-semibold tabular-nums">{path.loop.wonBack.toLocaleString()}</span>
              <span className="text-[11px] text-muted-foreground">came back and paid</span>
            </span>
          </li>
        </ol>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        {path.stages.map((stage) => {
          const done = stage.steps.filter((s) => s.done).length;
          const complete = done === stage.steps.length;
          return (
            <Card key={stage.key} className={cn(complete && "border-success/40")}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid gap-0.5">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{stage.tag}</span>
                    <h3 className="font-semibold">{stage.title}</h3>
                  </div>
                  <Badge variant="secondary" className={cn(complete && "bg-success-soft text-success")}>
                    {done}/{stage.steps.length}
                  </Badge>
                </div>
                <ul className="-mx-1 flex flex-col">
                  {stage.steps.map((step) => {
                    const isNext = path.next?.key === step.key;
                    return (
                      <li key={step.key}>
                        <Link
                          href={step.href}
                          className={cn(
                            "flex items-start gap-3 rounded-lg px-2 py-2 text-sm text-foreground transition-colors hover:bg-muted hover:no-underline",
                            isNext && "bg-accent text-accent-foreground hover:bg-accent/80",
                          )}
                        >
                          <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border", step.done && "border-success bg-success text-background", isNext && "border-primary")}>
                            {step.done ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className={cn("font-medium", step.done && "text-muted-foreground line-through")}>{step.title}</span>
                            <span className="text-xs text-muted-foreground">{step.why}</span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">Lesson {step.lesson}</span>
                            {step.locked && !step.done ? (
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <LockIcon className="size-3" /> {step.locked}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
