import Link from "next/link";
import {
  ArrowRightIcon,
  ChevronRightIcon,
  FlameIcon,
  MessageCircleReplyIcon,
  PlusIcon,
  SparklesIcon,
  SproutIcon,
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
import { Flash, IconTile, Locked, PageHead, Panel, type Tone } from "@/components/ui";
import { LiveDot, RowList, rowLink } from "@/components/crm-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** A picture per recipe, so the list reads at a glance. */
const RECIPE_ART: Record<string, { icon: LucideIcon; tone: Tone }> = {
  hot: { icon: FlameIcon, tone: "hot" },
  "welcome-dm": { icon: MessageCircleReplyIcon, tone: "primary" },
  nurture: { icon: SproutIcon, tone: "success" },
};

function Recipe({ wid, p }: { wid: string; p: (typeof AUTOMATION_PRESETS)[number] }) {
  const art = RECIPE_ART[p.key] ?? { icon: WorkflowIcon, tone: "primary" as const };
  return (
    <li>
      <Link
        href={`/app/w/${wid}/automations/new?preset=${p.key}`}
        className="group/recipe flex h-full flex-col gap-3 rounded-2xl bg-card p-5 text-foreground no-underline shadow-card ring-1 ring-ink/[0.06] transition-[box-shadow,transform] duration-200 ease-soft hover:-translate-y-0.5 hover:no-underline hover:shadow-lift dark:ring-white/[0.07]"
      >
        <span className="flex items-center gap-3">
          <IconTile icon={art.icon} tone={art.tone} />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">{p.title}</span>
        </span>
        <span className="text-sm leading-relaxed text-muted-foreground">{p.body}</span>
        <span className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary dark:text-violet-300">
          Use recipe
          <ArrowRightIcon className="size-3.5 transition-transform duration-200 group-hover/recipe:translate-x-0.5" aria-hidden />
        </span>
      </Link>
    </li>
  );
}

export default async function AutomationsPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace } = await requireWorkspace(wid);
  if (!hasFeature(workspace.plan, "automations")) {
    return (
      <>
        <PageHead lesson="Season 2" eyebrow="Keep members" title="Automations" sub="When something happens, do something. Tag, email, DM, score and alert on autopilot." />
        <Locked feature="Automations" wid={wid} />
      </>
    );
  }
  const [list, ctx] = await Promise.all([listAutomations(wid), automationContext(wid)]);
  const suggestions = automationSuggestions(ctx);
  const on = list.filter((a) => a.active).length;

  return (
    <>
      <PageHead
        lesson="Season 2"
        eyebrow="Keep members"
        title="Automations"
        sub="Little helpers that work 24/7: when something happens, they do something. Follow up new leads and flag hot ones while you sleep."
        first={on === 0 ? "Tell your AI what to automate, or pick a recipe below." : undefined}
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
        className="bg-[radial-gradient(120%_90%_at_0%_0%,var(--accent),transparent_55%)] ring-violet-200/90 dark:ring-violet-400/20"
      >
        <AutomationAiBox
          action={draftAutomationAction.bind(null, wid, null)}
          suggestions={suggestions}
          placeholder={`e.g. "When someone grabs my free guide, wait a day and email them one tip plus my Skool link. If they turn hot, have my AI draft a follow-up and tell me."`}
          cta="Build it"
          ctaVariant="cta"
          pendingText="Your AI is building it…"
          aiNote={whoBuilds(workspace)}
        />
      </Panel>

      {list.length ? (
        <Panel icon={ZapIcon} tone="success" title="Your automations" sub={`${on} of ${list.length} switched on. Open one to change it or read its recent runs.`}>
          <RowList>
            {list.map((a) => (
              <li key={a.id}>
                <Link href={`/app/w/${wid}/automations/${a.id}`} className={rowLink}>
                  <LiveDot on={a.active} />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate font-medium transition-colors group-hover/row:text-primary dark:group-hover/row:text-violet-300">{a.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      When: {TRIGGER_LABELS[a.trigger.type]}
                      {a.trigger.value ? `: ${a.trigger.value}` : ""}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-xs text-subtle-foreground tabular-nums sm:block">
                    {a.actions.length} step{a.actions.length === 1 ? "" : "s"} · {a.runsCount} run{a.runsCount === 1 ? "" : "s"}
                  </span>
                  <Badge variant={a.active ? "success" : "secondary"}>{a.active ? "On" : "Off"}</Badge>
                  <ChevronRightIcon className="size-4 shrink-0 text-subtle-foreground transition-transform duration-150 group-hover/row:translate-x-0.5 group-hover/row:text-primary" aria-hidden />
                </Link>
              </li>
            ))}
          </RowList>
        </Panel>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="grid gap-1.5">
          <span className="eyebrow">Recipes</span>
          <h2 className="text-[22px] font-semibold tracking-[-0.015em]">Start from one that already works</h2>
          <p className="max-w-[62ch] text-sm leading-relaxed text-muted-foreground">Turn new leads and DMs into conversations on autopilot. Open one, rewrite it in your words, switch it on.</p>
        </div>
        <ul className="grid gap-4 @2xl/main:grid-cols-2 @5xl/main:grid-cols-3">
          {AUTOMATION_PRESETS.map((p) => (
            <Recipe key={p.key} wid={wid} p={p} />
          ))}
        </ul>
      </section>
    </>
  );
}
