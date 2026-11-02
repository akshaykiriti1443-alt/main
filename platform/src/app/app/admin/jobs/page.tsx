import { CircleCheckIcon } from "lucide-react";
import { requirePlatformAdmin } from "@/server/auth";
import { recentJobs, recentWebhooks } from "@/server/admin";
import { retryJobAction, runTickAction } from "@/actions/admin";
import { relativeTime, truncate } from "@/lib/util";
import { Empty, Flash, PageHead, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AdminJobs({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePlatformAdmin();
  const [failed, pending, hooks] = await Promise.all([recentJobs("failed"), recentJobs("pending"), recentWebhooks()]);
  return (
    <>
      <PageHead
        title="Jobs & webhooks"
        sub="Background work: emails, Conversions API events, scoring, posts and webhooks."
        actions={
          <form action={runTickAction}>
            <SubmitButton pendingText="Running…">Run jobs now</SubmitButton>
          </form>
        }
      />
      <Flash searchParams={await searchParams} />
      <Panel title={`Failed (${failed.length})`}>
        {failed.length === 0 ? (
          <Empty icon={CircleCheckIcon} title="Nothing failed. 🎉" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell className="text-muted-foreground">{relativeTime(j.createdAt)}</TableCell>
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
        )}
      </Panel>
      <Panel title={`Pending (${pending.length})`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Runs</TableHead>
              <TableHead className="text-right">Attempts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="font-mono text-xs">{j.type}</TableCell>
                <TableCell>{relativeTime(j.runAt)}</TableCell>
                <TableCell className="text-right tabular-nums">{j.attempts}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
      <Panel title="Recent webhooks">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hooks.map((h) => (
              <TableRow key={h.id}>
                <TableCell>{h.source}</TableCell>
                <TableCell className="text-muted-foreground">{relativeTime(h.createdAt)}</TableCell>
                <TableCell>
                  {h.error ? (
                    <Badge variant="destructive" title={h.error}>
                      error
                    </Badge>
                  ) : h.processedAt ? (
                    <Badge variant="secondary" className="bg-success-soft text-success">
                      processed
                    </Badge>
                  ) : (
                    <Badge variant="secondary">queued</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </>
  );
}
