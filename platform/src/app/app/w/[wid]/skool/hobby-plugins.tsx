import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCheckIcon,
  CircleHelpIcon,
  CirclePlayIcon,
  LinkIcon,
  MessageCircleIcon,
  PuzzleIcon,
  SearchIcon,
  TrendingUpIcon,
  Undo2Icon,
  WebhookIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { saveSkoolVideosAction } from "@/actions/skoolHobby";
import { cn } from "@/lib/utils";
import { MoreOptions, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { hobbyStatus } from "@/server/skoolHobby";

type Status = Awaited<ReturnType<typeof hobbyStatus>>;
type Row = {
  icon: LucideIcon;
  plugin: string;
  pro: boolean;
  how: string;
  state?: { label: string; on: boolean };
  go?: { href: string; label: string };
};

/**
 * Skool's plugin list, row by row, with what this CRM does instead on the Hobby plan. Nothing here
 * unlocks Pro inside Skool; each row is an equivalent that runs from the member export, the group's
 * own link and email.
 */
export function HobbyPlugins({ wid, status }: { wid: string; status: Status }) {
  const base = `/app/w/${wid}`;
  const rows: Row[] = [
    {
      icon: CircleHelpIcon,
      plugin: "Membership questions",
      pro: false,
      how: "Free in Skool, so switch it on and ask why they joined. Every answer comes in with your weekly export and lands on the member, where your AI uses it for their hello.",
      state: { label: status.answers ? `${status.answers} with answers` : "No answers yet", on: status.answers > 0 },
      go: { href: "#skool-sync", label: "Sync" },
    },
    {
      icon: MessageCircleIcon,
      plugin: "Auto DM new members",
      pro: true,
      how: "Today's hellos: your AI writes a personal DM for each new member, you paste and send it in Skool. Better than a bot, and it takes ten seconds.",
      state: { label: status.welcomeWaiting ? `${status.welcomeWaiting} waiting` : "All said hi", on: status.welcomeWaiting === 0 },
      go: status.welcomeWaiting ? { href: "#welcome-queue", label: "Say hi" } : undefined,
    },
    {
      icon: CirclePlayIcon,
      plugin: "Onboarding video",
      pro: true,
      how: "Your Welcome email opens with your video, the moment the sync sees a new member.",
      state: { label: status.onboardingVideo && status.welcomeEmailOn ? "On" : status.onboardingVideo ? "Video saved, switch on Welcome" : "Add your video", on: status.onboardingVideo && status.welcomeEmailOn },
      go: status.welcomeEmailOn ? undefined : { href: `${base}/automations/new?preset=skool-welcome`, label: "Welcome recipe" },
    },
    {
      icon: Undo2Icon,
      plugin: "Cancellation video",
      pro: true,
      how: "When someone cancels, your Save email sends your 'before you go' video while they still have access.",
      state: { label: status.cancelVideo && status.saveEmailOn ? "On" : status.cancelVideo ? "Video saved, switch on Save" : "Add your video", on: status.cancelVideo && status.saveEmailOn },
      go: status.saveEmailOn ? undefined : { href: `${base}/automations/new?preset=skool-save`, label: "Save recipe" },
    },
    {
      icon: TrendingUpIcon,
      plugin: "Meta pixel tracking",
      pro: true,
      how: "Your Skool link tells Meta about every About-page visit (server-side), and your sync tells it who started a trial and who paid. Ads learn without Skool's pixel.",
      state: { label: status.pixel ? "On" : "Off", on: status.pixel },
      go: status.pixel ? undefined : { href: `${base}/settings#tracking`, label: "Connect" },
    },
    {
      icon: SearchIcon,
      plugin: "Google ads tracking",
      pro: true,
      how: "Point Google and YouTube ads at your Skool link with ?src=google. Every click is counted by source on Growth ladder. Sending conversions back to Google isn't built yet.",
      state: { label: `${status.googleClicks} Google clicks`, on: status.googleClicks > 0 },
      go: { href: `${base}/growth`, label: "Your link" },
    },
    {
      icon: ZapIcon,
      plugin: "Zapier integration",
      pro: true,
      how: "Answers already reach this CRM through your export, rewards go out through Unlocks, and Skool's own level-unlock courses are free.",
      state: { label: status.unlocks ? `${status.unlocks} unlocks` : "No unlocks yet", on: status.unlocks > 0 },
      go: { href: `${base}/unlocks`, label: "Unlocks" },
    },
    {
      icon: WebhookIcon,
      plugin: "Webhook",
      pro: true,
      how: "On Hobby, email people your Skool link instead: a free group lets them straight in. On Pro, connect Auto-invite above and they get Skool's own invite.",
      state: { label: status.invite ? "Auto-invite on" : "Link by email", on: true },
    },
    {
      icon: CheckCheckIcon,
      plugin: "Instant approval",
      pro: true,
      how: "Your opt-in page screens people before they reach Skool, so approving the requests once a day takes a minute.",
    },
    {
      icon: LinkIcon,
      plugin: "Links",
      pro: true,
      how: "Pin a 'Start here' post with your links. Pinned posts are free on every plan.",
    },
  ];

  return (
    <Panel
      id="hobby-plugins"
      icon={PuzzleIcon}
      className="scroll-mt-24"
      title="Skool Pro plugins, the Hobby way"
      sub="Skool keeps these behind Pro ($99/month). Nobody can unlock them inside Skool without breaking its rules, so here's what this app does instead, on any plan."
    >
      <ul className="-my-1 flex flex-col divide-y">
        {rows.map((r) => (
          <li key={r.plugin} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
              <r.icon className="size-[18px]" aria-hidden />
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="flex flex-wrap items-center gap-2">
                <b className="font-semibold">{r.plugin}</b>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", r.pro ? "bg-muted text-muted-foreground" : "bg-success-soft text-success")}>
                  {r.pro ? "Pro in Skool" : "Free in Skool"}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">{r.how}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
              {r.state ? (
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", r.state.on ? "bg-success-soft text-success" : "bg-gold-soft text-gold-foreground")}>
                  {r.state.label}
                </span>
              ) : null}
              {r.go ? (
                <Link href={r.go.href} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  {r.go.label} <ArrowRightIcon className="size-3" aria-hidden />
                </Link>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <MoreOptions title="Your welcome and 'before you go' videos" sub="Loom, YouTube, Vimeo or a Google Drive link. They go into your Welcome and Save emails.">
        <form action={saveSkoolVideosAction.bind(null, wid)} className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="onboardingVideoUrl">Welcome video</FieldLabel>
            <Input id="onboardingVideoUrl" name="onboardingVideoUrl" type="url" placeholder="https://www.loom.com/share/…" defaultValue={status.settings.onboardingVideoUrl} />
            <FieldDescription>Two minutes: who you are, and the one lesson to start with.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="cancelVideoUrl">&ldquo;Before you go&rdquo; video</FieldLabel>
            <Input id="cancelVideoUrl" name="cancelVideoUrl" type="url" placeholder="https://youtu.be/…" defaultValue={status.settings.cancelVideoUrl} />
            <FieldDescription>One minute, no guilt: what they&apos;d miss, and how to tell you what didn&apos;t click.</FieldDescription>
          </Field>
          <SubmitButton className="self-start" pendingText="Saving…">
            Save videos
          </SubmitButton>
        </form>
      </MoreOptions>
    </Panel>
  );
}
