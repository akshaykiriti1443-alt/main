import Link from "next/link";
import { cookies } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { ArrowRightIcon, BookmarkIcon, ChartNoAxesColumnIcon, EyeIcon, FlameIcon, MailIcon, MousePointerClickIcon, TrendingUpIcon, UsersIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { workspaceStats } from "@/server/analytics";
import { contactName } from "@/server/contacts";
import { loadPath, type Path } from "@/server/path";
import { unlaterStepAction } from "@/actions/journey";
import { relativeTime } from "@/lib/util";
import { fill, JOURNEY_COPY } from "@/lib/week";
import { Callout, Empty, Flash, PageHead, Panel, Stat, TempBadge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WeekDone } from "@/components/journey/day-done";
import { JourneyHero } from "@/components/journey/journey-hero";
import { MarkSeen } from "@/components/journey/mark-seen";
import { TodayList } from "@/components/journey/today-list";
import { WaitingRow } from "@/components/journey/waiting-row";
import { WeekStrip } from "@/components/journey/week-strip";
import { WinLine } from "@/components/journey/win-line";
import { WEEK_SEEN_COOKIE } from "@/components/journey/wins";

const H = JOURNEY_COPY.home;

/** Initials for a lead's avatar. */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

type Recent = (typeof contacts.$inferSelect)[];

function LeadAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--violet-100),var(--pink-100))] text-[11px] font-semibold text-violet-700 dark:bg-none dark:bg-accent dark:text-accent-foreground"
    >
      {initials(name)}
    </span>
  );
}

