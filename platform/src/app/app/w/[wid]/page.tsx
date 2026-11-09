import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import {
  ArrowRightIcon,
  BotIcon,
  CalendarRangeIcon,
  ChartNoAxesColumnIcon,
  EyeIcon,
  FlameIcon,
  GiftIcon,
  GlobeIcon,
  LinkIcon,
  LockIcon,
  MousePointerClickIcon,
  MailIcon,
  MegaphoneIcon,
  PaletteIcon,
  RouteIcon,
  SearchIcon,
  SparklesIcon,
  TrendingUpIcon,
  UserCheckIcon,
  UsersIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { workspaceStats } from "@/server/analytics";
import { contactName } from "@/server/contacts";
import { computePath } from "@/server/path";
import { getEntryTicket } from "@/server/unlocks";
import { relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Empty, Flash, IconTile, LessonTag, NextStep, PageHead, Panel, Stat, StepDot, TempBadge } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** A picture for each step of the path, so the big "do this next" card isn't just words. */
const STEP_ICON: Record<string, LucideIcon> = {
  ai: BotIcon,
  hello: UsersIcon,
  kit: SparklesIcon,
  skool: LinkIcon,
  publish: GlobeIcon,
  lead1: UserCheckIcon,
  research: SearchIcon,
  statics: PaletteIcon,
  clicks: MousePointerClickIcon,
  review: MegaphoneIcon,
  automations: WorkflowIcon,
  unlock: GiftIcon,
  email4: MailIcon,
};

/** Initials for a lead's avatar. */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export default async function Dashboard({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace, user } = await requireWorkspace(wid);
  const db = await getDb();
  const [stats, recent, path] = await Promise.all([
    workspaceStats(wid),
    db.select().from(contacts).where(eq(contacts.workspaceId, wid)).orderBy(desc(contacts.createdAt)).limit(6),
    computePath(workspace, user.id, { entryTicketOn: Boolean((await getEntryTicket())?.on) }),
  ]);
  // The tallest bar sets the scale (leads can outnumber tracked views, e.g. ad blockers).
  const max = Math.max(1, ...stats.series.map((d) => Math.max(d.views, d.leads)));
  const base = `/app/w/${wid}`;
  const steps = path.stages.flatMap((st) => st.steps.map((step) => ({ ...step, tag: st.tag })));
  const next = path.next;
  // Days 2 to 6: today's lesson takes the big card. It's a card, not a step: never counted, never ticks.
  const today = path.today;
  // Numbers only mean something once there are some. Until then the page is a "Start here".
  const hasData = stats.views > 0 || stats.contactsTotal > 0 || stats.emailsSent > 0 || recent.length > 0;
  const firstName = (user.name ?? "").trim().split(/\s+/)[0];
  const pct = Math.round((path.done / path.total) * 100);
  const isLive = steps.some((s) => s.key === "publish" && s.done);

  // A short window of the path: the last ticked step (so you see progress), then what's next.
  const nextIndex = next ? steps.findIndex((s) => s.key === next.key) : steps.length;
  const from = Math.max(0, nextIndex - 1);
  const peek = steps.slice(from, from + 5);

  const nextCard = today ? (
    <NextStep eyebrow={today.eyebrow} title={today.title} body={today.body} href={today.href} cta="Do it now" icon={CalendarRangeIcon} />
  ) : next ? (
    <NextStep
      eyebrow={`Up next · Lesson ${next.lesson}`}
      title={next.title}
      body={next.why}
      href={next.href}
      cta="Do it now"
      icon={STEP_ICON[next.key] ?? RouteIcon}
    />
  ) : null;

  const pathList = (
    <ol className="flex flex-col gap-1">
      {peek.map((step, i) => {
        const isNext = !today && step.key === next?.key;
        return (
          <li key={step.key}>
            <Link
              href={step.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm text-foreground transition-colors duration-150 hover:bg-accent/60 hover:no-underline",
                isNext && "bg-accent ring-1 ring-violet-200/80 hover:bg-accent dark:ring-white/[0.08]",
              )}
            >
              <StepDot n={from + i + 1} done={step.done} active={isNext} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("font-medium", step.done && "text-muted-foreground line-through decoration-foreground/25", isNext && "font-semibold")}>{step.title}</span>
                {isNext ? <span className="truncate text-xs text-muted-foreground">{step.why}</span> : null}
              </span>
              {step.locked && !step.done ? (
                // Locked to another plan: listed with its lock, never Up next.
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <LockIcon className="size-3" aria-hidden />
                  <span className="max-sm:sr-only">{step.locked}</span>
                </span>
              ) : (
                <span
                  className={cn(
                    "hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums sm:inline",
                    isNext ? "bg-card text-accent-foreground shadow-xs dark:bg-white/[0.06]" : "bg-muted text-muted-foreground",
                  )}
                >
                  Lesson {step.lesson}
                </span>
              )}
              {isNext ? <ArrowRightIcon className="size-4 shrink-0 text-primary transition-transform duration-150 group-hover:translate-x-0.5 dark:text-violet-300" aria-hidden /> : null}
            </Link>
          </li>
        );
      })}
    </ol>
  );

  const pathProgress = (
    <div className="flex items-center gap-3">
      <Progress value={pct} aria-label="Path progress" className="flex-1" />
      <span className="text-xs font-semibold text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );

  if (!hasData) {
    return (
      <>
        <PageHead
          eyebrow={workspace.name}
          title={firstName ? `Welcome, ${firstName}` : "Welcome"}
          sub="This is home base. Do one step at a time, in order, and this page fills itself in as you go."
        />
        <Flash searchParams={await searchParams} />
        {nextCard}

        <div className="grid gap-6 @3xl/main:grid-cols-5">
          <Panel
            className="@3xl/main:col-span-3"
            icon={RouteIcon}
            title="Your first steps"
            sub={`${path.done} of ${path.total} done. Each one ticks itself off when you do it.`}
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link href={`${base}/path`}>
                  Whole path <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            }
          >
            {pathProgress}
            {pathList}
          </Panel>

          <Card className="@3xl/main:col-span-2">
            <CardHeader>
              <div className="flex items-start gap-3">
                <IconTile icon={ChartNoAxesColumnIcon} tone="muted" className="-mt-0.5" />
                <div className="grid min-w-0 flex-1 gap-1">
                  <CardTitle>Your numbers live here</CardTitle>
                  <CardDescription>
                    {isLive
                      ? "Your funnel is live. Share its link and the first views, leads and hot leads land here as they come in."
                      : "Page views, leads and hot leads show up the moment your funnel is live. No wall of zeros until then."}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-5">
              {/* A ghost preview of what's coming, so the empty state shows the future instead of nothing. */}
              <div aria-hidden className="relative mt-auto rounded-2xl border border-dashed border-border-strong bg-[radial-gradient(90%_80%_at_50%_0%,var(--accent),transparent_75%)] p-4 pt-5 dark:bg-[radial-gradient(90%_80%_at_50%_0%,rgb(118_85_245/0.1),transparent_75%)]">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: EyeIcon, label: "Views", w: "w-9" },
                    { icon: UsersIcon, label: "Leads", w: "w-6" },
                    { icon: FlameIcon, label: "Hot", w: "w-4" },
                  ].map((t) => (
                    <div key={t.label} className="flex flex-col gap-2 rounded-xl bg-card p-2.5 shadow-card ring-1 ring-ink/[0.05] dark:ring-white/[0.06]">
                      <t.icon className="size-3.5 text-primary/70 dark:text-violet-300/80" />
                      <span className={cn("h-2.5 rounded-full bg-foreground/10", t.w)} />
                      <span className="text-[10.5px] font-medium text-muted-foreground">{t.label}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex h-16 items-end gap-1.5">
                  {[22, 35, 28, 46, 40, 58, 52, 70, 64, 86].map((h, i) => (
                    <span key={i} className="flex-1 rounded-t-[5px] bg-primary/15 dark:bg-primary/25" style={{ height: `${h}%` }} />
                  ))}
                </div>
                <Badge variant="gold" className="absolute -top-2.5 right-4 shadow-xs">
                  Preview
                </Badge>
              </div>
              <Button variant="outline" asChild className="self-start">
                <Link href={`${base}/sites`}>
                  Go to Funnels & pages
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const gridLines = [0.25, 0.5, 0.75, 1];

  return (
    <>
      <PageHead eyebrow={workspace.name} title={firstName ? `Welcome back, ${firstName}` : "Dashboard"} sub="How your funnel did over the last 14 days." />
      <Flash searchParams={await searchParams} />
      {nextCard}

      <div className="grid grid-cols-2 gap-3 md:gap-4 @2xl/main:grid-cols-4">
        <Stat icon={EyeIcon} label="Page views" value={stats.views.toLocaleString()} hint="Last 14 days" />
        <Stat icon={UsersIcon} tone="success" label="Leads" value={stats.leads.toLocaleString()} hint={`${stats.conversion.toFixed(1)}% opt-in rate`} />
        <Stat icon={FlameIcon} tone="hot" label="Hot leads" value={stats.hot.toLocaleString()} hint={`${stats.warm} warm · ${stats.contactsTotal} total`} />
        <Stat icon={MailIcon} tone="gold" label="Emails sent" value={stats.emailsSent.toLocaleString()} hint={stats.unread ? `${stats.unread} unread messages` : "Your follow-ups, on autopilot"} />
      </div>

      <div className="grid gap-6 @3xl/main:grid-cols-5">
        <Panel
          className="@3xl/main:col-span-3"
          icon={TrendingUpIcon}
          title="Views and leads"
          sub="Daily, last 14 days"
          action={
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-primary" /> Leads
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-chart-2" /> Views
              </span>
            </div>
          }
        >
          <div className="relative pt-2">
            {/* Hairline guides, so bar heights read at a glance. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-2 bottom-6">
              {gridLines.map((g) => (
                <span key={g} className="absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${g * 100}%` }} />
              ))}
              <span className="absolute inset-x-0 bottom-0 border-t border-border-strong" />
            </div>
            <div className="relative grid h-52 auto-cols-fr grid-flow-col items-end gap-1.5 @lg/main:gap-2" role="img" aria-label="Daily page views and leads for the last 14 days">
              {stats.views === 0 && stats.series.every((d) => d.leads === 0) ? (
                <p className="absolute inset-0 z-10 grid place-items-center pb-6 text-center">
                  <span className="rounded-full bg-card px-4 py-1.5 text-sm text-muted-foreground shadow-xs ring-1 ring-ink/[0.06] dark:ring-white/[0.08]">
                    No visits yet. Share your funnel link to see traffic here.
                  </span>
                </p>
              ) : null}
              {stats.series.map((d) => (
                <div key={d.day} className="group relative flex h-full min-w-0 flex-col justify-end" title={`${d.day}: ${d.views} views, ${d.leads} leads`}>
                  <div className="flex flex-1 flex-col justify-end overflow-hidden rounded-t-[6px]">
                    <div className="min-h-0.5 bg-chart-2 transition-opacity duration-150 group-hover:opacity-80" style={{ height: `${(Math.max(0, d.views - d.leads) / max) * 100}%` }} />
                    <div className="bg-primary transition-opacity duration-150 group-hover:opacity-85" style={{ height: `${(d.leads / max) * 100}%` }} />
                  </div>
                  <div className="mt-2 h-4 text-center text-[10.5px] text-subtle-foreground tabular-nums">{d.day.slice(8)}</div>
                  {d.views > 0 || d.leads > 0 ? (
                    <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 rounded-full bg-foreground px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap text-background opacity-0 shadow-lift transition-opacity duration-150 group-hover:opacity-100">
                      {d.views} views · {d.leads} leads
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          className="@3xl/main:col-span-2"
          icon={RouteIcon}
          title="Your path"
          sub={`${path.done} of ${path.total} steps · Growth Level ${path.level}`}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${base}/path`}>
                See it all <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          }
        >
          {pathProgress}
          {next || today ? (
            pathList
          ) : (
            <p className="text-sm text-muted-foreground">
              {path.done >= path.total ? "Every step done." : "Your to-dos are done. The rest tick themselves as your Skool numbers grow."} Keep the weekly rhythm going.
            </p>
          )}
          {today ? <LessonTag lesson={today.lesson} stage="Days 2–7" className="self-start" /> : next ? <LessonTag lesson={next.lesson} stage={steps[nextIndex]?.tag} className="self-start" /> : null}
        </Panel>
      </div>

      <Panel
        icon={UsersIcon}
        tone="success"
        title="Newest leads"
        sub="Everyone who signed up on your pages, newest first."
        action={
          <Button variant="secondary" size="sm" asChild>
            <Link href={`${base}/leads`}>
              All leads <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        }
      >
        {recent.length === 0 ? (
          <Empty icon={UsersIcon} title="No leads yet" body="Share your funnel link. Every sign-up lands here, hottest first." />
        ) : (
          <div className="-mx-6 -mb-6 border-t border-border/80 [&_tr>*:first-child]:pl-6 [&_tr>*:last-child]:pr-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead className="hidden @xl/main:table-cell">Source</TableHead>
                  <TableHead>Temperature</TableHead>
                  <TableHead className="text-right">Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((c) => {
                  const name = contactName(c);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            aria-hidden
                            className="grid size-8 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--violet-100),var(--pink-100))] text-[11px] font-semibold text-violet-700 dark:bg-none dark:bg-accent dark:text-accent-foreground"
                          >
                            {initials(name)}
                          </span>
                          <div className="grid min-w-0 leading-tight">
                            <Link href={`${base}/leads/${c.id}`} className="truncate font-medium text-foreground hover:text-primary hover:no-underline">
                              {name}
                            </Link>
                            <span className="truncate text-xs text-muted-foreground">{c.email ?? c.phone ?? ""}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground capitalize @xl/main:table-cell">{c.source.replace("_", " ")}</TableCell>
                      <TableCell>
                        <TempBadge t={c.temperature} />
                      </TableCell>
                      <TableCell className="text-right text-subtle-foreground">{relativeTime(c.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </>
  );
}
