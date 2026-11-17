import {
  ActivityIcon,
  BotIcon,
  ClipboardCheckIcon,
  CodeIcon,
  GiftIcon,
  GlobeIcon,
  GraduationCapIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  MousePointerClickIcon,
  PaletteIcon,
  PinIcon,
  RocketIcon,
  RouteIcon,
  ScaleIcon,
  SearchIcon,
  SmartphoneIcon,
  SparklesIcon,
  UserCheckIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { laterStepAction, saveGroupLinkAction, tickStepAction } from "@/actions/journey";
import { SubmitButton } from "@/components/client";
import { NextStep } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { howFor } from "@/lib/guides";
import { fill, JOURNEY_COPY, POST_KEYS, type Where } from "@/lib/week";
import type { Path, WeekStep } from "@/server/path";
import { DayDone, ShelfList, WeekDone } from "./day-done";
import { SkoolPostCard } from "./skool-post-card";
import { StuckSheet } from "./stuck-sheet";

const H = JOURNEY_COPY.hero;

/** A picture for each step, so the big card isn't just words. */
const STEP_ICON: Record<string, LucideIcon> = {
  hello: UsersIcon,
  ai: BotIcon,
  skool: UsersIcon,
  kit: SparklesIcon,
  publish: GlobeIcon,
  pixel: CodeIcon,
  research: SearchIcon,
  statics: PaletteIcon,
  clicks: RocketIcon,
  refresh: PaletteIcon,
  live2: RocketIcon,
  lead1: UserCheckIcon,
  skoolvisit: MousePointerClickIcon,
  events: ActivityIcon,
  welcome: PinIcon,
  unlock: GiftIcon,
  lesson: GraduationCapIcon,
  warm: SmartphoneIcon,
  review: MegaphoneIcon,
  checkin: ClipboardCheckIcon,
  decide: ScaleIcon,
};

const WORD: Record<Where, string> = { app: H.wordYou, skool: H.wordSkool, meta: H.wordMeta, phone: H.wordPhone, you: H.wordYou };

function TickButton({ step, wid, back, label, variant = "outline", waiting }: { step: WeekStep; wid: string; back: string; label: string; variant?: "outline" | "cta"; waiting?: boolean }) {
  return (
    <form action={tickStepAction.bind(null, wid, step.key)}>
      <input type="hidden" name="back" value={back} />
      {waiting ? <input type="hidden" name="as" value="waiting" /> : null}
      <SubmitButton variant={variant} size={variant === "cta" ? "lg" : "default"}>
        {label}
      </SubmitButton>
    </form>
  );
}

/** "Stuck?" and "Do this later": two quiet links under every step. */
function QuietControls({ step, wid, back, skoolGroupUrl }: { step: WeekStep; wid: string; back: string; skoolGroupUrl: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-white/75">
      <StuckSheet step={step} how={howFor(step.key, step.section)?.how} section={step.section} skoolGroupUrl={skoolGroupUrl} wid={wid} back={back} className="hover:text-white" />
      {step.canLater && !step.later ? (
        <form action={laterStepAction.bind(null, wid, step.key)}>
          <input type="hidden" name="back" value={back} />
          <button type="submit" className="text-sm font-medium underline-offset-4 hover:text-white hover:underline">
            {H.later}
          </button>
        </form>
      ) : null}
    </div>
  );
}

const small = "text-[13px] leading-relaxed text-white/70";

/**
 * The page's one pink button, always path.current: the first open step of the earliest day that
 * still has one. On a finished day it's the calm DayDone card instead, and WeekDone at the end.
 */
export function JourneyHero({ path, wid, back }: { path: Path; wid: string; back: string }) {
  const step = path.current;
  if (path.state === "weekDone") return <WeekDone shelf={path.shelf} wid={wid} />;
  if (!step) return null;
  if (path.state === "dayDone" && step.day > 1) return <DayDone day={path.days[step.day - 2]} next={path.days[step.day - 1]} wid={wid} back={back} />;

  const day = path.days[step.day - 1];
  const isPost = POST_KEYS.includes(step.key);
  const laterOnly = step.later && day.steps.filter((s) => !s.done).length === 1;
  const eyebrow = laterOnly
    ? fill(H.eyebrowLaterOnly, { day: step.day })
    : isPost && step.n === step.count
      ? H.eyebrowLast
      : path.state === "first"
        ? fill(H.eyebrowFirst, { n: step.n, count: step.count })
        : fill(H.eyebrowNext, { n: step.n, count: step.count });
  const body = laterOnly ? `${step.why} ${fill(H.laterOnlyBody, { day: step.day })}` : step.why;
  const icon = isPost ? MessageSquareIcon : (STEP_ICON[step.key] ?? RouteIcon);
  const quiet = <QuietControls step={step} wid={wid} back={back} skoolGroupUrl={path.links.skoolGroup} />;
  const common = { eyebrow, icon, "data-step": step.key } as const;

  // Day 1, step 2: start the group on Skool, then paste its link right here.
  if (step.key === "skool") {
    return (
      <NextStep {...common} title={step.title} body={body} href={path.links.referral || undefined} cta={path.links.referral ? step.verb : undefined}>
        <div className="flex flex-col gap-5">
          <p className={small}>{path.links.referral ? H.groupSmall : H.groupNoReferral}</p>
          <form action={saveGroupLinkAction.bind(null, wid)} className="flex flex-col gap-2" data-guide="skool-link">
            <input type="hidden" name="back" value={back} />
            <label htmlFor="journey-skool-url" className="text-sm font-semibold text-white">
              {H.groupField}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="journey-skool-url"
                name="skoolUrl"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder={H.groupPlaceholder}
                className="h-10 border-white/20 bg-white/10 text-white placeholder:text-white/45 sm:max-w-md"
              />
              <SubmitButton variant="outline">{H.groupSave}</SubmitButton>
            </div>
          </form>
          {quiet}
        </div>
      </NextStep>
    );
  }

  // Every day's Skool post: post in that day's section, review the one before, two ticks. It ends
  // Days 3 to 7; on Days 1 and 2 it comes before Publish, so the eyebrow only says "Last step" when it is.
  if (isPost) {
    return (
      <NextStep {...common} title={step.title} body={step.href ? body : `${body} ${JOURNEY_COPY.post.noSkool}.`} href={step.href ?? undefined} cta={step.href ? JOURNEY_COPY.post.openSkool : undefined}>
        <div className="flex flex-col gap-5">
          <SkoolPostCard step={step} wid={wid} back={back} website={path.links.website} />
          {quiet}
        </div>
      </NextStep>
    );
  }

  // Day 6: verdicts need 1,000 impressions. With no ad lead or click yet, say so plainly.
  if (step.key === "review") {
    const nothingYet = !path.events.adLead && !path.events.adClick;
    return (
      <NextStep
        {...common}
        eyebrow={nothingYet && !laterOnly ? H.reviewWaitEyebrow : eyebrow}
        title={nothingYet ? H.reviewWaitTitle : step.title}
        body={nothingYet ? H.reviewWaitBody : body}
        href={step.href ?? undefined}
        cta={nothingYet ? H.reviewWaitCta : step.verb}
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <TickButton step={step} wid={wid} back={back} label={step.waitingLabel ?? ""} waiting />
          </div>
          {quiet}
        </div>
      </NextStep>
    );
  }

  // Day 7: the private call. The facts the app can see, then one tick that stores only the time.
  if (step.key === "decide") {
    return (
      <NextStep {...common} title={step.title} body={body}>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.07] px-4 py-4 ring-1 ring-white/10">
            <p className="text-sm font-semibold text-white">{H.decideFacts}</p>
            {path.shelf.empty ? <p className={small}>{H.decideEmpty}</p> : null}
            <ShelfList shelf={path.shelf} tone="night" className="text-white" />
          </div>
          <div className="flex flex-col gap-2">
            <TickButton step={step} wid={wid} back={back} label={step.selfLabel ?? step.verb} variant="cta" />
            {step.note ? <p className={small}>{step.note}</p> : null}
          </div>
          {quiet}
        </div>
      </NextStep>
    );
  }

  // Done outside the app (Ads Manager, Events Manager, their own group, their phone): the
  // outside link is the pink button, and the tick beside it is the member's word.
  if (step.tick === null && step.selfLabel) {
    return (
      <NextStep {...common} title={step.title} body={body} href={step.href ?? undefined} cta={step.href ? step.verb : undefined}>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            {!step.href ? <p className="text-sm text-white/85">{H.noOwnGroup}</p> : null}
            <div className="flex flex-wrap items-center gap-3">
              <TickButton step={step} wid={wid} back={back} label={step.selfLabel} />
            </div>
            <p className={small}>{step.note ?? WORD[step.where]}</p>
          </div>
          {quiet}
        </div>
      </NextStep>
    );
  }

  return (
    <NextStep {...common} title={step.title} body={body} href={step.href ?? undefined} cta={step.href ? step.verb : undefined}>
      {quiet}
    </NextStep>
  );
}
