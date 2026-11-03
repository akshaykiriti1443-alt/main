import Link from "next/link";
import {
  ArrowRightIcon,
  CircleCheckIcon,
  CrosshairIcon,
  GraduationCapIcon,
  HeartHandshakeIcon,
  TriangleAlertIcon,
  UserMinusIcon,
  UsersIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { skoolMemberCounts, listChurnedSkoolContacts } from "@/server/skool";
import { contactName } from "@/server/contacts";
import { relativeTime } from "@/lib/util";
import { syncSkoolAction } from "@/actions/skool";
import { removeSkoolInviteAction, saveSkoolInviteAction, testSkoolInviteAction } from "@/actions/skoolInvite";
import { SkoolInviteCard } from "@/components/skool-invite-card";
import { hobbyStatus, welcomeQueue } from "@/server/skoolHobby";
import { WelcomeQueue } from "./welcome-queue";
import { HobbyPlugins } from "./hobby-plugins";
import { cn } from "@/lib/utils";
import { Callout, Empty, Flash, IconTile, LessonTag, MoreOptions, PageHead, Panel, type Tone } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SkoolImport } from "./import";
import { PlanCalculator } from "./calculator";

export const metadata = { title: "Skool members" };

/** The four piles a sync sorts people into, and what your automations do with each. */
type Counts = Awaited<ReturnType<typeof skoolMemberCounts>>;
const PILES: { key: keyof Counts; icon: LucideIcon; tone: Tone; name: string; stage: string; then: string }[] = [
  { key: "trials", icon: GraduationCapIcon, tone: "primary", name: "Trial", stage: "On free trial", then: "Welcome them, then a day-5 nudge to convert." },
  { key: "members", icon: UsersIcon, tone: "success", name: "Paying", stage: "Paying member", then: "Onboard them and ask for a win." },
  { key: "cancelling", icon: TriangleAlertIcon, tone: "warning", name: "Cancelling", stage: "tagged skool-cancelling", then: "Still paid. Send a save offer." },
  { key: "churned", icon: UserMinusIcon, tone: "muted", name: "Churned", stage: "Lost", then: "Gone. Start a win-back sequence." },
];

