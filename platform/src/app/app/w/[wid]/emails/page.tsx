import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { LockIcon, MailIcon, MegaphoneIcon, PlusIcon, SendIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { emailEnrollments, emailMessages, emailSequenceSteps } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { listSequences } from "@/server/email/sequences";
import { listCampaigns } from "@/server/email/campaigns";
import { hasFeature } from "@/server/plans";
import { createCampaignAction, createSequenceAction } from "@/actions/marketing";
import { relativeTime } from "@/lib/util";
import { Callout, Empty, Flash, PageHead, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TRIGGER: Record<string, string> = { lead_created: "New lead", tag_added: "Tag added", manual: "Manual / automation" };

/** Sent is green, failed is red; for broadcasts, anything past draft but not sent (scheduled, sending) is amber. */
function StatusBadge({ status, title, broadcast }: { status: string; title?: string; broadcast?: boolean }) {
  const tone =
    status === "sent"
      ? "bg-success-soft text-success"
      : status === "failed"
        ? "bg-destructive/10 text-destructive"
        : broadcast && status !== "draft"
          ? "bg-warning-soft text-warning"
          : "";
  return (
    <Badge variant="secondary" className={`capitalize ${tone}`} title={title}>
      {status}
    </Badge>
  );
}

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
        <Callout tone="warn">
          Add your business mailing address in <Link href={`/app/w/${wid}/settings`} className="font-medium underline underline-offset-2">Settings</Link>. Anti-spam laws require it in marketing emails.
        </Callout>
      ) : null}

      <Panel
        title="Sequences"
        action={
          <form action={createSequenceAction.bind(null, wid)}>
            <SubmitButton variant="outline" size="sm">
              <PlusIcon data-icon="inline-start" /> New sequence
            </SubmitButton>
          </form>
        }
      >
        {seqs.length === 0 ? (
          <Empty icon={MailIcon} title="No sequences yet" body="Create a sequence to email new leads automatically." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Starts when</TableHead>
                <TableHead className="text-right">Emails</TableHead>
                <TableHead className="text-right">Enrolled</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {seqs.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/app/w/${wid}/emails/sequences/${s.id}`} className="font-medium text-foreground hover:text-primary">
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {TRIGGER[s.trigger]}
                    {s.triggerValue ? `: ${s.triggerValue}` : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{stepCounts.find((x) => x.id === s.id)?.n ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{enrollCounts.find((x) => x.id === s.id)?.n ?? 0}</TableCell>
                  <TableCell>
                    {s.active ? (
                      <Badge variant="secondary" className="bg-success-soft text-success">
                        On
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Off</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel
        title="Broadcasts"
        action={
          growth ? (
            <form action={createCampaignAction.bind(null, wid)}>
              <SubmitButton variant="outline" size="sm">
                <PlusIcon data-icon="inline-start" /> New broadcast
              </SubmitButton>
            </form>
          ) : (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/app/w/${wid}/billing`}>
                <LockIcon data-icon="inline-start" /> Growth plan
              </Link>
            </Button>
          )
        }
      >
        {campaigns.length === 0 ? (
          <Empty icon={MegaphoneIcon} title="No broadcasts yet" body={`Send one email to all hot leads, a tag, or everyone. ${growth ? "" : "Available on the Growth plan."}`} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Recipients</TableHead>
                <TableHead className="text-right">Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/app/w/${wid}/emails/campaigns/${c.id}`} className="font-medium text-foreground hover:text-primary">
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{c.subject}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} broadcast />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.recipients || "—"}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {c.sentAt ? relativeTime(c.sentAt) : c.scheduledAt ? `scheduled ${relativeTime(c.scheduledAt)}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel title="Recent emails">
        {recent.length === 0 ? (
          <Empty icon={SendIcon} title="Nothing sent yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>To</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.toEmail}</TableCell>
                  <TableCell className="max-w-72 truncate">{m.subject}</TableCell>
                  <TableCell>
                    <StatusBadge status={m.status} title={m.error ?? undefined} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{relativeTime(m.sentAt ?? m.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
