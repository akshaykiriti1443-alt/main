import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { getAutomation, recentRuns } from "@/server/automations";
import { presetByKey } from "@/server/automationPresets";
import { listSequences } from "@/server/email/sequences";
import { hasFeature } from "@/server/plans";
import { deleteAutomationAction, saveAutomationAction } from "@/actions/marketing";
import type { AutomationAction, AutomationTrigger } from "@/lib/db/types";
import { relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Locked, PageHead, Panel } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SubmitButton } from "@/components/client";
import { AutomationBuilder } from "@/components/AutomationBuilder";

export default async function AutomationPage({ params, searchParams }: { params: Promise<{ wid: string; id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid, id } = await params;
  const sp = await searchParams;
  const { workspace } = await requireWorkspace(wid);
  if (!hasFeature(workspace.plan, "automations")) return <Locked feature="Automations" wid={wid} />;
  const isNew = id === "new";
  const existing = isNew ? null : await getAutomation(wid, id);
  if (!isNew && !existing) notFound();
  const preset = isNew ? (presetByKey(sp.preset)?.def ?? { name: "New automation", trigger: { type: "lead_created", value: "" } as AutomationTrigger, actions: [] as AutomationAction[] }) : null;
  const sequences = (await listSequences(wid)).map((s) => ({ id: s.id, name: s.name }));
  const runs = existing ? await recentRuns(wid, existing.id) : [];
  return (
    <>
      <PageHead
        eyebrow={
          <Link href={`/app/w/${wid}/automations`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-3.5" /> Automations
          </Link>
        }
        title={existing?.name ?? preset!.name}
      />
      <AutomationBuilder
        workspaceId={wid}
        id={existing?.id ?? null}
        initial={existing ? { name: existing.name, trigger: existing.trigger, actions: existing.actions, active: existing.active } : { ...preset!, active: true }}
        sequences={sequences}
        save={saveAutomationAction.bind(null, wid)}
      />
      {existing ? (
        <>
          <Panel title="Recent runs">
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Log</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground">{relativeTime(r.createdAt)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "capitalize",
                            r.status === "completed" ? "bg-success-soft text-success" : r.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-warning-soft text-warning",
                          )}
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-64 text-xs whitespace-normal text-muted-foreground">{r.log.map((l) => l.message).join(" → ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
          <Panel>
            <form action={deleteAutomationAction.bind(null, wid, existing.id)} className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Delete this automation. Running steps stop.</span>
              <SubmitButton variant="destructive" confirm="Yes, delete">
                Delete
              </SubmitButton>
            </form>
          </Panel>
        </>
      ) : null}
    </>
  );
}