export default async function SkoolPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace, user } = await requireWorkspace(wid);
  const [queue, hobby] = await Promise.all([welcomeQueue(wid), hobbyStatus(wid)]);
  const [counts, churned] = await Promise.all([skoolMemberCounts(wid), listChurnedSkoolContacts(wid, 8)]);
  const base = `/app/w/${wid}`;
  const priceSaved = Boolean(workspace.settings.skoolMemberPrice);
  const synced = counts.total > 0;

  // The four piles, with how many people are in each. Zeros are fine here: each pile says what it's for.
  const piles = (
    <ol className="grid grid-cols-2 gap-2.5 @2xl/main:grid-cols-4">
      {PILES.map((p, i) => (
        <li key={p.name} className="relative flex flex-col gap-1.5 rounded-xl border bg-card p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-heading font-semibold">{p.name}</span>
            <IconTile icon={p.icon} tone={p.tone} className="size-7 rounded-lg" />
          </div>
          <span className="font-heading text-[28px] leading-none font-bold tabular-nums">{counts[p.key].toLocaleString()}</span>
          <span className="mt-1 text-xs font-semibold text-foreground">→ {p.stage}</span>
          <span className="text-xs text-muted-foreground">{p.then}</span>
          {i < PILES.length - 1 ? (
            <ArrowRightIcon className="absolute top-1/2 -right-2.5 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-background text-muted-foreground @2xl/main:block" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <PageHead
        lesson={priceSaved ? "6.1" : "1.5"}
        stage={priceSaved ? "Stage 6" : "Stage 1"}
        eyebrow="Skool CRM"
        title="Skool members"
        sub="Your Skool community inside your CRM: who's on trial, who pays and who's slipping away, so your automations can welcome, convert and win them back."
        first={!priceSaved ? "Save your member price in step 1." : !synced ? "Upload your Skool member export in step 2." : undefined}
      />
      <Flash searchParams={await searchParams} />

      {synced ? (
        <Panel icon={UsersIcon} title="Your four piles" sub="Everyone from your last sync, sorted. Each pile is a stage your automations already understand.">
          {piles}
        </Panel>
      ) : null}

      <Panel
        {...(priceSaved ? { icon: CircleCheckIcon, tone: "success" as const } : { step: 1 })}
        title={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            Set your member price <LessonTag lesson="1.5" />
          </span>
        }
        sub="What one member pays you each month. Meta uses it to learn what a paying member is worth, so your ads find more of them."
        className={cn(!priceSaved && "ring-2 ring-primary/25")}
      >
        <PlanCalculator wid={wid} initialMembers={counts.members + counts.trials} initialPrice={workspace.settings.skoolMemberPrice ?? 9} saved={priceSaved} primary={!priceSaved} />
      </Panel>

      <Panel
        {...(synced ? { icon: CircleCheckIcon, tone: "success" as const } : { step: 2 })}
        title={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            Sync your members <LessonTag lesson="6.1" />
          </span>
        }
        sub={
          <>
            In Skool, open <b className="font-medium text-foreground">Members → Export</b>, then upload the file here. About 2 minutes. Do it every week so churn stays current.
          </>
        }
        className={cn(priceSaved && !synced && "ring-2 ring-primary/25")}
      >
        <form id="skool-sync" data-guide="skool-sync" action={syncSkoolAction.bind(null, wid)} className="flex scroll-mt-24 flex-col gap-4">
          <SkoolImport />
          <MoreOptions title="Only adding a few people?" sub="Pick a partial list, so nobody gets marked as churned by mistake.">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">This upload is…</legend>
              <Label className="flex items-start gap-3 rounded-xl border p-3 font-normal has-checked:border-primary/40 has-checked:bg-accent">
                <input type="radio" name="mode" value="full" defaultChecked className="mt-0.5" />
                <span>
                  <span className="font-medium">My full member list</span>
                  <span className="block text-sm text-muted-foreground">Anyone we track as a Skool member who isn’t in this file is marked churned, so win-back automations run. Use the complete Export.</span>
                </span>
              </Label>
              <Label className="flex items-start gap-3 rounded-xl border p-3 font-normal has-checked:border-primary/40 has-checked:bg-accent">
                <input type="radio" name="mode" value="partial" className="mt-0.5" />
                <span>
                  <span className="font-medium">A partial list</span>
                  <span className="block text-sm text-muted-foreground">Only add or update the people in this file. Nobody is marked churned. Good for a quick paste of a few new members.</span>
                </span>
              </Label>
            </fieldset>
          </MoreOptions>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton size={priceSaved ? "lg" : "default"} variant={priceSaved ? "default" : "outline"} pendingText="Syncing…">
              Sync members
            </SubmitButton>
            <span className="text-xs text-muted-foreground">No Skool login needed, so your account is never at risk.</span>
          </div>
        </form>
      </Panel>

      <SkoolInviteCard
        connected={workspace.settings.skoolInviteHint ?? null}
        save={saveSkoolInviteAction.bind(null, wid)}
        test={testSkoolInviteAction.bind(null, wid)}
        remove={removeSkoolInviteAction.bind(null, wid)}
        defaultEmail={user.email}
        recipeHref={`/app/w/${wid}/automations/new?preset=skool-invite-leads`}
      />

      {queue.length ? <WelcomeQueue wid={wid} rows={queue} skoolUrl={workspace.settings.skoolUrl} /> : null}

      <HobbyPlugins wid={wid} status={hobby} />

      {synced ? (
        <div className="grid items-start gap-5 @3xl/main:grid-cols-2">
          <Panel
            icon={HeartHandshakeIcon}
            tone="warning"
            title="Recently churned"
            sub="Your win-back list. One kind message brings more back than you'd think."
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link href={`${base}/leads?stage=lost`}>
                  All lost <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            }
          >
            {churned.length === 0 ? (
              <Empty icon={HeartHandshakeIcon} tone="success" title="Nobody has left" body="When a member leaves, they show up here, ready to win back." />
            ) : (
              <ul className="-my-1 flex flex-col divide-y">
                {churned.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`${base}/leads/${c.id}`} className="min-w-0 font-medium text-foreground">
                      <span className="block truncate">{contactName(c)}</span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">{c.email}</span>
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(c.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel icon={ZapIcon} tone="success" title="Put the piles to work" sub="Four recipes, one per pile: Welcome, Convert, Save and Win back. Switch them on once and every sync feeds them.">
            <Callout tone="tip">Read each email out loud before you switch it on. If it doesn&apos;t sound like you, change it.</Callout>
            <Button asChild className="self-start">
              <Link href={`${base}/automations`}>
                Open Automations <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </Panel>
        </div>
      ) : (
        <Panel icon={UsersIcon} title="Your four piles" sub="Your first sync sorts everyone into these. Four zeros is a real start: it means the system is ready for member one.">
          {piles}
          <Callout tone="tip">
            Each pile has a ready-made recipe in <Link href={`${base}/automations`}>Automations</Link>: Welcome, Convert, Save and Win back. Switch them on before member one arrives.
          </Callout>
        </Panel>
      )}

      <MoreOptions icon={CrosshairIcon} title="Ads that find payers, not just sign-ups" sub="Each sync tells Meta who started a trial and who paid.">
        <ul className="flex flex-col gap-2.5 text-sm">
          <li className="flex gap-2.5">
            <GraduationCapIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              A new trial sends Meta a <b>StartTrial</b> event.
            </span>
          </li>
          <li className="flex gap-2.5">
            <UsersIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span>
              A trial turning into a paying member sends a <b>Subscribe</b> event, with your member price as its value.
            </span>
          </li>
        </ul>
        <Callout tone={workspace.settings.metaPixelId ? "ok" : "info"}>
          {workspace.settings.metaPixelId ? (
            <>
              Your pixel is connected, so these fire on every sync. Point your campaign at the <b>Subscribe</b> event to find more payers.
            </>
          ) : (
            <>
              Connect your Meta Pixel in <Link href={`${base}/settings#tracking`}>Settings</Link> to switch this on. Works on Skool’s Hobby plan, because tracking lives on your funnel.
            </>
          )}
        </Callout>
      </MoreOptions>
    </>
  );
}
