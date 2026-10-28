import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailEnrollments, emailMessages, emailSequenceSteps } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { listSequences } from "@/server/email/sequences";
import { listCampaigns } from "@/server/email/campaigns";
import { hasFeature } from "@/server/plans";
import { createCampaignAction, createSequenceAction } from "@/actions/marketing";
import { relativeTime } from "@/lib/util";
import { Flash, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/client";

const TRIGGER: Record<string, string> = { lead_created: "New lead", tag_added: "Tag added", manual: "Manual / automation" };

export default async function EmailsPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace } = await requireWorkspace(wid);
  const db = await getDb();
  const [seqs, campaigns, recent, stepCounts, enrollCounts] = await Promise.all([
    listSequences(wid),
    listCampaigns(wid),
    db.select().from(emailMessages).where(eq(emailMessages.workspaceId, wid)).orderBy(desc(emailMessages.createdAt)).limit(15),
    db.select({ id: emailSequenceSteps.sequenceId, n: sql<number>`count(*)::int` }).from(emailSequenceSteps).groupBy(emailSequenceSteps.sequenceId),
    db.select({ id: emailEnrollments.sequenceId, n: sql<number>`count(*)::int` }).from(emailEnrollments).where(eq(emailEnrollments.workspaceId, wid)).groupBy(emailEnrollments.sequenceId),
  ]);
  const growth = hasFeature(workspace.plan, "campaigns");
  return (
    <>
      <PageHead title="Emails" sub="Sequences send on their own when someone becomes a lead. Broadcasts send once to a group." />
      <Flash searchParams={await searchParams} />
      {!workspace.settings.mailingAddress ? (
        <div className="alert alert-warn">
          Add your business mailing address in <Link href={`/app/w/${wid}/settings`}>Settings</Link>. Anti-spam laws require it in marketing emails.
        </div>
      ) : null}
      <div className="card">
        <div className="card-head">
          <h2>Sequences</h2>
          <form action={createSequenceAction.bind(null, wid)}>
            <SubmitButton className="btn btn-sm">New sequence</SubmitButton>
          </form>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Starts when</th><th>Emails</th><th>Enrolled</th><th>Status</th></tr>
            </thead>
            <tbody>
              {seqs.map((s) => (
                <tr key={s.id} className="clickable">
                  <td><Link href={`/app/w/${wid}/emails/sequences/${s.id}`}><strong>{s.name}</strong></Link></td>
                  <td className="small">{TRIGGER[s.trigger]}{s.triggerValue ? `: ${s.triggerValue}` : ""}</td>
                  <td className="num">{stepCounts.find((x) => x.id === s.id)?.n ?? 0}</td>
                  <td className="num">{enrollCounts.find((x) => x.id === s.id)?.n ?? 0}</td>
                  <td>{s.active ? <span className="badge badge-good">On</span> : <span className="badge">Off</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Broadcasts</h2>
          {growth ? (
            <form action={createCampaignAction.bind(null, wid)}>
              <SubmitButton className="btn btn-sm">New broadcast</SubmitButton>
            </form>
          ) : (
            <Link href={`/app/w/${wid}/billing`} className="badge badge-accent">Growth plan</Link>
          )}
        </div>
        {campaigns.length === 0 ? (
          <p className="muted small">Send one email to all hot leads, a tag, or everyone. {growth ? "" : "Available on the Growth plan."}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Status</th><th>Recipients</th><th>Sent</th></tr></thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="clickable">
                    <td><Link href={`/app/w/${wid}/emails/campaigns/${c.id}`}><strong>{c.name}</strong></Link><div className="tiny muted">{c.subject}</div></td>
                    <td><span className={`badge ${c.status === "sent" ? "badge-good" : c.status === "draft" ? "" : "badge-warm"}`}>{c.status}</span></td>
                    <td className="num">{c.recipients || "—"}</td>
                    <td className="small muted">{c.sentAt ? relativeTime(c.sentAt) : c.scheduledAt ? `scheduled ${relativeTime(c.scheduledAt)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h2>Recent emails</h2></div>
        {recent.length === 0 ? (
          <p className="muted small">Nothing sent yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>To</th><th>Subject</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {recent.map((m) => (
                  <tr key={m.id}>
                    <td className="small">{m.toEmail}</td>
                    <td className="small">{m.subject}</td>
                    <td><span className={`badge ${m.status === "sent" ? "badge-good" : m.status === "failed" ? "badge-bad" : ""}`} title={m.error ?? undefined}>{m.status}</span></td>
                    <td className="small muted">{relativeTime(m.sentAt ?? m.createdAt)}</td>
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