/** "Saved for later: Connect your Meta Pixel · Do it now". */
function LaterLine({ path, wid, back }: { path: Path; wid: string; back: string }) {
  const steps = path.days.flatMap((d) => d.steps).filter((s) => s.later && s.key !== path.current?.key);
  if (!steps.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {steps.map((s) => (
        <li key={s.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground">
          <BookmarkIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="text-foreground/85">{fill(JOURNEY_COPY.later.line, { title: s.title })}</span>
          <span aria-hidden>·</span>
          <form action={unlaterStepAction.bind(null, wid, s.key)}>
            <input type="hidden" name="back" value={back} />
            <button type="submit" className="font-medium text-link underline-offset-4 hover:underline">
              {JOURNEY_COPY.later.doItNow}
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

/** During the week: drawn only once a real view or lead exists. No wall of zeros. */
function WeekResults({ wid, views, leads, clicks, recent }: { wid: string; views: number; leads: number; clicks: number; recent: Recent }) {
  const base = `/app/w/${wid}`;
  return (
    <Panel
      icon={TrendingUpIcon}
      tone="success"
      title={H.resultsTitle}
      sub={H.resultsSub}
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${base}/leads`}>
            {H.allLeads} <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 @xl/main:grid-cols-3">
        <Stat icon={EyeIcon} label="Page views" value={views.toLocaleString()} hint={H.viewsHint} />
        <Stat icon={UsersIcon} tone="success" label="Leads" value={leads.toLocaleString()} hint={H.leadsHint} />
        <Stat icon={MousePointerClickIcon} tone="gold" label="Skool link clicks" value={clicks.toLocaleString()} hint={H.clicksHint} />
      </div>
      {recent.length ? (
        <ul className="flex flex-col divide-y divide-border/80">
          {recent.slice(0, 3).map((c) => {
            const name = contactName(c);
            return (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <LeadAvatar name={name} />
                <span className="grid min-w-0 flex-1 leading-tight">
                  <Link href={`${base}/leads/${c.id}`} className="truncate text-sm font-medium text-foreground hover:text-primary hover:no-underline">
                    {name}
                  </Link>
                  <span className="truncate text-xs text-muted-foreground">{c.email ?? c.phone ?? ""}</span>
                </span>
                <span className="text-xs text-subtle-foreground">{relativeTime(c.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Panel>
  );
}

export default async function Dashboard({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace, user } = await requireWorkspace(wid);
  const db = await getDb();
  const [stats, recent, path, jar] = await Promise.all([
    workspaceStats(wid),
    db.select().from(contacts).where(eq(contacts.workspaceId, wid)).orderBy(desc(contacts.createdAt)).limit(6),
    loadPath(wid, user.id),
    cookies(),
  ]);
  const base = `/app/w/${wid}`;
  const firstName = (user.name ?? "").trim().split(/\s+/)[0];
  const flash = <Flash searchParams={await searchParams} />;

  // ---- During the week: a Today page. One next step, today's list, and real results only. ----
  if (path.mode === "week") {
    const cur = path.current;
    const day = path.days[(cur?.day ?? 1) - 1];
    const finished = path.state === "dayDone" ? path.days[day.day - 2] : null;
    const head = finished
      ? { title: fill(H.dayDoneTitle, { day: finished.day }), sub: H.dayDoneSub }
      : path.state === "first"
        ? { title: firstName ? fill(H.firstTitle, { name: firstName }) : H.firstTitleNoName, sub: H.firstSub }
        : { title: fill(H.doingTitle, { day: day.day, title: day.title }), sub: day.done === 0 && day.day > 1 ? fill(H.newDaySub, { prev: day.day - 1 }) : fill(H.doingSub, { done: day.done, total: day.total }) };
    const captionDay = finished ?? day;
    const clicksStep = path.days.flatMap((d) => d.steps).find((s) => s.key === "clicks");
    return (
      <>
        <PageHead eyebrow={workspace.name} title={head.title} sub={head.sub} />
        {flash}
        <WeekStrip
          days={path.days}
          current={day.day}
          wid={wid}
          caption={fill(JOURNEY_COPY.strip.caption, { day: captionDay.day, title: captionDay.title, done: captionDay.done, total: captionDay.total })}
        />
        <WinLine path={path} wid={wid} />
        <JourneyHero path={path} wid={wid} back={base} />
        {path.waitingOnMeta && clicksStep ? <WaitingRow step={clicksStep} wid={wid} back={base} skoolGroupUrl={path.links.skoolGroup} /> : null}
        {finished ? null : (
          <>
            <TodayList day={day} current={cur} wid={wid} back={base} first={path.state === "first"} />
            <LaterLine path={path} wid={wid} back={base} />
          </>
        )}
        {stats.views > 0 || recent.length > 0 ? <WeekResults wid={wid} views={stats.views} leads={stats.leads} clicks={path.loop.clicks} recent={recent} /> : null}
      </>
    );
  }

  // ---- The week is done: once, the week-done card. Then the numbers dashboard returns. ----
  if (path.state === "weekDone" && !jar.get(WEEK_SEEN_COOKIE)) {
    return (
      <>
        <PageHead eyebrow={workspace.name} title={H.weekDoneTitle} sub={H.weekDoneSub} />
        {flash}
        <MarkSeen name={WEEK_SEEN_COOKIE} value="1" path={base} />
        <WeekDone shelf={path.shelf} wid={wid} />
      </>
    );
  }

  const hasData = stats.views > 0 || stats.contactsTotal > 0 || stats.emailsSent > 0 || recent.length > 0;
  const hasChart = stats.views > 0 || stats.series.some((d) => d.leads > 0);
  // The tallest bar sets the scale (leads can outnumber tracked views, e.g. ad blockers).
  const max = Math.max(1, ...stats.series.map((d) => Math.max(d.views, d.leads)));
  const gridLines = [0.25, 0.5, 0.75, 1];
  // Hot leads need the Growth plan's tools to act on; a Member sees their Skool link clicks instead.
  const member = workspace.plan === "starter";

  return (
    <>
      <PageHead eyebrow={workspace.name} title={firstName ? fill(H.backTitle, { name: firstName }) : H.backTitleNoName} sub={H.backSub} />
      {flash}
      {path.state === "veteran" ? (
        <Callout
          tone="info"
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href={`${base}/path`}>{H.veteranButton}</Link>
            </Button>
          }
        >
          {H.veteranNote}
        </Callout>
      ) : null}

      {hasData ? (
        <div className="grid grid-cols-2 gap-3 md:gap-4 @2xl/main:grid-cols-4">
          <Stat icon={EyeIcon} label="Page views" value={stats.views.toLocaleString()} hint="Last 14 days" />
          <Stat icon={UsersIcon} tone="success" label="Leads" value={stats.leads.toLocaleString()} hint={`${stats.conversion.toFixed(1)}% opt-in rate`} />
          {member ? (
            <Stat icon={MousePointerClickIcon} tone="hot" label="Skool link clicks" value={path.loop.clicks.toLocaleString()} hint="Last 30 days" />
          ) : (
            <Stat icon={FlameIcon} tone="hot" label="Hot leads" value={stats.hot.toLocaleString()} hint={`${stats.warm} warm · ${stats.contactsTotal} total`} />
          )}
          <Stat icon={MailIcon} tone="gold" label="Emails sent" value={stats.emailsSent.toLocaleString()} hint={stats.unread ? `${stats.unread} unread messages` : "Your follow-ups, on autopilot"} />
        </div>
      ) : (
        <Empty
          icon={ChartNoAxesColumnIcon}
          title={H.noNumbersTitle}
          body={H.noNumbersBody}
          action={
            <Button variant="outline" asChild>
              <Link href={`${base}/sites`}>
                {H.noNumbersButton} <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          }
        />
      )}

      {hasChart ? (
        <Panel
          icon={TrendingUpIcon}
          title={H.chartTitle}
          sub={H.chartSub}
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
      ) : null}

      {recent.length ? (
        <Panel
          icon={UsersIcon}
          tone="success"
          title={H.newestLeads}
          sub={H.newestLeadsSub}
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link href={`${base}/leads`}>
                {H.allLeads} <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          }
        >
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
                          <LeadAvatar name={name} />
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
        </Panel>
      ) : null}
    </>
  );
}
