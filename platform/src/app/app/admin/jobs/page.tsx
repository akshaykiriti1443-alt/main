import { CircleAlertIcon, CircleCheckIcon, ClockIcon, WebhookIcon } from "lucide-react";
import { requirePlatformAdmin } from "@/server/auth";
import { recentJobs, recentWebhooks } from "@/server/admin";
import { retryJobAction, runTickAction } from "@/actions/admin";
import { relativeTime, truncate } from "@/lib/util";
import { Flash, PageHead, Panel } from "@/components/ui";
import { EdgeTable, QuietEmpty } from "@/components/crm-ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AdminJobs({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePlatformAdmin();
  const [failed, pending, hooks] = await Promise.all([recentJobs("failed"), recentJobs("pending"), recentWebhooks()]);
  return (
    <>
      <PageHead
        eyebrow="Platform admin"
        title="Jobs & webhooks"
        sub="Background work: emails, Conversions API events, scoring, posts and webhooks."
        actions={
          <form action={runTickAction}>
            <SubmitButton pendingText="Running…">Run jobs now</SubmitButton>
          </form>
        }
      />
      <Flash searchParams={await searchParams} />
      <Panel icon={failed.length ? CircleAlertIcon : CircleCheckIcon} tone={failed.length ? "warning" : "success"} title={`Failed (${failed.length})`} sub="Retry one once you've fixed what it complains about.">
        {failed.length === 0 ? (
          <QuietEmpty icon={CircleCheckIcon} tone="success" title="Nothing failed. 🎉" body="Every background job ran." />
        ) : (
          <EdgeTable>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Type</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead>When</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failed.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="font-mono text-xs">{j.type}</TableCell>
                  <TableCell className="max-w-md min-w-64 text-xs break-words whitespace-normal text-muted-foreground">{truncate(j.lastError ?? "", 160)}</TableCell>
                  <TableCell className="text-right tabular-nums">{j.attempts}</TableCell>
                  <TableCell className="text-[13px] text-subtle-foreground">{relativeTime(j.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <form action={retryJobAction.bind(null, j.id)}>
                      <SubmitButton variant="outline" size="sm" pendingText="Retrying…">
                        Retry
                      </SubmitButton>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </EdgeTable>
        )}
      </Panel>
      <Panel icon={ClockIcon} tone="muted" title={`Pending (${pending.length})`} sub="Waiting for their turn.">
        {pending.length === 0 ? (
          <QuietEmpty icon={ClockIcon} title="Queue is empty" body="New jobs show up here until they run." />
        ) : (
        <EdgeTable>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Type</TableHead>
              <TableHead>Runs</TableHead>
              <TableHead className="text-right">Attempts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="font-mono text-xs">{j.type}</TableCell>
                <TableCell className="text-[13px] text-muted-foreground">{relativeTime(j.runAt)}</TableCell>
                <TableCell className="text-right tabular-nums">{j.attempts}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </EdgeTable>
        )}
      </Panel>
      <Panel icon={WebhookIcon} tone="muted" title="Recent webhooks" sub="What Meta, Stripe, Skool and Twilio sent us.">
        {hooks.length === 0 ? (
          <QuietEmpty icon={WebhookIcon} title="No webhooks yet" body="They show up here the moment one arrives." />
        ) : (
        <EdgeTable>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Source</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hooks.map((h) => (
              <TableRow key={h.id}>
                <TableCell>{h.source}</TableCell>
                <TableCell className="text-[13px] text-subtle-foreground">{relativeTime(h.createdAt)}</TableCell>
                <TableCell>
                  {h.error ? (
                    <Badge variant="destructive" title={h.error}>
                      error
                    </Badge>
                  ) : h.processedAt ? (
                    <Badge variant="success">processed</Badge>
                  ) : (
                    <Badge variant="secondary">queued</Badge>
                  )}
                </TableCell>
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
