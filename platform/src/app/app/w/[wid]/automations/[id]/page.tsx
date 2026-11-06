import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, HistoryIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { getAutomation, recentRuns } from "@/server/automations";
import { presetByKey } from "@/server/automationPresets";
import { listSequences } from "@/server/email/sequences";
import { hasFeature } from "@/server/plans";
import { deleteAutomationAction, saveAutomationAction } from "@/actions/marketing";
import { draftAutomationAction } from "@/actions/automationAi";
import { getAutomationDraft, whoBuilds } from "@/server/ai/automationDraft";
import { AutomationAiBox } from "@/components/automation-ai";
import type { AutomationAction, AutomationTrigger } from "@/lib/db/types";
import { relativeTime } from "@/lib/util";
import { Callout, Flash, Locked, MoreOptions, PageHead, Panel } from "@/components/ui";
import { EdgeTable, QuietEmpty } from "@/components/crm-ui";
import { Button } from "@/components/ui/button";
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
  // An AI draft ("Tell your AI what to automate") opens here unsaved, like a recipe.
  const ai = typeof sp.draft === "string" ? await getAutomationDraft(wid, sp.draft, existing?.id ?? null) : null;
  const preset = isNew ? (ai?.draft ?? presetByKey(sp.preset)?.def ?? { name: "New automation", trigger: { type: "lead_created", value: "" } as AutomationTrigger, actions: [] as AutomationAction[] }) : null;
  const sequences = (await listSequences(wid)).map((s) => ({ id: s.id, name: s.name }));
  const runs = existing ? await recentRuns(wid, existing.id) : [];
  return (
    <>
      <PageHead
        eyebrow={
          <Link href={`/app/w/${wid}/automations`} className="inline-flex items-center gap-1.5 text-muted-foreground no-underline hover:text-foreground hover:no-underline">
            <ArrowLeftIcon className="size-3.5" aria-hidden /> Automations
          </Link>
        }
        title={existing?.name ?? preset!.name}
        sub={
          existing
            ? "Change what starts it or what it does, then save. Switch it off any time."
            : "Pick what starts it, then the steps in order. Read every email out loud. Nothing runs until you save."
        }
        actions={
          existing ? (
            <Badge variant={existing.active ? "success" : "secondary"} className="h-7 px-3 text-xs">
              {existing.active ? "On" : "Off"} · {existing.runsCount} run{existing.runsCount === 1 ? "" : "s"}
            </Badge>
          ) : undefined
        }
      />
      <Flash searchParams={sp} />
      {ai ? (
        <Callout
          tone="info"
          title={
            <span className="flex items-center gap-2">
              {ai.model === "recipe" ? "The closest recipe to what you asked" : existing ? "Your AI's changes" : "Your AI built this"}
            </span>
          }
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href={`/app/w/${wid}/automations${existing ? `/${existing.id}` : ""}`}>Discard</Link>
            </Button>
          }
        >
          <div className="flex flex-col gap-2.5">
            <p className="border-l-2 border-violet-300 pl-3 text-muted-foreground italic dark:border-violet-400/50">&ldquo;{ai.request}&rdquo;</p>
            {ai.draft.summary ? <p>{ai.draft.summary}</p> : null}
            {ai.draft.why ? <p className="font-medium">{ai.draft.why}</p> : null}
            {ai.draft.notes.length ? (
              <ul className="list-disc space-y-1 pl-5">
                {ai.draft.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            <p>
              <b>Nothing is saved yet.</b> Read every email out loud, change anything that doesn&apos;t sound like you, then press <b>Save</b>.
            </p>
          </div>
        </Callout>
      ) : existing ? (
        <MoreOptions icon={SparklesIcon} title="Change it with AI" sub="Say what to change. Your AI rewrites the steps and shows you before anything is saved.">
          <AutomationAiBox
            compact
            action={draftAutomationAction.bind(null, wid, existing.id)}
            placeholder={`e.g. "Wait 2 days instead of 1, make the email shorter, and tag them followed-up."`}
            cta="Change it"
            pendingText="Your AI is changing it…"
            aiNote={whoBuilds(workspace)}
          />
        </MoreOptions>
      ) : null}
      <AutomationBuilder
        key={ai ? sp.draft : "saved"}
        workspaceId={wid}
        id={existing?.id ?? null}
        initial={
          ai && existing
            ? { name: ai.draft.name, trigger: ai.draft.trigger, actions: ai.draft.actions, active: existing.active }
            : existing
              ? { name: existing.name, trigger: existing.trigger, actions: existing.actions, active: existing.active }
              : { name: preset!.name, trigger: preset!.trigger, actions: preset!.actions, active: true }
        }
        sequences={sequences}
        save={saveAutomationAction.bind(null, wid)}
        emphasis={!existing || Boolean(ai)}
      />
      {existing ? (
        <>
          <Panel icon={HistoryIcon} title="Recent runs" sub="Every time it fires, you see what it did here.">
            {runs.length === 0 ? (
              <QuietEmpty
                icon={HistoryIcon}
                tone={existing.active ? "success" : "muted"}
                title="No runs yet"
                body={existing.active ? "It's on and waiting. The first time its trigger happens, the run shows up here." : "It's switched off. Turn it on above and save, and runs show up here."}
              />
            ) : (
              <EdgeTable>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Log</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-[13px] text-subtle-foreground">{relativeTime(r.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "completed" ? "success" : r.status === "failed" ? "destructive" : "warning"} className="capitalize">
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-64 text-xs whitespace-normal text-muted-foreground">{r.log.map((l) => l.message).join(" → ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </EdgeTable>
            )}
          </Panel>
          <MoreOptions icon={Trash2Icon} title="Delete this automation" sub="Running steps stop. Switching it off is usually enough.">
            <form action={deleteAutomationAction.bind(null, wid, existing.id)} className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">This can&apos;t be undone.</span>
              <SubmitButton variant="destructive" confirm="Yes, delete">
                Delete
              </SubmitButton>
            </form>
          </MoreOptions>
        </>
      ) : null}
    </>
  );
}
