import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { ChevronRightIcon, InboxIcon, LockIcon, MailIcon, MegaphoneIcon, PlusIcon, SendIcon, SparklesIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { emailEnrollments, emailMessages, emailSequenceSteps } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { listSequences } from "@/server/email/sequences";
import { listCampaigns } from "@/server/email/campaigns";
import { hasFeature } from "@/server/plans";
import { createCampaignAction, createSequenceAction } from "@/actions/marketing";
import { relativeTime } from "@/lib/util";
import { Empty, Flash, IconTile, PageHead, Panel } from "@/components/ui";
import { Avatar, EdgeTable, LiveDot, QuietEmpty, RowList, rowLink } from "@/components/crm-ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TRIGGER: Record<string, string> = { lead_created: "New lead", tag_added: "Tag added", manual: "Manual / automation" };

/** Sent is green, failed is red; for broadcasts, anything past draft but not sent (scheduled, sending) is amber. */
function StatusBadge({ status, title, broadcast }: { status: string; title?: string; broadcast?: boolean }) {
  const variant = status === "sent" ? "success" : status === "failed" ? "destructive" : broadcast && status !== "draft" ? "gold" : "secondary";
  return (
    <Badge variant={variant} className="capitalize" title={title}>
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
  const base = `/app/w/${wid}`;
  const needsAddress = !workspace.settings.mailingAddress;

  return (
    <>
      <PageHead
        eyebrow="Email"
        title="Emails"
        sub="Sequences send by themselves when someone becomes a lead. Broadcasts go out once, to a group you pick."
        first={
          needsAddress ? (
            <>
              Add your business mailing address in <Link href={`${base}/settings`}>Settings</Link>. Anti-spam laws want it in every marketing email.
            </>
          ) : seqs.length === 0 ? (
            "Build your AI launch kit and it writes your first 3 emails for you."
          ) : undefined
        }
      />
      <Flash searchParams={await searchParams} />

      <Panel
        icon={MailIcon}
        title="Sequences"
        sub="A few emails in a row, sent on a schedule after someone joins. Your launch kit's 3 follow-ups live here."
        action={
          <form action={createSequenceAction.bind(null, wid)}>
            <SubmitButton variant="outline" size="sm">
              <PlusIcon data-icon="inline-start" /> New sequence
            </SubmitButton>
          </form>
        }
      >
        {seqs.length === 0 ? (
          <Empty
            icon={MailIcon}
            title="No sequences yet"
            body="The AI launch kit writes your first 3 follow-up emails in about a minute. Or start a blank sequence above."
            action={
              <Button asChild variant="cta" size="lg">
                <Link href={`${base}/launch`}>
                  <SparklesIcon data-icon="inline-start" /> Open the AI launch kit
                </Link>
              </Button>
            }
          />
        ) : (
          <RowList>
            {seqs.map((s) => {
              const steps = stepCounts.find((x) => x.id === s.id)?.n ?? 0;
              const enrolled = enrollCounts.find((x) => x.id === s.id)?.n ?? 0;
              return (
                <li key={s.id}>
                  <Link href={`${base}/emails/sequences/${s.id}`} className={rowLink}>
                    <LiveDot on={s.active} />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate font-medium transition-colors group-hover/row:text-primary dark:group-hover/row:text-violet-300">{s.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        Starts when: {TRIGGER[s.trigger]}
                        {s.triggerValue ? `: ${s.triggerValue}` : ""}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-xs text-subtle-foreground tabular-nums sm:block">
                      {steps} email{steps === 1 ? "" : "s"} · {enrolled} enrolled
                    </span>
                    <Badge variant={s.active ? "success" : "secondary"}>{s.active ? "On" : "Off"}</Badge>
                    <ChevronRightIcon className="size-4 shrink-0 text-subtle-foreground transition-transform duration-150 group-hover/row:translate-x-0.5 group-hover/row:text-primary" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </RowList>
        )}
      </Panel>

      <Panel
        icon={MegaphoneIcon}
        tone="gold"
        title="Broadcasts"
        sub="One email, sent once: to your hot leads, a tag, or everyone."
        action={
          growth ? (
            <form action={createCampaignAction.bind(null, wid)}>
              <SubmitButton variant="outline" size="sm">
                <PlusIcon data-icon="inline-start" /> New broadcast
              </SubmitButton>
            </form>
          ) : (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${base}/billing`}>
                <LockIcon data-icon="inline-start" /> Growth plan
              </Link>
            </Button>
          )
        }
      >
        {campaigns.length === 0 ? (
          <QuietEmpty
            icon={MegaphoneIcon}
            tone="gold"
            title="No broadcasts yet"
            body={growth ? "Got news, a live call or a new course? Press New broadcast, write it once, and pick who gets it." : "Broadcasts are on the Growth plan."}
          />
        ) : (
          <RowList>
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link href={`${base}/emails/campaigns/${c.id}`} className={rowLink}>
                  <IconTile icon={MegaphoneIcon} tone={c.status === "sent" ? "success" : c.status === "draft" ? "muted" : "gold"} className="size-8 rounded-[10px]" />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate font-medium transition-colors group-hover/row:text-primary dark:group-hover/row:text-violet-300">{c.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{c.subject || "No subject yet"}</span>
                  </span>
                  <span className="hidden shrink-0 text-right text-xs text-subtle-foreground tabular-nums sm:block">
                    {c.recipients ? `${c.recipients} recipients · ` : ""}
                    {c.sentAt ? `sent ${relativeTime(c.sentAt)}` : c.scheduledAt ? `scheduled ${relativeTime(c.scheduledAt)}` : "not sent"}
                  </span>
                  <StatusBadge status={c.status} broadcast />
                  <ChevronRightIcon className="size-4 shrink-0 text-subtle-foreground transition-transform duration-150 group-hover/row:translate-x-0.5 group-hover/row:text-primary" aria-hidden />
                </Link>
              </li>
            ))}
          </RowList>
        )}
      </Panel>

      <Panel icon={SendIcon} tone="success" title="Recent emails" sub="The last 15 emails that went out, and whether they landed.">
        {recent.length === 0 ? (
          <QuietEmpty icon={InboxIcon} tone="success" title="Nothing sent yet" body="When your first lead signs up, their first email shows up here within a minute." />
        ) : (
          <EdgeTable>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>To</TableHead>
                  <TableHead className="hidden @2xl/main:table-cell">Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={m.toEmail} size="sm" />
                        <div className="grid min-w-0 leading-tight">
                          <span className="max-w-56 truncate font-medium">{m.toEmail}</span>
                          <span className="max-w-56 truncate text-xs text-muted-foreground @2xl/main:hidden">{m.subject}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-72 truncate text-muted-foreground @2xl/main:table-cell">{m.subject}</TableCell>
                    <TableCell>
                      <StatusBadge status={m.status} title={m.error ?? undefined} />
                    </TableCell>
                    <TableCell className="text-right text-[13px] text-subtle-foreground">{relativeTime(m.sentAt ?? m.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </EdgeTable>
        )}
      </Panel>
    </>
  );
}
