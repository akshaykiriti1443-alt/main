import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { ArrowRightIcon, CheckIcon, EyeIcon, FlameIcon, MailIcon, SparklesIcon, UsersIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { aiGenerations, channelConnections, contacts } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { workspaceStats } from "@/server/analytics";
import { listSites } from "@/server/sites";
import { contactName } from "@/server/contacts";
import { hasFeature } from "@/server/plans";
import { relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Empty, Flash, PageHead, Panel, Stat, TempBadge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function Dashboard({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace } = await requireWorkspace(wid);
  const db = await getDb();
  const [stats, sites, recent, kits, reviews, channels] = await Promise.all([
    workspaceStats(wid),
    listSites(wid),
    db.select().from(contacts).where(eq(contacts.workspaceId, wid)).orderBy(desc(contacts.createdAt)).limit(6),
    db.select({ id: aiGenerations.id }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "launch_kit"))).limit(1),
    db.select({ id: aiGenerations.id }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_review"))).limit(1),
    db.select({ kind: channelConnections.kind }).from(channelConnections).where(and(eq(channelConnections.workspaceId, wid), eq(channelConnections.status, "active"))),
  ]);
  const max = Math.max(1, ...stats.series.map((d) => d.views));
  const base = `/app/w/${wid}`;
  const s = workspace.settings;

  const checklist = [
    { done: kits.length > 0, label: "Generate your AI launch kit", href: `${base}/launch` },
    { done: sites.some((x) => x.published), label: "Publish your funnel", href: sites[0] ? `${base}/sites/${sites[0].id}` : `${base}/sites` },
    { done: Boolean(s.skoolUrl || sites.some((x) => x.skoolUrl)), label: "Add your Skool group link", href: `${base}/settings` },
    { done: Boolean(s.metaPixelId), label: "Add your Meta Pixel", href: `${base}/settings#tracking` },
    { done: stats.contactsTotal > 0, label: "Get your first lead", href: sites[0] ? `${base}/sites/${sites[0].id}` : `${base}/sites` },
    {
      done: channels.length > 0,
      label: hasFeature(workspace.plan, "inbox") ? "Connect Instagram or WhatsApp" : "Unlock the inbox (Growth)",
      href: hasFeature(workspace.plan, "inbox") ? `${base}/settings#channels` : `${base}/billing`,
    },
    { done: reviews.length > 0, label: "Get your custom ad review", href: `${base}/ads` },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const next = checklist.find((c) => !c.done);

  return (
    <>
      <PageHead eyebrow={workspace.name} title="Dashboard" sub="Your funnel at a glance. Numbers cover the last 14 days." />
      <Flash searchParams={await searchParams} />

      {sites.length === 0 ? (
        <Card className="border-0 bg-linear-to-br from-primary to-primary/80 text-primary-foreground ring-0">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-2">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-foreground/15">
                <SparklesIcon className="size-5" />
              </span>
              <div className="grid gap-1">
                <h2 className="text-lg font-semibold">Build your funnel in about a minute</h2>
                <p className="text-primary-foreground/80">Answer 6 questions. AI writes your landing page, free guide, 3 emails, ads and Skool About page.</p>
              </div>
            </div>
            <Button variant="secondary" size="lg" asChild>
              <Link href={`${base}/launch`}>
                Start the launch kit
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat icon={EyeIcon} label="Page views" value={stats.views} />
        <Stat icon={UsersIcon} label="Leads" value={stats.leads} hint={`${stats.conversion.toFixed(1)}% opt-in rate`} />
        <Stat icon={FlameIcon} label="Hot leads" value={stats.hot} hint={`${stats.warm} warm · ${stats.contactsTotal} total`} />
        <Stat icon={MailIcon} label="Emails sent" value={stats.emailsSent} hint={stats.unread ? `${stats.unread} unread messages` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
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

        <Panel className="lg:col-span-2" title="Your 7-day sprint" sub={`${doneCount} of ${checklist.length} done`}>
          <Progress value={(doneCount / checklist.length) * 100} aria-label="Sprint progress" />
          <ul className="-mx-1 flex flex-col">
            {checklist.map((c) => {
              const isNext = c === next;
              return (
                <li key={c.label}>
                  <Link
                    href={c.href}
                    data-slot="checklist-item"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted",
                      isNext && "bg-accent text-accent-foreground hover:bg-accent/80",
                      c.done && "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border",
                        c.done && "border-success bg-success text-background",
                        isNext && "border-primary",
                      )}
                    >
                      {c.done ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className={cn("flex-1", c.done && "line-through")}>{c.label}</span>
                    {isNext ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-primary">
                        Up next <ArrowRightIcon className="size-3.5" />
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel
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
          <Empty icon={UsersIcon} title="No leads yet" body="Publish your funnel and share the link. New leads show up here." />
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
