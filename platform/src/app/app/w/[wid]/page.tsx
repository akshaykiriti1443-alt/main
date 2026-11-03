import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import {
  ArrowRightIcon,
  BotIcon,
  ChartNoAxesColumnIcon,
  EyeIcon,
  FlameIcon,
  GiftIcon,
  GlobeIcon,
  LinkIcon,
  MailIcon,
  MegaphoneIcon,
  RouteIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
  TrendingUpIcon,
  UsersIcon,
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
import { Empty, Flash, LessonTag, NextStep, PageHead, Panel, Stat, StepDot, TempBadge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** A picture for each step of the path, so the big "do this next" card isn't just words. */
const STEP_ICON: Record<string, LucideIcon> = {
  ai: BotIcon,
  hello: UsersIcon,
  kit: SparklesIcon,
  skool: LinkIcon,
  publish: GlobeIcon,
  price: TagIcon,
  research: SearchIcon,
  review: MegaphoneIcon,
  unlock: GiftIcon,
  sync: UsersIcon,
};

export default async function Dashboard({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace, user } = await requireWorkspace(wid);
  const db = await getDb();
  const [stats, recent, path] = await Promise.all([
    workspaceStats(wid),
    db.select().from(contacts).where(eq(contacts.workspaceId, wid)).orderBy(desc(contacts.createdAt)).limit(6),
    computePath(workspace, user.id, { entryTicketOn: Boolean((await getEntryTicket())?.on) }),
  ]);
  const max = Math.max(1, ...stats.series.map((d) => d.views));
  const base = `/app/w/${wid}`;
  const steps = path.stages.flatMap((st) => st.steps.map((step) => ({ ...step, tag: st.tag })));
  const next = path.next;
  // Numbers only mean something once there are some. Until then the page is a "Start here".
  const hasData = stats.views > 0 || stats.contactsTotal > 0 || stats.emailsSent > 0 || recent.length > 0;
  const firstName = (user.name ?? "").trim().split(/\s+/)[0];
  const pct = Math.round((path.done / path.total) * 100);
  const isLive = steps.some((s) => s.key === "publish" && s.done);

  // A short window of the path: the last ticked step (so you see progress), then what's next.
  const nextIndex = next ? steps.findIndex((s) => s.key === next.key) : steps.length;
  const from = Math.max(0, nextIndex - 1);
  const peek = steps.slice(from, from + 5);

  const nextCard = next ? (
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
        const isNext = step.key === next?.key;
        return (
          <li key={step.key}>
            <Link
              href={step.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm text-foreground transition-colors hover:bg-muted hover:no-underline",
                isNext && "bg-accent ring-1 ring-primary/15 hover:bg-accent",
              )}
            >
              <StepDot n={from + i + 1} done={step.done} active={isNext} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("font-medium", step.done && "text-muted-foreground line-through decoration-foreground/30")}>{step.title}</span>
                {isNext ? <span className="truncate text-xs text-muted-foreground">{step.why}</span> : null}
              </span>
              <span className="hidden rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums sm:inline">Lesson {step.lesson}</span>
              {isNext ? <ArrowRightIcon className="size-4 shrink-0 text-primary" aria-hidden /> : null}
            </Link>
          </li>
        );
      })}
    </ol>
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

        <div className="grid gap-5 @3xl/main:grid-cols-5">
          <Panel
            className="@3xl/main:col-span-3"
            title="Your first steps"
            sub={`${path.done} of ${path.total} done. Each one ticks itself off when you do it.`}
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link href={`${base}/path`}>
                  See your whole path <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            }
          >
            <div className="flex items-center gap-3">
              <Progress value={pct} aria-label="Path progress" className="flex-1" />
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">{pct}%</span>
            </div>
            {pathList}
          </Panel>

          <Card className="relative overflow-hidden @3xl/main:col-span-2">
            <CardContent className="flex h-full flex-col gap-5">
              <div className="grid gap-1">
                <h2 className="text-[17px]">Your numbers live here</h2>
                <p className="text-sm text-muted-foreground">
                  {isLive
                    ? "Your funnel is live. Share its link and the first views, leads and hot leads land here as they come in."
                    : "Page views, leads and hot leads show up the moment your funnel is live. No wall of zeros until then."}
                </p>
              </div>
              {/* A ghost preview of what's coming, so the empty state shows the future instead of nothing. */}
              <div aria-hidden className="relative mt-auto rounded-2xl border border-dashed border-foreground/15 bg-muted/40 p-4">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: EyeIcon, label: "Views" },
                    { icon: UsersIcon, label: "Leads" },
                    { icon: FlameIcon, label: "Hot" },
                  ].map((t) => (
                    <div key={t.label} className="flex flex-col gap-2 rounded-xl bg-card p-2.5 shadow-card ring-1 ring-foreground/[0.06]">
                      <t.icon className="size-3.5 text-primary/70" />
                      <span className="h-2.5 w-8 rounded-full bg-foreground/10" />
                      <span className="text-[10px] font-medium text-muted-foreground">{t.label}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex h-16 items-end gap-1.5">
                  {[22, 35, 28, 46, 40, 58, 52, 70, 64, 86].map((h, i) => (
                    <span key={i} className="flex-1 rounded-t-md bg-primary/15" style={{ height: `${h}%` }} />
                  ))}
                </div>
                <span className="absolute -top-2.5 right-4 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-[oklch(0.35_0.08_70)] shadow-sm">Preview</span>
              </div>
              <Button variant="outline" asChild className="self-start">
                <Link href={`${base}/sites`}>
                  <ChartNoAxesColumnIcon data-icon="inline-start" />
                  Go to Funnels & pages
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead eyebrow={workspace.name} title="Dashboard" sub="How your funnel did over the last 14 days." />
      <Flash searchParams={await searchParams} />
      {nextCard}

      <div className="grid grid-cols-2 gap-3 md:gap-4 @2xl/main:grid-cols-4">
        <Stat icon={EyeIcon} label="Page views" value={stats.views.toLocaleString()} />
        <Stat icon={UsersIcon} tone="success" label="Leads" value={stats.leads.toLocaleString()} hint={`${stats.conversion.toFixed(1)}% opt-in rate`} />
        <Stat icon={FlameIcon} tone="hot" label="Hot leads" value={stats.hot.toLocaleString()} hint={`${stats.warm} warm · ${stats.contactsTotal} total`} />
        <Stat icon={MailIcon} tone="gold" label="Emails sent" value={stats.emailsSent.toLocaleString()} hint={stats.unread ? `${stats.unread} unread messages` : undefined} />
      </div>

      <div className="grid gap-5 @3xl/main:grid-cols-5">
        <Panel
          className="@3xl/main:col-span-3"
          icon={TrendingUpIcon}
          title="Views and leads"
          sub="Daily, last 14 days"
          action={
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-primary" /> Leads
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-chart-2" /> Views
              </span>
            </div>
          }
        >
          <div className="relative grid h-48 auto-cols-fr grid-flow-col items-end gap-1.5" role="img" aria-label="Daily page views and leads for the last 14 days">
            {stats.views === 0 ? (
              <p className="absolute inset-0 grid place-items-center pb-6 text-center text-sm text-muted-foreground">No visits yet. Share your funnel link to see traffic here.</p>
            ) : null}
            {stats.series.map((d) => (
              <div key={d.day} className="group flex h-full flex-col justify-end" title={`${d.day}: ${d.views} views, ${d.leads} leads`}>
                <div className="flex flex-1 flex-col justify-end overflow-hidden rounded-t-md">
                  <div className="min-h-0.5 bg-chart-2 transition-opacity group-hover:opacity-80" style={{ height: `${(Math.max(0, d.views - d.leads) / max) * 100}%` }} />
                  <div className="bg-primary transition-opacity group-hover:opacity-80" style={{ height: `${(d.leads / max) * 100}%` }} />
                </div>
                <div className="mt-1.5 text-center text-[10px] text-muted-foreground tabular-nums">{d.day.slice(8)}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          className="@3xl/main:col-span-2"
          icon={RouteIcon}
          title="Your path"
          sub={`${path.done} of ${path.total} steps · Skool level ${path.level}`}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${base}/path`}>
                See it all <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          }
        >
          <Progress value={pct} aria-label="Path progress" />
          {next ? pathList : <p className="text-sm text-muted-foreground">Every step done. Keep the weekly rhythm going.</p>}
          {next ? <LessonTag lesson={next.lesson} stage={steps[nextIndex]?.tag} className="self-start" /> : null}
        </Panel>
      </div>

      <Panel
        icon={UsersIcon}
        tone="success"
        title="Newest leads"
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link href={`${base}/leads`}>
              All leads <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        }
      >
        {recent.length === 0 ? (
          <Empty icon={UsersIcon} title="No leads yet" body="Share your funnel link. Every sign-up lands here, hottest first." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Temperature</TableHead>
                <TableHead className="text-right">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`${base}/leads/${c.id}`} className="font-medium text-foreground hover:text-primary">
                      {contactName(c)}
                    </Link>
                    <div className="text-xs text-muted-foreground">{c.email ?? c.phone ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">{c.source.replace("_", " ")}</TableCell>
                  <TableCell>
                    <TempBadge t={c.temperature} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{relativeTime(c.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
