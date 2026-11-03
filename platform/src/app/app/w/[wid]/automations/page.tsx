import Link from "next/link";
import {
  ArrowRightIcon,
  FlameIcon,
  HandHeartIcon,
  HeartHandshakeIcon,
  MessageCircleReplyIcon,
  PartyPopperIcon,
  PlusIcon,
  SparklesIcon,
  SproutIcon,
  TrendingUpIcon,
  WorkflowIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { listAutomations, TRIGGER_LABELS } from "@/server/automations";
import { AUTOMATION_PRESETS } from "@/server/automationPresets";
import { automationContext, automationSuggestions, whoBuilds } from "@/server/ai/automationDraft";
import { draftAutomationAction } from "@/actions/automationAi";
import { AutomationAiBox } from "@/components/automation-ai";
import { hasFeature } from "@/server/plans";
import { cn } from "@/lib/utils";
import { Flash, IconTile, Locked, MoreOptions, PageHead, Panel, type Tone } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** A picture per recipe, so the list reads at a glance. */
const RECIPE_ART: Record<string, { icon: LucideIcon; tone: Tone; label?: string }> = {
  // The course calls the member recipes Welcome, Convert, Save and Win back.
  "skool-welcome": { icon: PartyPopperIcon, tone: "primary", label: "Welcome" },
  "skool-convert": { icon: TrendingUpIcon, tone: "success", label: "Convert" },
  "skool-save": { icon: HandHeartIcon, tone: "warning", label: "Save" },
  "skool-winback": { icon: HeartHandshakeIcon, tone: "gold", label: "Win back" },
  hot: { icon: FlameIcon, tone: "hot" },
  "welcome-dm": { icon: MessageCircleReplyIcon, tone: "primary" },
  nurture: { icon: SproutIcon, tone: "success" },
};

function Recipe({ wid, p, n }: { wid: string; p: (typeof AUTOMATION_PRESETS)[number]; n?: number }) {
  const art: { icon: LucideIcon; tone: Tone; label?: string } = RECIPE_ART[p.key] ?? { icon: WorkflowIcon, tone: "primary" };
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/[0.07]">
      <div className="flex items-start gap-3">
        <IconTile icon={art.icon} tone={art.tone} />
        <div className="grid min-w-0 gap-1">
          {art.label ? (
            <span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
              {n ? `${n} · ` : ""}
              {art.label}
            </span>
          ) : null}
          <span className="font-heading text-[15px] font-semibold">{p.title}</span>
          <span className="text-sm text-muted-foreground">{p.body}</span>
        </div>
      </div>
      <Button variant="outline" size="sm" className="mt-auto self-start" asChild>
        <Link href={`/app/w/${wid}/automations/new?preset=${p.key}`}>
          Use recipe
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </Button>
    </li>
  );
}

export default async function AutomationsPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace } = await requireWorkspace(wid);
  if (!hasFeature(workspace.plan, "automations")) {
    return (
      <>
        <PageHead lesson="6.2" stage="Stage 6" title="Automations" sub="When something happens, do something. Tag, email, DM, score and alert on autopilot." />
        <Locked feature="Automations" wid={wid} />
      </>
    );
  }
  const [list, ctx] = await Promise.all([listAutomations(wid), automationContext(wid)]);
  const suggestions = automationSuggestions(ctx);
  const memberRecipes = AUTOMATION_PRESETS.filter((p) => p.group === "Skool members");
  const leadRecipes = AUTOMATION_PRESETS.filter((p) => p.group === "Leads");
  const on = list.filter((a) => a.active).length;

  return (
    <>
      <PageHead
        lesson="6.2"
        stage="Stage 6"
        title="Automations"
        sub="Little helpers that work 24/7: when something happens, they do something. Welcome, nudge, save and win back members while you sleep."
        first={on === 0 ? "Tell your AI what to automate, or pick a Skool member recipe below." : undefined}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/app/w/${wid}/automations/new`}>
              <PlusIcon data-icon="inline-start" />
              New automation
            </Link>
          </Button>
        }
      />
      <Flash searchParams={await searchParams} />

      <Panel
        data-guide="automation-ai"
        icon={SparklesIcon}
        title="Tell your AI what to automate"
        sub="Say what should happen, to whom and when, in your own words. Your AI builds the trigger and every step, then opens it for you to read and switch on. Nothing runs until you save."
        className="bg-linear-to-br from-accent via-card to-card ring-2 ring-primary/20 dark:from-accent/60"
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

      {list.length ? (
        <Panel icon={ZapIcon} tone="success" title="Your automations" sub={`${on} of ${list.length} switched on. Open one to change it or read its recent runs.`}>
          <ul className="-mx-1 flex flex-col">
            {list.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/app/w/${wid}/automations/${a.id}`}
                  className="group flex items-center gap-3 rounded-xl px-2.5 py-3 text-foreground transition-colors hover:bg-muted hover:no-underline"
                >
                  <span className={cn("size-2.5 shrink-0 rounded-full", a.active ? "bg-success shadow-[0_0_0_4px] shadow-success/15" : "bg-foreground/20")} aria-hidden />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate font-medium group-hover:text-primary">{a.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      When: {TRIGGER_LABELS[a.trigger.type]}
                      {a.trigger.value ? `: ${a.trigger.value}` : ""}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:block">
                    {a.actions.length} step{a.actions.length === 1 ? "" : "s"} · {a.runsCount} run{a.runsCount === 1 ? "" : "s"}
                  </span>
                  {a.active ? (
                    <Badge variant="secondary" className="bg-success-soft text-success">
                      On
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Off</Badge>
                  )}
                  <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="grid gap-1">
          <h2 className="text-xl">Skool member recipes</h2>
          <p className="text-sm text-muted-foreground">One per pile: Welcome, Convert, Save and Win back. Open one, rewrite it in your words, switch it on. They run off your Skool members sync.</p>
        </div>
        <ol className="grid gap-3 @2xl/main:grid-cols-2">
          {memberRecipes.map((p, i) => (
            <Recipe key={p.key} wid={wid} p={p} n={i + 1} />
          ))}
        </ol>
      </section>

      <MoreOptions icon={WorkflowIcon} title="Lead recipes" sub="Turn new leads and DMs into conversations on autopilot.">
        <ul className="grid gap-3 @2xl/main:grid-cols-2">
          {leadRecipes.map((p) => (
            <Recipe key={p.key} wid={wid} p={p} />
          ))}
        </ul>
      </MoreOptions>
    </>
  );
}
