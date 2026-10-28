import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations, channelConnections, contacts } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { workspaceStats } from "@/server/analytics";
import { listSites } from "@/server/sites";
import { contactName } from "@/server/contacts";
import { hasFeature } from "@/server/plans";
import { relativeTime } from "@/lib/util";
import { Empty, Flash, PageHead, Stat, TempBadge } from "@/components/ui";

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

  return (
    <>
      <PageHead eyebrow={workspace.name} title="Dashboard" sub="Your funnel at a glance. Numbers cover the last 14 days." />
      <Flash searchParams={await searchParams} />

      {sites.length === 0 ? (
        <div className="card row-between" style={{ background: "var(--accent-soft)", borderColor: "transparent" }}>
          <div className="stack" style={{ gap: 6 }}>
            <h2>Build your funnel in about a minute</h2>
            <p className="muted">Answer 6 questions. AI writes your landing page, free guide, 3 emails, ads and Skool About page.</p>
          </div>
          <Link className="btn btn-primary" href={`${base}/launch`}>
            Start the launch kit
          </Link>
        </div>
      ) : null}

      <div className="grid-4">
        <Stat label="Page views" value={stats.views} />
        <Stat label="Leads" value={stats.leads} hint={`${stats.conversion.toFixed(1)}% opt-in rate`} />
        <Stat label="Hot leads" value={stats.hot} hint={`${stats.warm} warm · ${stats.contactsTotal} total`} />
        <Stat label="Emails sent" value={stats.emailsSent} hint={stats.unread ? `${stats.unread} unread messages` : undefined} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Views and leads</h2>
            <span className="row small muted">
              <span className="badge badge-accent">Leads</span>
              <span className="badge">Views</span>
            </span>
          </div>
          <div className="bars" role="img" aria-label="Daily page views and leads for the last 14 days">
            {stats.series.map((d) => (
              <div key={d.day} className="bar-col" title={`${d.day}: ${d.views} views, ${d.leads} leads`}>
                <div className="bar views" style={{ height: `${(Math.max(0, d.views - d.leads) / max) * 100}%` }} />
                <div className="bar leads" style={{ height: `${(d.leads / max) * 100}%`, borderRadius: d.views - d.leads > 0 ? 0 : undefined }} />
                <div className="bar-label">{d.day.slice(8)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Your 7-day sprint</h2>
            <span className="badge badge-good">
              {doneCount}/{checklist.length} done
            </span>
          </div>
          <div className="checklist">
            {checklist.map((c) => (
              <div key={c.label} className="check-item">
                <span className={`dot${c.done ? " done" : ""}`}>{c.done ? "✓" : ""}</span>
                <span style={{ textDecoration: c.done ? "line-through" : undefined, color: c.done ? "var(--muted)" : undefined }}>{c.label}</span>
                {c.done ? null : (
                  <Link href={c.href} className="small">
                    Do it →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Newest leads</h2>
          <Link href={`${base}/leads`} className="small">
            All leads →
          </Link>
        </div>
        {recent.length === 0 ? (
          <Empty title="No leads yet" body="Publish your funnel and share the link. New leads show up here." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Temperature</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id} className="clickable">
                    <td>
                      <Link href={`${base}/leads/${c.id}`}>{contactName(c)}</Link>
                      <div className="tiny muted">{c.email ?? c.phone ?? ""}</div>
                    </td>
                    <td className="small">{c.source.replace("_", " ")}</td>
                    <td>
                      <TempBadge t={c.temperature} />
                    </td>
                    <td className="small muted">{relativeTime(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
