import Link from "next/link";
import { ArrowRightIcon, GraduationCapIcon, FlameIcon, HeartHandshakeIcon, TriangleAlertIcon, UserMinusIcon, UsersIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { skoolMemberCounts, listChurnedSkoolContacts } from "@/server/skool";
import { contactName } from "@/server/contacts";
import { relativeTime } from "@/lib/util";
import { syncSkoolAction } from "@/actions/skool";
import { Callout, Empty, Flash, PageHead, Panel, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SkoolImport } from "./import";
import { PlanCalculator } from "./calculator";

export const metadata = { title: "Skool members" };

export default async function SkoolPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace } = await requireWorkspace(wid);
  const [counts, churned] = await Promise.all([skoolMemberCounts(wid), listChurnedSkoolContacts(wid, 8)]);
  const base = `/app/w/${wid}`;

  return (
    <>
      <PageHead
        eyebrow="Skool CRM"
        title="Skool members"
        sub="Bring your Skool community into your CRM. Trials, paying members and churn land on the same timeline as your leads, so your automations can welcome, convert and win them back."
      />
      <Flash searchParams={await searchParams} />

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat icon={GraduationCapIcon} label="On trial" value={counts.trials} />
        <Stat icon={UsersIcon} label="Paying members" value={counts.members} hint={counts.cancelling ? `${counts.cancelling} cancelling` : undefined} />
        <Stat icon={FlameIcon} label="Cancelling" value={counts.cancelling} hint="Still paid, worth saving" />
        <Stat icon={UserMinusIcon} label="Churned" value={counts.churned} />
      </div>

      <Panel
        title="Sync your members"
        sub="Export your member list from Skool (Members tab → Export), then upload or paste it here. Takes about 2 minutes. Do it daily or weekly to keep churn current."
      >
        <form action={syncSkoolAction.bind(null, wid)} className="flex flex-col gap-4">
          <SkoolImport />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">This upload is…</legend>
            <Label className="flex items-start gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-accent">
              <input type="radio" name="mode" value="full" defaultChecked className="mt-0.5" />
              <span>
                <span className="font-medium">My full member list</span>
                <span className="block text-sm text-muted-foreground">Anyone we track as a Skool member who isn’t in this file is marked churned, so win-back automations run. Use the complete Export.</span>
              </span>
            </Label>
            <Label className="flex items-start gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-accent">
              <input type="radio" name="mode" value="partial" className="mt-0.5" />
              <span>
                <span className="font-medium">A partial list</span>
                <span className="block text-sm text-muted-foreground">Only add or update the people in this file. Nobody is marked churned. Use for a quick paste of a few new members.</span>
              </span>
            </Label>
          </fieldset>
          <div>
            <SubmitButton pendingText="Syncing…">Sync members</SubmitButton>
          </div>
        </form>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Hobby or Pro?" sub="Start on Skool's $9 Hobby plan and keep every dollar of markup. Switch to Pro only when the math says so.">
          <PlanCalculator wid={wid} initialMembers={counts.members + counts.trials} initialPrice={workspace.settings.skoolMemberPrice ?? 9} />
        </Panel>

        <Panel title="Ads that optimize for paying members" sub="Most people optimize ads for signups. You can optimize for who actually pays.">
          <ul className="flex flex-col gap-2.5 text-sm">
            <li className="flex gap-2.5"><GraduationCapIcon className="mt-0.5 size-4 shrink-0 text-primary" /><span>A new trial sends Meta a <b>StartTrial</b> event.</span></li>
            <li className="flex gap-2.5"><UsersIcon className="mt-0.5 size-4 shrink-0 text-primary" /><span>A trial converting to paid sends a <b>Subscribe</b> event, with your member price as its value.</span></li>
          </ul>
          <Callout tone={workspace.settings.metaPixelId ? "ok" : "info"} className="mt-1">
            {workspace.settings.metaPixelId
              ? <>Your pixel is connected, so these fire automatically on each sync. Point your campaign at the <b>Subscribe</b> event to find more payers.</>
              : <>Connect your Meta Pixel in <Link href={`${base}/settings#tracking`}>Settings</Link> to turn this on. Works on Skool’s Hobby plan, because tracking lives on your funnel.</>}
          </Callout>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="How this turns into members" sub="Every status becomes a stage your automations already understand.">
          <ul className="flex flex-col gap-2.5 text-sm">
            <li className="flex gap-2.5"><GraduationCapIcon className="mt-0.5 size-4 shrink-0 text-primary" /><span><b>Trial</b> → stage “On free trial”. Fire a welcome and a day-5 nudge to convert them.</span></li>
            <li className="flex gap-2.5"><UsersIcon className="mt-0.5 size-4 shrink-0 text-primary" /><span><b>Active</b> → stage “Paying member”. Trigger onboarding and ask for a win.</span></li>
            <li className="flex gap-2.5"><TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" /><span><b>Cancelling</b> → tagged <code>skool-cancelling</code> while still paid. Send a save offer.</span></li>
            <li className="flex gap-2.5"><UserMinusIcon className="mt-0.5 size-4 shrink-0 text-destructive" /><span><b>Churned</b> → stage “Lost”. Start a win-back sequence.</span></li>
          </ul>
          <Callout tone="info" className="mt-1">
            Build these flows in <Link href={`${base}/automations`}>Automations</Link> with the trigger “Stage changed”. No Skool login or extension needed, so no account is ever at risk.
          </Callout>
        </Panel>

        <Panel
          title="Recently churned"
          sub="Your win-back list."
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${base}/leads?stage=lost`}>All lost <ArrowRightIcon data-icon="inline-end" /></Link>
            </Button>
          }
        >
          {churned.length === 0 ? (
            <Empty icon={HeartHandshakeIcon} title="No churn yet" body="When a member leaves, they’ll show here, ready to win back." />
          ) : (
            <ul className="flex flex-col divide-y">
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
      </div>
    </>
  );
}
