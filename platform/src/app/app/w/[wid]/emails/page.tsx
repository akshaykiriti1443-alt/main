import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { ArrowRightIcon, InboxIcon, LockIcon, MailIcon, MegaphoneIcon, PlusIcon, SendIcon, SparklesIcon, type LucideIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { emailEnrollments, emailMessages, emailSequenceSteps } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { listSequences } from "@/server/email/sequences";
import { listCampaigns } from "@/server/email/campaigns";
import { hasFeature } from "@/server/plans";
import { createCampaignAction, createSequenceAction } from "@/actions/marketing";
import { relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Empty, Flash, IconTile, PageHead, Panel, type Tone } from "@/components/ui";
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
          ? "bg-gold-soft text-gold-foreground"
          : "";
  return (
    <Badge variant="secondary" className={`capitalize ${tone}`} title={title}>
      {status}
    </Badge>
  );
}

/** A one-line empty state for the secondary lists, so the page doesn't turn into a stack of big empties. */
function QuietEmpty({ icon, tone, title, body }: { icon: LucideIcon; tone: Tone; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-foreground/15 bg-muted/35 px-4 py-3.5">
      <IconTile icon={icon} tone={tone} className="size-8 rounded-lg" />
      <div className="grid gap-0.5 text-sm">
        <span className="font-semibold">{title}</span>
        <span className="text-muted-foreground">{body}</span>
      </div>
    </div>
  );
}

const row = "group flex items-center gap-3 rounded-xl px-2.5 py-3 text-foreground transition-colors hover:bg-muted hover:no-underline";

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
              <Button asChild>
                <Link href={`${base}/launch`}>
                  <SparklesIcon data-icon="inline-start" /> Open the AI launch kit
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="-mx-1 flex flex-col">
            {seqs.map((s) => {
              const steps = stepCounts.find((x) => x.id === s.id)?.n ?? 0;
              const enrolled = enrollCounts.find((x) => x.id === s.id)?.n ?? 0;
              return (
                <li key={s.id}>
                  <Link href={`${base}/emails/sequences/${s.id}`} className={row}>
                    <span className={cn("size-2.5 shrink-0 rounded-full", s.active ? "bg-success shadow-[0_0_0_4px] shadow-success/15" : "bg-foreground/20")} aria-hidden />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate font-medium group-hover:text-primary">{s.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        Starts when: {TRIGGER[s.trigger]}
                        {s.triggerValue ? `: ${s.triggerValue}` : ""}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:block">
                      {steps} email{steps === 1 ? "" : "s"} · {enrolled} enrolled
                    </span>
                    {s.active ? (
                      <Badge variant="secondary" className="bg-success-soft text-success">
                        On
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Off</Badge>
                    )}
                    <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
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
          <ul className="-mx-1 flex flex-col">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link href={`${base}/emails/campaigns/${c.id}`} className={row}>
                  <IconTile icon={MegaphoneIcon} tone={c.status === "sent" ? "success" : "muted"} className="size-8 rounded-lg" />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate font-medium group-hover:text-primary">{c.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{c.subject || "No subject yet"}</span>
                  </span>
                  <span className="hidden shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:block">
                    {c.recipients ? `${c.recipients} recipients · ` : ""}
                    {c.sentAt ? `sent ${relativeTime(c.sentAt)}` : c.scheduledAt ? `scheduled ${relativeTime(c.scheduledAt)}` : "not sent"}
                  </span>
                  <StatusBadge status={c.status} broadcast />
                  <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel icon={SendIcon} tone="success" title="Recent emails" sub="The last 15 emails that went out, and whether they landed.">
        {recent.length === 0 ? (
          <QuietEmpty icon={InboxIcon} tone="success" title="Nothing sent yet" body="When your first lead signs up, their first email shows up here within a minute." />
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
