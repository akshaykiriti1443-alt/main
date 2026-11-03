import Link from "next/link";
import { ArrowRightIcon, PlusIcon, SparklesIcon, WorkflowIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { listAutomations, TRIGGER_LABELS } from "@/server/automations";
import { AUTOMATION_PRESETS } from "@/server/automationPresets";
import { automationContext, automationSuggestions, whoBuilds } from "@/server/ai/automationDraft";
import { draftAutomationAction } from "@/actions/automationAi";
import { AutomationAiBox } from "@/components/automation-ai";
import { hasFeature } from "@/server/plans";
import { Empty, Flash, Locked, PageHead, Panel } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PRESET_GROUPS = ["Skool members", "Leads"] as const;

export default async function AutomationsPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace } = await requireWorkspace(wid);
  if (!hasFeature(workspace.plan, "automations")) {
    return (
      <>
        <PageHead title="Automations" sub="When something happens, do something. Tag, email, DM, score and alert on autopilot." />
        <Locked feature="Automations" wid={wid} />
      </>
    );
  }
  const [list, ctx] = await Promise.all([listAutomations(wid), automationContext(wid)]);
  const suggestions = automationSuggestions(ctx);
  return (
    <>
      <PageHead
        title="Automations"
        sub="When something happens, do something. They run 24/7. Tell your AI what you want, or start from a recipe."
        actions={
          <Button asChild>
            <Link href={`/app/w/${wid}/automations/new`}>
              <PlusIcon data-icon="inline-start" />
              New automation
            </Link>
          </Button>
        }
      />
      <Flash searchParams={await searchParams} />
      <Panel
        title={
          <span className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-primary" /> Tell your AI what to automate
          </span>
        }
        sub="Say what should happen, to whom and when, in your own words. Or tap an idea from your numbers. Your AI builds the trigger and every step, then opens it for you to read and switch on."
        className="border-primary/30 bg-linear-to-br from-primary/5 to-transparent"
      >
        <AutomationAiBox
          action={draftAutomationAction.bind(null, wid, null)}
          suggestions={suggestions}
          placeholder={`e.g. "When someone starts a trial, email them the one lesson to finish first. On day 5, if they haven't upgraded, have my AI draft a Skool DM and tell me."`}
          cta="Build it"
          pendingText="Your AI is building it…"
          aiNote={whoBuilds(workspace)}
        />
      </Panel>
      {list.length === 0 ? (
        <Empty icon={WorkflowIcon} title="No automations yet" body="Tell your AI above, or start from a recipe below." />
      ) : (
        <Panel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead className="text-right">Steps</TableHead>
                <TableHead className="text-right">Runs</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link href={`/app/w/${wid}/automations/${a.id}`} className="font-medium text-foreground hover:text-primary">
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {TRIGGER_LABELS[a.trigger.type]}
                    {a.trigger.value ? `: ${a.trigger.value}` : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.actions.length}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.runsCount}</TableCell>
                  <TableCell>
                    {a.active ? (
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
        </Panel>
      )}
      <section className="flex flex-col gap-5">
        {PRESET_GROUPS.map((group) => (
          <div key={group} className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{group === "Skool members" ? "Skool member recipes" : "Lead recipes"}</h2>
              <p className="text-sm text-muted-foreground">
                {group === "Skool members"
                  ? "The lifecycle in four flows: welcome, convert, save, win back. They fire off your Skool sync."
                  : "Turn new leads and DMs into conversations automatically."}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {AUTOMATION_PRESETS.filter((p) => p.group === group).map((p) => (
                <Panel key={p.key} title={p.title} sub={p.body}>
                  <Button variant="outline" size="sm" className="self-start" asChild>
                    <Link href={`/app/w/${wid}/automations/new?preset=${p.key}`}>
                      Use recipe
                      <ArrowRightIcon data-icon="inline-end" />
                    </Link>
                  </Button>
                </Panel>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
