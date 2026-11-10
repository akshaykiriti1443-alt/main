import Link from "next/link";
import type { ReactNode } from "react";
import {
  CalculatorIcon,
  CameraIcon,
  CheckIcon,
  ChevronLeftIcon,
  ClapperboardIcon,
  Clock3Icon,
  FlameIcon,
  GaugeIcon,
  GlobeIcon,
  HistoryIcon,
  ImageIcon,
  LayersIcon,
  LightbulbIcon,
  LinkIcon,
  PaletteIcon,
  PowerOffIcon,
  RefreshCwIcon,
  RocketIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StethoscopeIcon,
  TargetIcon,
  TrendingUpIcon,
  UserRoundIcon,
  UsersRoundIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react";
import { env } from "@/lib/env";
import { isUuid, relativeTime, truncate } from "@/lib/util";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/server/tenancy";
import { skoolLinkFor, skoolTargetFor } from "@/server/growth";
import { AI_PROVIDERS, aiCredsFor } from "@/server/ai/client";
import { ANGLE_LABEL, type AdAngle } from "@/server/ai/adFramework";
import {
  adStudioDefaults,
  afterLaunch,
  DESTINATION_LABEL,
  FORMAT_LABEL,
  getAdStudioPack,
  latestResearchAds,
  listAdStudioPacks,
  numbersLines,
  publishedFunnelUrl,
  staticText,
  STUDIO_COUNTRIES,
  videoFromConcept,
  videoText,
  type LaunchPlan,
  type NumbersLine,
  type StaticConcept,
  type StaticFormat,
  type StudioDestination,
  type StudioNumbers,
  type StudioTone,
} from "@/server/ai/adStudio";
import { adStudioAction } from "@/actions/adStudio";
import { Callout, Flash, MoreOptions, PageHead, Panel, Stat, StepDot } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { BudgetPicker } from "./budget-picker";

export const metadata = { title: "Ad studio" };
export const maxDuration = 300;

const CARD = "rounded-2xl bg-card ring-1 ring-ink/[0.06] shadow-xs dark:ring-white/[0.07]";
const LABEL = "text-[11px] font-semibold tracking-[0.08em] text-subtle-foreground uppercase";

/** Same colours as Ad research's angles to borrow, so an angle looks the same everywhere. */
const ANGLE_CHIP: Record<AdAngle, string> = {
  pain: "bg-hot-soft text-hot",
  dream: "bg-gold-soft text-gold-foreground",
  lesson: "bg-accent text-accent-foreground",
  proof: "bg-success-soft text-success",
};

const LINE_ICON: Record<NumbersLine["key"], LucideIcon> = {
  assumption: CalculatorIcon,
  level2: TrendingUpIcon,
  statics: LayersIcon,
  target: TargetIcon,
  images: ImageIcon,
  social: UsersRoundIcon,
};

const AFTER_ICON: LucideIcon[] = [Clock3Icon, StethoscopeIcon, PowerOffIcon, RefreshCwIcon];

const CHOICE =
  "flex cursor-pointer items-center gap-3 rounded-xl border border-border-strong bg-card px-3.5 py-3 text-sm shadow-xs transition-colors duration-150 select-none hover:border-violet-200 hover:bg-accent/60 has-checked:border-primary has-checked:bg-accent has-checked:ring-1 has-checked:ring-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/40 has-disabled:cursor-not-allowed has-disabled:opacity-60 dark:bg-white/[0.03] dark:hover:border-white/20";

const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
const statRange = (a: number, b: number) => {
  const lo = Math.max(1, Math.round(a));
  const hi = Math.max(1, Math.round(b));
  return lo === hi ? lo.toLocaleString() : `${lo.toLocaleString()}–${hi.toLocaleString()}`;
};

export default async function AdStudioPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace } = await requireWorkspace(wid);
  const [packs, defaults, research, creds, skoolTarget, funnelUrl] = await Promise.all([
    listAdStudioPacks(wid, 8),
    adStudioDefaults(workspace),
    latestResearchAds(wid),
    aiCredsFor(wid),
    skoolTargetFor(wid, workspace.settings.skoolUrl),
    publishedFunnelUrl(wid),
  ]);
  const chosen = isUuid(sp.pack) ? (packs.find((p) => p.id === sp.pack) ?? (await getAdStudioPack(wid, sp.pack))) : (packs[0] ?? null);
  const pack = chosen?.pack ?? null;
  const base = `/app/w/${wid}`;
  const link = skoolLinkFor(workspace.slug);
  const tone: StudioTone = (chosen?.input.tone as StudioTone) ?? defaults.tone;

  // "Build it on another static": a rule-based script from that static's own Hook, Turn and Door.
  const v = Number(sp.video);
  const video =
    pack && Number.isInteger(v) && v >= 0 && v < pack.statics.length && v !== pack.video.basedOn ? videoFromConcept(pack.statics[v], v, Boolean(chosen?.input.proof)) : (pack?.video ?? null);

  const aiLine = creds
    ? `Runs on your ${AI_PROVIDERS[creds.provider].label}. Takes about a minute.`
    : env.aiEnabled
      ? "Uses 1 AI generation. Takes about a minute."
      : null;

  const form = (
    <form action={adStudioAction.bind(null, wid)} className="flex flex-col gap-6">
      <fieldset className="flex flex-col">
        <legend className="mb-2.5 text-[13.5px] font-medium">Where do these ads go?</legend>
        <div className="grid gap-2 @md/main:grid-cols-2">
          <label className={CHOICE}>
            <input type="radio" name="destination" value="website" defaultChecked={defaults.destination === "website"} disabled={!funnelUrl} className="sr-only" />
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-primary ring-1 ring-violet-200/70 ring-inset dark:text-violet-300 dark:ring-white/[0.06]">
              <GlobeIcon className="size-4" aria-hidden />
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span className="font-semibold">{DESTINATION_LABEL.website}</span>
              <span className="truncate text-xs text-muted-foreground">{funnelUrl ? `Leads · ${funnelUrl.replace(/^https?:\/\//, "")}` : "Publish your funnel first"}</span>
            </span>
          </label>
          <label className={CHOICE}>
            <input type="radio" name="destination" value="skool" defaultChecked={defaults.destination !== "website"} className="sr-only" />
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground ring-1 ring-ink/[0.04] ring-inset dark:ring-white/[0.05]">
              <LinkIcon className="size-4" aria-hidden />
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span className="font-semibold">{DESTINATION_LABEL.skool}</span>
              <span className="truncate font-mono text-[11.5px] text-muted-foreground">Traffic · {link.replace(/^https?:\/\//, "")}</span>
            </span>
          </label>
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
          Day 1&apos;s ads go to your website. Day 2&apos;s go to your Skool link, in their own campaign.{" "}
          {funnelUrl ? null : (
            <>
              <Link href={`${base}/sites`}>Publish your funnel</Link> to send ads to your website.
            </>
          )}
        </p>
      </fieldset>
      <BudgetPicker initial={defaults.budget} />
      <div className="grid gap-5 @2xl/main:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="country">Country</FieldLabel>
          <NativeSelect id="country" name="country" defaultValue={defaults.country} className="w-full">
            {STUDIO_COUNTRIES.map(([c, label]) => (
              <NativeSelectOption key={c} value={c}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>Where your members live. One country is easiest to start.</FieldDescription>
        </Field>
        {skoolTarget ? (
          <Field>
            <FieldLabel>Your Skool link</FieldLabel>
            <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{link}</span>
            </div>
            <FieldDescription>Skool-link ads point here. It counts the visit, then opens your Skool About page.</FieldDescription>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="skoolUrl">Your Skool group link</FieldLabel>
            <Input id="skoolUrl" name="skoolUrl" type="url" placeholder="https://www.skool.com/your-group" />
            <FieldDescription>Your Skool-link ads and your Join button send people here.</FieldDescription>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="audience">Who it&apos;s for, in your words</FieldLabel>
          <Input id="audience" name="audience" defaultValue={defaults.audience} placeholder="Busy dads over 40 with desk jobs" />
        </Field>
        <Field>
          <FieldLabel htmlFor="promise">The result you promise</FieldLabel>
          <Input id="promise" name="promise" defaultValue={defaults.promise} placeholder="Feel fit again in 20 minutes a day" />
        </Field>
      </div>

      <MoreOptions icon={PaletteIcon} title="Fine-tune (optional)" sub="Your community, offer, price, tone and a real member result. Already filled from your workspace.">
        <div className="grid gap-5 @2xl/main:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="businessName">Community name</FieldLabel>
            <Input id="businessName" name="businessName" defaultValue={defaults.businessName} />
          </Field>
          <Field>
            <FieldLabel htmlFor="niche">What you help with</FieldLabel>
            <Input id="niche" name="niche" defaultValue={defaults.niche} placeholder="Fitness for busy dads" />
          </Field>
          <Field>
            <FieldLabel htmlFor="offer">Your offer</FieldLabel>
            <Input id="offer" name="offer" defaultValue={defaults.offer} placeholder="Free checklist: The 7-Day Dad Reset" />
            <FieldDescription>What these ads sell. Website ads: Free checklist: its name. Skool-link ads: 7-day free trial of your group.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="price">Your Skool price a month</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-subtle-foreground">$</span>
              <Input id="price" name="price" inputMode="decimal" defaultValue={defaults.price ? String(defaults.price) : ""} placeholder="29" className="pl-7 tabular-nums" />
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="tone">Tone</FieldLabel>
            <NativeSelect id="tone" name="tone" defaultValue={defaults.tone} className="w-full">
              <NativeSelectOption value="friendly">Friendly</NativeSelectOption>
              <NativeSelectOption value="bold">Bold</NativeSelectOption>
              <NativeSelectOption value="calm">Calm</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field className="@2xl/main:col-span-2">
            <FieldLabel htmlFor="proof">A real member result</FieldLabel>
            <Textarea id="proof" name="proof" rows={2} defaultValue={defaults.proof} placeholder="Leave empty if you don't have one yet. Real words only, with their yes." />
            <FieldDescription>Unlocks a Proof static. No real result, no Proof ad: that would be a fake testimonial.</FieldDescription>
          </Field>
        </div>
      </MoreOptions>

      <MoreOptions icon={FlameIcon} title="Borrow from long-running ads (optional)" sub="Pick competitor ads from Ad research, or paste some. We borrow the rhythm, never the words.">
        {research ? (
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2 text-[13.5px] font-medium">
              From your Ad research{research.query ? ` for “${truncate(research.query, 40)}”` : ""} · {relativeTime(research.createdAt)}
            </legend>
            <input type="hidden" name="researchId" value={research.id} />
            <ul className="grid gap-2">
              {research.ads.map((a, i) => (
                <li key={i}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-background/60 p-3 text-sm ring-1 ring-ink/[0.06] transition-colors ring-inset hover:bg-accent/60 has-checked:bg-accent has-checked:ring-violet-200 dark:bg-white/[0.02] dark:ring-white/[0.07]">
                    <input type="checkbox" name="pick" value={i} defaultChecked={a.daysRunning >= 30 && i < 3} className="mt-0.5 size-4 shrink-0" />
                    <span className="grid min-w-0 flex-1 gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{a.page || "Competitor"}</span>
                        <Badge variant="secondary" className={a.daysRunning >= 30 ? "bg-hot-soft text-hot" : undefined}>
                          {a.daysRunning >= 30 ? <FlameIcon data-icon="inline-start" /> : null}
                          {a.daysRunning} days
                        </Badge>
                      </span>
                      <span className="leading-relaxed text-muted-foreground">{truncate(a.text, 180)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : (
          <p className="text-sm text-muted-foreground">
            No Ad research yet. <Link href={`${base}/ads/research`}>Search your niche in Ad research</Link> and the long-runners show up here to pick from. Or paste a few below.
          </p>
        )}
        <Field>
          <FieldLabel htmlFor="paste">Paste ads</FieldLabel>
          <Textarea id="paste" name="paste" rows={4} className="font-mono text-[13px] leading-relaxed" placeholder={"[62 days] Tired of guessing what to eat? Inside our group…\n\n[14 days] Dads: 20 minutes, 3 times a week…"} />
          <FieldDescription>Leave a blank line between ads. Add how long each ran, like [45 days], if you can see it.</FieldDescription>
        </Field>
      </MoreOptions>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-border/80 pt-5">
        <SubmitButton variant="cta" size="lg" guide="ad-studio-make" pendingText="Making your statics… (up to a minute)">
          <SparklesIcon data-icon="inline-start" />
          Make my 5 statics
        </SubmitButton>
        <span className="max-w-[52ch] text-xs leading-relaxed text-muted-foreground">
          {aiLine ?? (
            <>
              No AI connected, so you get our quick pack in a second. <Link href={`${base}/ai`}>Connect your AI</Link> for statics written around your niche.
            </>
          )}
        </span>
      </div>
    </form>
  );

  return (
    <>
      <PageHead
        lesson="Days 1 and 2"
        eyebrow="Get members"
        title="Ad studio"
        sub="Answer a few quick questions. Get your numbers, 5 statics ready to make, and the exact clicks to launch them today."
        first={pack ? "Make each image with its prompt, then follow Your launch plan in Ads Manager." : "Check the answers below, then press Make my 5 statics."}
      />
      <Flash searchParams={sp} />

      {!skoolTarget ? (
        <Callout tone="warn" title="Your Skool link has nowhere to go yet">
          Add your Skool group link below (or in <Link href={`${base}/settings#business`}>Settings</Link>) so your Skool-link ads and your Join button land on your Skool About page.
        </Callout>
      ) : null}

      {pack && chosen ? (
        <>
          <MoreOptions
            icon={PaletteIcon}
            title="Your answers"
            sub={`${money(pack.numbers.budget)} a day · ${DESTINATION_LABEL[pack.destination ?? "skool"]} · ${pack.country}${chosen.input.audience ? ` · ${truncate(String(chosen.input.audience), 60)}` : ""}. Change anything and make a new pack.`}
          >
            {form}
          </MoreOptions>

          <nav aria-label="On this page" className="-mt-2 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[12.5px] text-muted-foreground">
              {chosen.model === "rules" ? "Quick pack" : chosen.model === "connected AI app" ? "Written by your AI app" : "Written by AI"} · {relativeTime(chosen.createdAt)}
            </span>
            {[
              ["#numbers", "Your numbers"],
              ["#statics", "Your 5 statics"],
              ["#plan", "Your launch plan"],
              ["#video", "Video script"],
            ].map(([href, label]) => (
              <Button key={href} asChild variant="outline" size="xs">
                <a href={href}>{label}</a>
              </Button>
            ))}
          </nav>

          <NumbersPanel n={pack.numbers} destination={pack.destination ?? "skool"} lines={numbersLines(pack.numbers, { price: Number(chosen.input.price) || 0, country: pack.country, formats: pack.statics.map((x) => x.format), destination: pack.destination ?? "skool" })} />

          <Panel
            id="statics"
            className="scroll-mt-20"
            icon={ImageIcon}
            title="Your 5 statics"
            sub="Five different looks for five different people, so Meta tests five real ideas. Make each image, then copy the words into Ads Manager."
            action={<CopyButton text={pack.statics.map(staticText).join("\n\n————————\n\n")} label="Copy all 5" />}
          >
            <Callout tone="tip" title="How to make each image">
              Paste its image prompt into ChatGPT, Gemini or Midjourney. Words come out wrong? Ask for the picture with no text, then add the words in Canva (free).
            </Callout>
            {pack.summary ? <p className="max-w-[72ch] text-sm leading-relaxed text-muted-foreground">{pack.summary}</p> : null}
            {pack.inspiration.length ? (
              <div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-4 text-sm ring-1 ring-ink/[0.03] ring-inset dark:ring-white/[0.04]">
                <span className="flex items-center gap-2 font-semibold">
                  <SearchIcon className="size-4 text-primary dark:text-violet-300" aria-hidden />
                  Long-running hooks you picked
                </span>
                <ul className="flex flex-col gap-1.5 text-muted-foreground">
                  {pack.inspiration.map((h) => (
                    <li key={h}>“{h}”</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ol className="flex flex-col gap-4">
              {pack.statics.map((c, i) => (
                <StaticCard key={i} c={c} i={i} tone={tone} />
              ))}
            </ol>
          </Panel>

          {pack.destination === "website" && !workspace.settings.metaPixelId ? (
            <Callout tone="warn" title="Connect your Pixel before you launch">
              This plan picks your Pixel under Dataset. Add it in <Link href={`${base}/settings#tracking`}>Settings › Meta Pixel &amp; Conversions API</Link> first.
            </Callout>
          ) : null}

          <PlanPanel plan={pack.plan} wid={wid} />

          {video ? (
            <Panel
              id="video"
              className="scroll-mt-20"
              icon={ClapperboardIcon}
              tone="gold"
              title="Video script (for later)"
              sub="Statics first. Keep this for after your free week, once Day 6 has told you which static won: 20–30 seconds, selfie, captions on."
              action={<CopyButton text={videoText(video)} label="Copy script" />}
            >
              <p className="text-sm text-muted-foreground">
                Built on{" "}
                <b className="font-semibold text-foreground">
                  S{video.basedOn + 1} · {pack.statics[video.basedOn]?.name}
                </b>{" "}
                ({ANGLE_LABEL[video.angle]}).
              </p>
              <ol className="flex flex-col divide-y divide-border/80 overflow-hidden rounded-xl ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
                {video.beats.map((b) => (
                  <li key={b.part} className="grid gap-3 p-4 @2xl/main:grid-cols-[96px_minmax(0,1fr)]">
                    <div className="flex items-center gap-2 @2xl/main:flex-col @2xl/main:items-start @2xl/main:gap-1">
                      <span className="text-[15px] font-semibold">{b.part}</span>
                      <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11.5px] font-semibold text-gold-foreground tabular-nums">{b.time}</span>
                    </div>
                    <div className="grid min-w-0 gap-2.5 text-sm leading-relaxed">
                      <p className="text-[15px]">“{b.say}”</p>
                      <p className="flex flex-wrap items-center gap-2">
                        <span className={LABEL}>On screen</span>
                        <span className="rounded-md bg-ink px-2 py-0.5 text-[12.5px] font-semibold text-white dark:bg-white dark:text-ink">{b.caption}</span>
                      </p>
                      <p className="flex items-start gap-2 text-muted-foreground">
                        <CameraIcon className="mt-[3px] size-4 shrink-0" aria-hidden />
                        {b.shot}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <ul className="grid gap-2 text-sm @2xl/main:grid-cols-2">
                {video.tips.map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <CheckIcon className="mt-[3px] size-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              {video.policy.ok ? null : <PolicyFlags flags={video.policy.flags} />}
              <div className="flex flex-wrap items-center gap-2 border-t border-border/80 pt-4">
                <span className="mr-1 text-[12.5px] text-muted-foreground">A different static won? Build the script on it:</span>
                {pack.statics.map((c, i) => (
                  <Button key={i} asChild variant={i === video.basedOn ? "secondary" : "outline"} size="xs">
                    <Link href={`${base}/ads/studio?pack=${chosen.id}${i === pack.video.basedOn ? "" : `&video=${i}`}#video`} scroll={false} aria-current={i === video.basedOn ? "true" : undefined}>
                      S{i + 1}
                    </Link>
                  </Button>
                ))}
              </div>
            </Panel>
          ) : null}

          <MoreOptions icon={HistoryIcon} title={`Your saved packs (${packs.length})`} sub="Every pack you make is saved here. Open one to see it again.">
            <ul className="flex flex-col divide-y divide-border/80 overflow-hidden rounded-xl ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
              {packs.map((p) => {
                const current = p.id === chosen.id;
                return (
                  <li key={p.id}>
                    <Link
                      href={`${base}/ads/studio?pack=${p.id}`}
                      className={cn("flex items-center justify-between gap-3 px-4 py-3 text-sm text-foreground no-underline transition-colors hover:bg-accent/60", current && "bg-accent/50")}
                    >
                      <span className="grid min-w-0 gap-0.5">
                        <span className="font-medium">
                          {money(p.pack.numbers.budget)} a day · {DESTINATION_LABEL[p.pack.destination ?? "skool"]} · {p.pack.country}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {p.pack.statics.map((s) => s.name).join(" · ")}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-subtle-foreground">
                        {p.model === "rules" ? "Quick pack" : "AI"} · {relativeTime(p.createdAt)}
                        {current ? <Badge variant="soft">Showing</Badge> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </MoreOptions>
        </>
      ) : (
        <>
          <Panel step={1} title="A few quick answers" sub="We filled in what we know from your workspace. Change anything, then press the button.">
            {form}
          </Panel>
          <PackPreview tone={defaults.tone} />
        </>
      )}
    </>
  );
}

function NumbersPanel({ n, lines, destination }: { n: StudioNumbers; lines: NumbersLine[]; destination: StudioDestination }) {
  const days = n.daysTo100.fast === n.daysTo100.slow ? String(n.daysTo100.fast) : `${n.daysTo100.fast}–${n.daysTo100.slow}`;
  const website = destination === "website";
  const guess = n.cpvSource === "assumption" ? "Our guess, to " : "To ";
  return (
    <Panel id="numbers" className="scroll-mt-20" icon={GaugeIcon} title="Your numbers" sub={`At ${money(n.budget)} a day. Honest maths: visitors, never promises.${n.cpvSource === "assumption" ? " Cost per visit is a guess until Day 6." : ""}`}>
      <div className="grid grid-cols-2 gap-3 @3xl/main:grid-cols-4">
        <Stat label="Visits a day" value={statRange(n.visitsPerDay.low, n.visitsPerDay.high)} hint={`${guess}${website ? "your website" : "your Skool About page"}`} />
        <Stat label="Visits a month" value={statRange(n.visitsPerMonth.low, n.visitsPerMonth.high)} hint={`${money(n.monthlySpend)} a month in ads`} />
        {website ? <Stat label="Your second campaign" value="$5" hint="A day, to your Skool link, on Day 2" /> : <Stat label="Days to 100 visitors" value={days} hint="Skool's Level 2 visitor bar" />}
        <Stat label="Statics to run" value={n.statics} hint="All in one ad set" />
      </div>
      <ul className="grid gap-x-6 gap-y-4 pt-1 @3xl/main:grid-cols-2">
        {lines.map((l) => {
          const Icon = LINE_ICON[l.key];
          return (
            <li key={l.key} className="flex gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] bg-accent text-primary ring-1 ring-current/10 ring-inset dark:text-violet-300">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="grid gap-0.5 text-sm leading-relaxed">
                <span className="font-semibold">{l.title}</span>
                <span className="text-muted-foreground">{l.text}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function PlanPanel({ plan, wid }: { plan: LaunchPlan; wid: string }) {
  const url = plan.settings.find((s) => s.label === "Website URL")?.value ?? "";
  // From the rules, not the saved pack, so an older pack shows the course's current week.
  const after = afterLaunch();
  const sub = plan.destination === "website" ? "A Leads campaign to your website: one ad set, all 5 statics. About 15 minutes in Meta Ads Manager." : "A Traffic campaign to your Skool link: one ad set, all 5 statics. Got website ads running? This one is separate, so leave those alone.";
  return (
    <Panel id="plan" className="scroll-mt-20" icon={RocketIcon} title="Your launch plan" sub={sub}>
      <dl className="grid overflow-hidden rounded-xl bg-background/60 ring-1 ring-ink/[0.06] ring-inset @2xl/main:grid-cols-2 dark:bg-white/[0.02] dark:ring-white/[0.07]">
        {plan.settings.map((s) => (
          <div key={s.label} className={cn("grid content-start gap-0.5 border-b border-border/70 px-4 py-3 text-sm", (s.label === "Website URL" || s.label === "Ads") && "@2xl/main:col-span-2", s.label === "Website URL" && "border-b-0")}>
            <dt className={LABEL}>{s.label}</dt>
            <dd className="flex min-w-0 items-center justify-between gap-3 font-medium">
              <span className={cn("min-w-0", s.label === "Website URL" && "truncate font-mono text-[12.5px]")}>{s.value}</span>
              {s.label === "Website URL" ? <CopyButton text={url} label="Copy link" className="h-7 shrink-0 px-2.5 text-xs" /> : null}
            </dd>
          </div>
        ))}
      </dl>
      <ol className="flex flex-col gap-4">
        {plan.steps.map((s, i) => (
          <li key={i} className="flex gap-3.5">
            <StepDot n={i + 1} active={i === 0} />
            <span className="grid gap-0.5 pt-[3px] text-sm leading-relaxed">
              <span className="font-semibold">{s.title}</span>
              <span className="text-muted-foreground">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-3 border-t border-border/80 pt-5">
        <span className="text-[15px] font-semibold tracking-[-0.011em]">After you press Publish</span>
        <ul className="grid gap-3 @2xl/main:grid-cols-2">
          {after.map((s, i) => {
            const Icon = AFTER_ICON[i] ?? CheckIcon;
            return (
              <li key={s.title} className={cn(CARD, "flex gap-3 p-4 text-sm leading-relaxed")}>
                <Icon className="mt-0.5 size-[18px] shrink-0 text-primary dark:text-violet-300" aria-hidden />
                <span className="grid content-start gap-0.5">
                  <span className="font-semibold">{s.title}</span>
                  <span className="text-muted-foreground">
                    {s.detail}
                    {i === 1 ? (
                      <>
                        {" "}
                        <Link href={`/app/w/${wid}/ads`}>Open Ad review</Link>
                      </>
                    ) : null}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}

function StaticCard({ c, i, tone }: { c: StaticConcept; i: number; tone: StudioTone }) {
  return (
    <li id={`s${i + 1}`} className={cn(CARD, "grid scroll-mt-20 gap-5 p-4 md:p-5 @2xl/main:grid-cols-[188px_minmax(0,1fr)] @2xl/main:gap-6")}>
      <div className="flex flex-col items-center gap-2 @2xl/main:sticky @2xl/main:top-20 @2xl/main:items-stretch @2xl/main:self-start">
        <div className="w-full max-w-[220px] @2xl/main:max-w-none">
          <StaticMock format={c.format} text={c.onImageText} tone={tone} />
        </div>
        <span className="text-center text-[11.5px] text-subtle-foreground">Layout sketch · 4:5</span>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="grid size-7 place-items-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground tabular-nums shadow-press">S{i + 1}</span>
            <h3 className="text-[16.5px] font-semibold tracking-[-0.012em]">{c.name}</h3>
            <span className={cn("inline-flex h-[22px] items-center rounded-full px-2.5 text-[11.5px] font-semibold", ANGLE_CHIP[c.angle])}>{ANGLE_LABEL[c.angle]}</span>
            <Badge variant="outline">{FORMAT_LABEL[c.format]}</Badge>
          </div>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">For:</span> {c.persona}. <span className="font-medium text-foreground">Benefit:</span> {c.benefit}.
          </p>
        </header>

        <CopyField label="On the image" text={c.onImageText}>
          <span className="text-[17px] font-semibold tracking-[-0.012em]">{c.onImageText}</span>
        </CopyField>
        <CopyField label="Primary text" text={c.primaryText}>
          <dl className="grid gap-2.5">
            {(
              [
                ["Hook", c.hook],
                ["Turn", c.turn],
                ["Door", c.door],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="grid gap-0.5">
                <dt className="text-[10.5px] font-semibold tracking-[0.1em] text-primary uppercase dark:text-violet-300">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </CopyField>
        <div className="grid gap-4 @lg/main:grid-cols-[minmax(0,1fr)_11.5rem]">
          <CopyField label="Headline" text={c.headline} />
          <CopyField label="Call to action" text={c.cta} />
        </div>
        <CopyField label="Image prompt (4:5, 1080×1350)" text={c.imagePrompt}>
          <span className="text-[13.5px]">{c.imagePrompt}</span>
        </CopyField>
        <ul className="grid gap-2 text-[13.5px] leading-relaxed">
          <li className="flex gap-2.5">
            <VideoIcon className="mt-[3px] size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              <span className="font-medium">Stories and Reels:</span> <span className="text-muted-foreground">{c.storyNote}</span>
            </span>
          </li>
          <li className="flex gap-2.5">
            <LightbulbIcon className="mt-[3px] size-4 shrink-0 text-gold-foreground" aria-hidden />
            <span>
              <span className="font-medium">Design note:</span> <span className="text-muted-foreground">{c.designNote}</span>
            </span>
          </li>
          {c.policy.ok ? (
            <li className="flex gap-2.5">
              <ShieldCheckIcon className="mt-[3px] size-4 shrink-0 text-success" aria-hidden />
              <span>
                <span className="font-medium text-success">Meta policy check passed.</span>{" "}
                <span className="text-muted-foreground">No “Are you…?”, no income claims, no made-up testimonials.</span>
              </span>
            </li>
          ) : null}
        </ul>
        {c.policy.ok ? null : <PolicyFlags flags={c.policy.flags} />}
      </div>
    </li>
  );
}

function PolicyFlags({ flags }: { flags: string[] }) {
  return (
    <div className="flex gap-3 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3.5 text-sm leading-relaxed">
      <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="grid gap-1">
        <span className="font-semibold text-warning">Fix this before you publish</span>
        <ul className="grid gap-1 text-foreground/80">
          {flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A copyable block: a small label, a Copy button and the text (or a richer rendering of it). */
function CopyField({ label, text, children }: { label: string; text: string; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL}>{label}</span>
        <CopyButton text={text} className="h-7 shrink-0 px-2.5 text-xs" />
      </div>
      <div className="rounded-xl bg-background/70 px-3.5 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap ring-1 ring-ink/[0.06] ring-inset dark:bg-white/[0.02] dark:ring-white/[0.07]">{children ?? text}</div>
    </div>
  );
}

const BAR_WIDTHS = ["w-[86%]", "w-[68%]", "w-[78%]", "w-[60%]"];

/**
 * A small picture of the static's layout, so five formats read as five different ads at a glance.
 * Sizes are in container units (cqw), so the sketch looks the same in a card or a small ghost tile.
 */
function StaticMock({ format, text, tone }: { format: StaticFormat; text: string; tone: StudioTone }) {
  const shell = "@container relative aspect-[4/5] w-full overflow-hidden rounded-xl shadow-card ring-1 ring-ink/[0.08] select-none dark:ring-white/[0.1]";
  const words = text.replace(/^["“]+|["”]+$/g, "");
  const bar = "h-[3cqw] rounded-full";
  switch (format) {
    case "text_on_colour": {
      const look = { friendly: "bg-gold text-ink", bold: "bg-violet-600 text-white", calm: "bg-violet-100 text-ink" }[tone];
      return (
        <div aria-hidden className={cn(shell, look, "flex flex-col p-[9%]")}>
          <p className="text-[11.5cqw] leading-[1.04] font-semibold tracking-[-0.03em] text-balance">{words}</p>
          <span className="mt-[5cqw] h-[2cqw] w-[26%] rounded-full bg-current opacity-50" />
        </div>
      );
    }
    case "photo_overlay":
      return (
        <div aria-hidden className={cn(shell, "bg-[linear-gradient(165deg,var(--color-pink-100),var(--color-violet-200)_55%,var(--color-violet-400))]")}>
          <UserRoundIcon className="absolute -bottom-[6%] left-1/2 size-[80%] -translate-x-1/2 text-white/60" strokeWidth={1.1} />
          <span className="absolute inset-x-[7%] top-[7%] rounded-[3.5cqw] bg-white px-[6cqw] py-[4cqw] text-[6.6cqw] leading-snug font-semibold text-ink shadow-xs">{words}</span>
        </div>
      );
    case "notes_app":
      return (
        <div aria-hidden className={cn(shell, "bg-white p-[9%] text-ink")}>
          <span className="flex items-center gap-[1cqw] text-[5.8cqw] font-semibold text-gold">
            <ChevronLeftIcon className="size-[7cqw]" strokeWidth={2.5} />
            Notes
          </span>
          <p className="mt-[6cqw] text-[8cqw] leading-tight font-bold tracking-[-0.01em]">{words}</p>
          <ul className="mt-[6cqw] grid gap-[4.5cqw]">
            {BAR_WIDTHS.slice(0, 3).map((w, i) => (
              <li key={w} className="flex items-center gap-[2.5cqw] text-[5.8cqw] font-medium text-ink/55">
                {i + 1}.<span className={cn(bar, "bg-ink/15", w)} />
              </li>
            ))}
          </ul>
        </div>
      );
    case "before_after":
      return (
        <div aria-hidden className={cn(shell, "grid grid-cols-2 bg-white text-ink")}>
          {(["Old way", "New way"] as const).map((side, s) => (
            <div key={side} className={cn("flex flex-col gap-[4cqw] px-[6cqw] pt-[40cqw]", s === 0 ? "bg-mist-100" : "bg-violet-100")}>
              <span className={cn("text-[5cqw] font-bold tracking-[0.08em] uppercase", s === 0 ? "text-ink/50" : "text-violet-700")}>{side}</span>
              {BAR_WIDTHS.slice(0, 3).map((w) => (
                <span key={w} className="flex items-center gap-[2cqw]">
                  {s === 1 ? <CheckIcon className="size-[5cqw] shrink-0 text-violet-700" strokeWidth={3.5} /> : <span className="w-[5cqw] shrink-0 text-center text-[5cqw] leading-none text-ink/40">×</span>}
                  <span className={cn(bar, s === 0 ? "bg-ink/15" : "bg-violet-400/60", w)} />
                </span>
              ))}
            </div>
          ))}
          <span className="absolute inset-x-[7%] top-[7%] rounded-[3cqw] bg-white px-[4cqw] py-[3cqw] text-center text-[6.4cqw] leading-tight font-semibold shadow-xs">{words}</span>
        </div>
      );
    case "checklist":
      return (
        <div aria-hidden className={cn(shell, "bg-mist-50 p-[9%] text-ink")}>
          <p className="text-[7.6cqw] leading-tight font-bold tracking-[-0.01em]">{words}</p>
          <ul className="mt-[7cqw] grid gap-[5cqw]">
            {BAR_WIDTHS.map((w, i) => (
              <li key={w} className="flex items-center gap-[3cqw]">
                <span className={cn("grid size-[7.5cqw] shrink-0 place-items-center rounded-full border", i < 2 ? "border-violet-600 bg-violet-600 text-white" : "border-ink/25")}>
                  {i < 2 ? <CheckIcon className="size-[5cqw]" strokeWidth={3.5} /> : null}
                </span>
                <span className={cn(bar, "bg-ink/15", w)} />
              </li>
            ))}
          </ul>
        </div>
      );
    case "quote_card":
      return (
        <div aria-hidden className={cn(shell, "grid place-items-center p-[9%] text-ink", { friendly: "bg-gold/40", bold: "bg-violet-200", calm: "bg-violet-100" }[tone])}>
          <span className="relative rounded-[6cqw] bg-white px-[7cqw] py-[6cqw] text-center text-[7cqw] leading-snug font-semibold shadow-xs">
            “{words}”
            <span className="absolute -bottom-[3cqw] left-[12cqw] size-[6cqw] rotate-45 bg-white" />
          </span>
          <span className="absolute bottom-[7%] text-[5cqw] font-semibold tracking-[0.08em] text-ink/50 uppercase">Real member result</span>
        </div>
      );
  }
}

/** Before the first pack: a ghost of what's coming, so the payoff is visible. */
function PackPreview({ tone }: { tone: StudioTone }) {
  const ghosts: [StaticFormat, string][] = [
    ["text_on_colour", "Big words that stop the thumb."],
    ["photo_overlay", "A real moment, one line."],
    ["notes_app", "3 things I'd do first:"],
    ["before_after", "Same week. Different plan."],
    ["checklist", "Your first 7 days, mapped out."],
  ];
  return (
    <section aria-label="What you'll get" className="flex flex-col gap-5 rounded-2xl border border-dashed border-border-strong bg-card/40 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <StepDot n={2} />
        <div className="grid gap-0.5">
          <h2 className="text-base">Your 5 statics land here</h2>
          <p className="text-sm text-muted-foreground">Five different formats for five different people, each with its words, an image prompt and a Meta policy check. Plus your numbers, your launch plan and a video script for later.</p>
        </div>
      </div>
      <div aria-hidden className="grid grid-cols-2 gap-3 opacity-90 @2xl/main:grid-cols-5">
        {ghosts.map(([f, t], i) => (
          <div key={f} className={cn("flex flex-col gap-1.5", i === 4 && "col-span-2 mx-auto w-1/2 @2xl/main:col-span-1 @2xl/main:w-auto")}>
            <StaticMock format={f} text={t} tone={tone} />
            <span className="text-center text-[11.5px] text-subtle-foreground">{FORMAT_LABEL[f]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
