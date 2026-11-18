import Link from "next/link";
import { and, desc, eq, gte } from "drizzle-orm";
import {
  CalculatorIcon,
  ClipboardListIcon,
  FileInputIcon,
  GaugeIcon,
  HourglassIcon,
  LinkIcon,
  ListChecksIcon,
  StethoscopeIcon,
  ThumbsUpIcon,
  TombstoneIcon,
  WalletIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { aiGenerations } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { skoolLinkFor } from "@/server/growth";
import { launchDay } from "@/server/path";
import { adTotals, computeMetrics, doNextNote, spendFrom, twoSums, type AdCall, type AdReview, type PriceLine } from "@/server/ai/adReview";
import { adLaunchDates, daysRunningSince, listAdStudioPacks, reviewAdChoices } from "@/server/ai/adStudio";
import { adReviewAction } from "@/actions/marketing";
import { isUuid } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Callout, Empty, Flash, MoreOptions, PageHead, Panel, StepDot } from "@/components/ui";
import { Kicker } from "@/components/crm-ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { AdPick } from "./ad-pick";

export const metadata = { title: "Ad review" };
export const maxDuration = 300;

const STATUS = {
  good: { label: "Good", variant: "success", dot: "bg-success" },
  ok: { label: "OK", variant: "gold", dot: "bg-gold" },
  fix: { label: "Fix", variant: "warning", dot: "bg-warning" },
  wait: { label: "Too early", variant: "secondary", dot: "bg-subtle-foreground/50" },
} as const;

/** Keep is jade, the three fixes amber, Kill brick, Too early quiet. */
const CALL_TONE: Record<AdCall, { badge: "success" | "warning" | "destructive" | "secondary"; panel: string; text: string; icon: LucideIcon }> = {
  keep: { badge: "success", panel: "bg-success-soft ring-success/15", text: "text-success", icon: ThumbsUpIcon },
  fix_hook: { badge: "warning", panel: "bg-warning-soft ring-warning/15", text: "text-warning", icon: WrenchIcon },
  fix_door: { badge: "warning", panel: "bg-warning-soft ring-warning/15", text: "text-warning", icon: WrenchIcon },
  fix_about: { badge: "warning", panel: "bg-warning-soft ring-warning/15", text: "text-warning", icon: WrenchIcon },
  kill: { badge: "destructive", panel: "bg-destructive-soft ring-destructive/15", text: "text-destructive", icon: TombstoneIcon },
  too_early: { badge: "secondary", panel: "bg-muted ring-ink/[0.05] dark:ring-white/[0.06]", text: "text-foreground/80", icon: HourglassIcon },
};

/** The numbers Meta shows you, in the order the course quotes them. Leads: blank means "not known". */
const MAIN: { name: string; label: string; step: string; required?: boolean; placeholder?: string; hint?: string }[] = [
  { name: "spend", label: "Spend ($)", step: "0.01", required: true, placeholder: "e.g. 18.40", hint: "Amount spent, in Ads Manager." },
  { name: "days", label: "Days running", step: "1", required: true, placeholder: "e.g. 4" },
  { name: "impressions", label: "Impressions", step: "1", required: true, placeholder: "e.g. 2400" },
  { name: "linkClicks", label: "Link clicks", step: "1", required: true, placeholder: "e.g. 31" },
  { name: "leads", label: "Leads", step: "1", placeholder: "e.g. 3, or blank", hint: "Website ads: this ad's own leads (Results, on a Leads campaign). Not sure? Leave it blank." },
  { name: "members", label: "New members", step: "1", placeholder: "e.g. 1, or blank", hint: "Joins in Skool since your ads went live." },
];

const CHOICE =
  "flex cursor-pointer items-center gap-3 rounded-xl border border-border-strong bg-card px-3.5 py-3 text-sm shadow-xs transition-colors duration-150 select-none hover:border-violet-200 hover:bg-accent/60 has-checked:border-primary has-checked:bg-accent has-checked:ring-1 has-checked:ring-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/40 dark:bg-white/[0.03] dark:hover:border-white/20";

const WELL = "rounded-xl bg-muted/50 px-4 py-3.5 ring-1 ring-ink/[0.03] ring-inset dark:ring-white/[0.04]";

const usd = (n: number) => `$${n.toFixed(2)}`;

export default async function AdsPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace } = await requireWorkspace(wid);
  const db = await getDb();
  const cols = { id: aiGenerations.id, createdAt: aiGenerations.createdAt, input: aiGenerations.input, output: aiGenerations.output, model: aiGenerations.model };
  const [[row], recent, totals, packs] = await Promise.all([
    db
      .select(cols)
      .from(aiGenerations)
      .where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_review"), ...(isUuid(sp.review) ? [eq(aiGenerations.id, sp.review)] : [])))
      .orderBy(desc(aiGenerations.createdAt))
      .limit(1),
    db
      .select(cols)
      .from(aiGenerations)
      .where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_review"), gte(aiGenerations.createdAt, new Date(Date.now() - 7 * 86_400_000))))
      .orderBy(desc(aiGenerations.createdAt))
      .limit(40),
    adTotals(wid),
    listAdStudioPacks(wid, 20),
  ]);
  const review = row?.output as unknown as AdReview | undefined;
  const last = row?.input as Record<string, number | string> | undefined;
  const link = skoolLinkFor(workspace.slug);
  const destination = last?.destination === "optin" ? "optin" : "skool";
  // Week one is hands-off: whatever a verdict says to change waits for next week.
  const firstWeek = launchDay(workspace.createdAt) <= 7;
  const doNext = review ? doNextNote(review, firstWeek) : null;
  const webSpend = spendFrom(sp.web);
  const skoolSpend = spendFrom(sp.skool);
  const sums = twoSums({ webSpend, skoolSpend, ...totals });
  // "Which ad?" offers the names Ad studio gave their ads; Days running counts from the day each kind went live.
  const adChoices = reviewAdChoices(packs);
  const launched = adLaunchDates(workspace.settings.journey, packs);
  const launchDays = { optin: daysRunningSince(launched.optin), skool: daysRunningSince(launched.skool) };
  const daysNow = launchDays[destination];

  // This week's verdicts: the latest review of each ad (by name), so Day 6 ends with one per ad.
  const seen = new Set<string>();
  const week = recent
    .filter((r) => Boolean((r.output as unknown as AdReview).call))
    .filter((r) => {
      const key = String(r.input.adName ?? "").trim().toLowerCase();
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
  const weekCounted = week.map((r) => (r.output as unknown as AdReview).counted).find(Boolean) ?? null;

  const numberField = (f: (typeof MAIN)[number]) => (
    <Field key={f.name}>
      <FieldLabel htmlFor={f.name}>{f.label}</FieldLabel>
      <Input
        id={f.name}
        name={f.name}
        type="number"
        min={f.name === "days" ? 1 : 0}
        max={f.name === "days" ? 90 : undefined}
        step={f.step}
        required={f.required}
        placeholder={f.placeholder}
        defaultValue={f.name === "days" ? String(daysNow ?? last?.days ?? 3) : f.name === "members" && last?.members !== undefined ? String(last.members) : undefined}
        className="tabular-nums"
      />
      {f.name === "days" && (launchDays.optin || launchDays.skool) ? (
        <FieldDescription>Counted from the day your ads went live. Change it if that&apos;s off.</FieldDescription>
      ) : f.hint ? (
        <FieldDescription>{f.hint}</FieldDescription>
      ) : null}
    </Field>
  );

  return (
    <>
      <PageHead
        lesson="Day 6"
        eyebrow="Get members"
        title="Ad review"
        sub="Your two prices first, then a verdict for each ad: Keep, Fix, Kill or Too early."
        first="Any ad under 1,000 impressions is Too early: leave it running, no form needed. Type in the ones over 1,000."
      />
      <Flash searchParams={sp} />

      <Panel icon={CalculatorIcon} tone="success" title="Your two prices" sub="What each campaign spent, divided by what your app counted. They're your own numbers, so there's nothing to pass or fail.">
        <form method="get" className="flex flex-col gap-4">
          {isUuid(sp.review) ? <input type="hidden" name="review" value={sp.review} /> : null}
          <p className="text-sm leading-relaxed text-muted-foreground">
            In <b className="font-semibold text-foreground">Meta Ads Manager</b>, set the date range to <b className="font-semibold text-foreground">Maximum</b> and read each campaign&apos;s{" "}
            <b className="font-semibold text-foreground">Amount spent</b>. Leave a box empty if you don&apos;t run that kind of ad.
          </p>
          <div className="grid items-start gap-4 @xl/main:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="web">Website ads: Amount spent ($)</FieldLabel>
              <Input id="web" name="web" type="number" min={0} step="0.01" defaultValue={webSpend ?? ""} placeholder="e.g. 40.00" className="tabular-nums" />
              <FieldDescription>
                Divided by your Leads from your ads: <b className="font-semibold text-foreground tabular-nums">{totals.adLeads.toLocaleString()}</b> so far.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="skool">Skool ads: Amount spent ($)</FieldLabel>
              <Input id="skool" name="skool" type="number" min={0} step="0.01" defaultValue={skoolSpend ?? ""} placeholder="e.g. 20.00" className="tabular-nums" />
              <FieldDescription>
                Divided by your Skool link&apos;s visits from ads: <b className="font-semibold text-foreground tabular-nums">{totals.adVisits.toLocaleString()}</b> so far.
              </FieldDescription>
            </Field>
          </div>
          <Button type="submit" variant="outline" className="self-start">
            <CalculatorIcon data-icon="inline-start" />
            Work out my prices
          </Button>
        </form>
        {sums.lead || sums.visit ? (
          <>
            <dl className="grid gap-3 @xl/main:grid-cols-2">
              {sums.lead ? <Price label="Cost per lead" none="No leads yet" p={sums.lead} /> : null}
              {sums.visit ? <Price label="Cost per Skool visit" none="No visits yet" p={sums.visit} /> : null}
            </dl>
            <div className="flex flex-wrap items-center gap-3">
              <CopyButton text={sums.post} label="Copy for my post" />
              <span className="text-xs text-muted-foreground">The lines above, ready to paste.</span>
            </div>
          </>
        ) : null}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Leads from your ads counts sign-ups that arrived through a Facebook or Instagram link, which is nearly always your ads. Friends you added by hand aren&apos;t in it. 0 so far is an answer too. Skool ads with clicks in Ads Manager but 0 visits here? Review one below and it checks the link.
        </p>
      </Panel>

      <div className="grid items-start gap-6 @4xl/main:grid-cols-2">
        <form action={adReviewAction.bind(null, wid)} data-guide="ad-review">
          {/* So the two prices above are still there after Get my verdict. */}
          {webSpend !== null ? <input type="hidden" name="keep_web" value={webSpend} /> : null}
          {skoolSpend !== null ? <input type="hidden" name="keep_skool" value={skoolSpend} /> : null}
          <Panel step={1} title="One ad's numbers" sub="First round: Day 6, then weekly. Copy one ad at a time, for ads with 1,000 impressions or more.">
            <WhereToFind />

            <fieldset className="flex flex-col">
              <legend className="mb-2.5 text-[13.5px] font-medium">Where does this ad send people?</legend>
              <div className="grid gap-2 @md/main:grid-cols-2">
                <label className={CHOICE}>
                  <input type="radio" name="destination" value="skool" defaultChecked={destination === "skool"} className="sr-only" />
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-primary ring-1 ring-violet-200/70 ring-inset dark:text-violet-300 dark:ring-white/[0.06]">
                    <LinkIcon className="size-4" aria-hidden />
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="font-semibold">My Skool link</span>
                    <span className="truncate font-mono text-[11.5px] text-muted-foreground">{link.replace(/^https?:\/\//, "")}</span>
                  </span>
                </label>
                <label className={CHOICE}>
                  <input type="radio" name="destination" value="optin" defaultChecked={destination === "optin"} className="sr-only" />
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground ring-1 ring-ink/[0.04] ring-inset dark:ring-white/[0.05]">
                    <FileInputIcon className="size-4" aria-hidden />
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="font-semibold">My website</span>
                    <span className="truncate text-xs text-muted-foreground">The page that asks for an email</span>
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="grid grid-cols-2 items-start gap-4">
              <Field>
                <FieldLabel htmlFor="adName">Which ad?</FieldLabel>
                <AdPick choices={adChoices} launchDays={launchDays} />
              </Field>
              <Field>
                <FieldLabel htmlFor="fixes">Fixed it before?</FieldLabel>
                <NativeSelect id="fixes" name="fixes" defaultValue="0">
                  <NativeSelectOption value="0">Not yet</NativeSelectOption>
                  <NativeSelectOption value="1">Once</NativeSelectOption>
                  <NativeSelectOption value="2">Twice or more</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>

            <div className="grid grid-cols-2 items-start gap-4">{MAIN.map(numberField)}</div>

            <MoreOptions title="Add more detail" sub="Optional: followers, your total spend, your goal and notes. Your AI's plan gets sharper.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="followers">New followers</FieldLabel>
                  <Input id="followers" name="followers" type="number" min={0} step="1" placeholder="e.g. 12" className="tabular-nums" />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="totalSpent">Total spent on all ads so far ($)</FieldLabel>
                  <Input id="totalSpent" name="totalSpent" type="number" min={0} step="0.01" placeholder="e.g. 60.00" className="tabular-nums" />
                  <FieldDescription>Ads Manager, date range Maximum, your campaign&apos;s Amount spent. Blank is fine: we add up the ads you&apos;ve reviewed this week.</FieldDescription>
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="goal">Your goal</FieldLabel>
                  <Input id="goal" name="goal" placeholder="100 About-page visitors this month" defaultValue={last?.goal ? String(last.goal) : ""} />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="notes">Anything else?</FieldLabel>
                  <Textarea id="notes" name="notes" placeholder="What this ad says, the country, what you changed…" />
                </Field>
              </div>
            </MoreOptions>
            <SubmitButton variant="cta" size="lg" className="self-start" pendingText="Reviewing your ad…">
              <StethoscopeIcon data-icon="inline-start" />
              Get my verdict
            </SubmitButton>
          </Panel>
        </form>

        {!review ? (
          <Panel step={2} title="Your verdict" sub="Shows up here the moment you send an ad's numbers.">
            <Empty
              icon={ClipboardListIcon}
              title="Keep, fix or kill"
              body="Each ad gets a verdict, a traffic light for every number and the one room to fix: Hook, Door or About page. In week one, most say Too early, and that's fine."
            />
          </Panel>
        ) : (
          <Panel step={2} title="Your verdict" sub={`Reviewed ${row?.createdAt.toDateString()} · ${row?.model === "rules" ? "rule-based" : "AI"}`}>
            <Callout tone="tip">
              {firstWeek
                ? "Week one: change nothing today. Too early means leave it running, and a Fix or a Keep goes on next week's list. A broken link is the one thing to fix today. Switching an ad off is always your call."
                : "Switch off any ad marked Kill, fix one room at a time, and leave Too early running."}
            </Callout>
            {review.call ? (
              <SkoolVerdict review={review} />
            ) : (
              <div className="relative isolate overflow-hidden rounded-2xl bg-accent px-5 py-5 ring-1 ring-violet-200/70 ring-inset dark:ring-white/[0.06]">
                <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 -z-10 size-44 rounded-full bg-[radial-gradient(closest-side,var(--cta-soft),transparent)]" />
                <span className="eyebrow">The verdict{review.adName ? ` · ${review.adName}` : ""}</span>
                <p className="mt-2 font-display text-[26px] leading-[1.12] tracking-[-0.01em] text-foreground">{review.verdict}</p>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <GaugeIcon className="size-4 text-primary dark:text-violet-300" aria-hidden />
                Your numbers
              </span>
              <ul className="flex flex-col divide-y divide-border/80 overflow-hidden rounded-xl ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
                {review.metrics.map((m) => {
                  const st = STATUS[m.status as keyof typeof STATUS] ?? STATUS.good;
                  return (
                    <li key={m.name} className="flex items-start gap-3 px-4 py-3">
                      <span className={cn("mt-[7px] size-2 shrink-0 rounded-full", st.dot)} aria-hidden />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="text-sm font-medium">{m.name}</span>
                        <span className="text-xs leading-relaxed text-muted-foreground">{m.note}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="text-right text-[15px] font-semibold tabular-nums">{m.value}</span>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <ListChecksIcon className="size-4 text-primary dark:text-violet-300" aria-hidden />
                Do this next
              </span>
              {doNext ? <p className="text-xs text-muted-foreground">{doNext}</p> : null}
              <ol className="flex flex-col gap-3.5">
                {review.actions.map((a, i) => (
                  <li key={i} className="flex gap-3">
                    <StepDot n={i + 1} active={i === 0} />
                    <span className="pt-0.5 text-sm leading-relaxed">
                      <span className="font-semibold">{a.title}.</span> <span className="text-muted-foreground">{a.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {review.mode === "skool" && review.call ? (
              <BudgetNote review={review} firstWeek={firstWeek} />
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-success-soft px-5 py-4 ring-1 ring-success/15 ring-inset">
                <span className="grid gap-0.5">
                  <Kicker className="flex items-center gap-1.5 text-success">
                    <WalletIcon className="size-3.5" aria-hidden />
                    Next daily budget
                  </Kicker>
                  <span className="text-xs text-muted-foreground">{firstWeek ? "Per day, from next week. Today, leave it as it is." : "What to spend tomorrow, per day."}</span>
                </span>
                <span className="font-display text-[36px] leading-none tracking-[-0.01em] text-success tabular-nums">${review.nextBudgetUsdPerDay.toFixed(2)}</span>
              </div>
            )}
          </Panel>
        )}
      </div>

      {week.length ? (
        <Panel icon={ListChecksIcon} title="Your ads this week" sub="The latest verdict for each ad you reviewed in the last 7 days. Open one to see its plan.">
          <ul className="flex flex-col divide-y divide-border/80 overflow-hidden rounded-xl ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
            {week.map((r) => {
              const out = r.output as unknown as AdReview;
              const tone = CALL_TONE[out.call ?? "too_early"];
              const m = computeMetrics({
                spend: Number(r.input.spend) || 0,
                impressions: Number(r.input.impressions) || 0,
                linkClicks: Number(r.input.linkClicks) || 0,
                leads: 0,
                followers: 0,
              });
              const current = r.id === row?.id;
              return (
                <li key={r.id}>
                  <Link
                    href={`/app/w/${wid}/ads?review=${r.id}`}
                    aria-current={current ? "true" : undefined}
                    className={cn("flex items-center gap-3 px-4 py-3 text-sm text-foreground transition-colors duration-150 hover:bg-accent/50 hover:no-underline", current && "bg-accent/60")}
                  >
                    <tone.icon className={cn("size-4 shrink-0", tone.text)} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{String(r.input.adName ?? "") || "Unnamed ad"}</span>
                    <span className="hidden text-xs text-muted-foreground tabular-nums @xl/main:inline">
                      {m.ctr.toFixed(2)}% CTR · {Number(r.input.linkClicks) ? `${usd(m.cpc)} a click` : "no clicks"}
                    </span>
                    <Badge variant={tone.badge}>{out.verdict}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
          {weekCounted?.ready ? (
            <p className="text-sm text-muted-foreground">
              Skool link counted <b className="font-semibold text-foreground tabular-nums">{weekCounted.adVisits.toLocaleString()}</b> ad {weekCounted.adVisits === 1 ? "visit" : "visits"} in the last {weekCounted.days} days.
              {weekCounted.costPerVisit !== null ? (
                <>
                  {" "}
                  Cost per visit: <b className="font-semibold text-foreground tabular-nums">{usd(weekCounted.costPerVisit)}</b> ({usd(weekCounted.totalSpend)} spent ÷ {weekCounted.adVisits.toLocaleString()} visits). Early verdicts: five days at $5 is thin data.
                  {weekCounted.spendTyped ? null : " Only reviewed some of your ads? This reads low. Your two prices at the top use the whole campaign's spend."}
                </>
              ) : null}
            </p>
          ) : null}
        </Panel>
      ) : null}
    </>
  );
}

/** The three numbers the course names, and where they live in Ads Manager, in plain words. */
function WhereToFind() {
  const steps = [
    <>
      Open <b className="font-semibold text-foreground">Meta Ads Manager</b> on a computer, click <b className="font-semibold text-foreground">Ads</b>, and set the date range (top right) to{" "}
      <b className="font-semibold text-foreground">Maximum</b>.
    </>,
    <>
      On the ad&apos;s row, read <b className="font-semibold text-foreground">Impressions</b> (how many times Meta showed it), <b className="font-semibold text-foreground">Link clicks</b> (people who tapped through) and{" "}
      <b className="font-semibold text-foreground">Amount spent</b> (it goes in Spend).
    </>,
    <>
      Under 1,000 impressions? It&apos;s <b className="font-semibold text-foreground">Too early</b>: leave it running and skip the form.
    </>,
  ];
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-accent/60 p-4 ring-1 ring-violet-200/60 ring-inset dark:bg-accent/50 dark:ring-white/[0.05]">
      <span className="text-sm font-semibold">The three numbers, and where they are</span>
      <ol className="flex flex-col gap-2.5 text-sm leading-relaxed">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <StepDot n={i + 1} className="size-6 text-[11.5px]" />
            <span className="pt-0.5 text-foreground/85">{s}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">No Link clicks column? Press Columns and pick Performance and clicks. A label reads a little differently on your screen? Go with the closest match.</p>
    </div>
  );
}

function Price({ label, none, p }: { label: string; none: string; p: PriceLine }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", WELL)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("font-display leading-none tracking-[-0.01em] tabular-nums", p.cost === null ? "text-[24px] text-foreground/70" : "text-[30px]")}>{p.cost === null ? none : usd(p.cost)}</dd>
      <dd className="text-xs text-subtle-foreground">{p.line}</dd>
    </div>
  );
}

function SkoolVerdict({ review }: { review: AdReview }) {
  const tone = CALL_TONE[review.call ?? "too_early"];
  return (
    <div className={cn("rounded-2xl px-5 py-5 ring-1 ring-inset", tone.panel)}>
      <span className="eyebrow">The verdict{review.adName ? ` · ${review.adName}` : ""}</span>
      <p className={cn("mt-2.5 flex items-center gap-2.5 font-display text-[34px] leading-none tracking-[-0.01em]", tone.text)}>
        <tone.icon className="size-7 shrink-0" strokeWidth={1.75} aria-hidden />
        {review.verdict}
      </p>
      {review.call === "too_early" ? (
        <p className="mt-3 w-fit rounded-full bg-card px-3 py-1 text-[13px] font-medium ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">Too early to tell, leave it running. A normal answer, not a bad one.</p>
      ) : null}
      <p className="mt-3 text-[15px] leading-relaxed text-foreground/85">{review.why}</p>
    </div>
  );
}

function BudgetNote({ review, firstWeek }: { review: AdReview; firstWeek: boolean }) {
  const keep = review.call === "keep";
  const b = review.budget;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl px-5 py-4 ring-1 ring-inset",
        keep ? "bg-success-soft ring-success/15" : "bg-muted/60 ring-ink/[0.05] dark:ring-white/[0.06]",
      )}
    >
      <span className="grid gap-0.5">
        <Kicker className={cn("flex items-center gap-1.5", keep && "text-success")}>
          <WalletIcon className="size-3.5" aria-hidden />
          {keep ? "Feed it slowly" : "Daily budget"}
        </Kicker>
        <span className="text-xs text-muted-foreground">
          {keep
            ? firstWeek
              ? "About 20% more from next week, then wait 2 to 3 days. Today, leave it."
              : "About 20% more, then wait 2 to 3 days."
            : review.call === "too_early"
              ? "Hold it steady while Meta learns."
              : "Hold it steady. Fix one room at a time."}
        </span>
      </span>
      <span className={cn("font-display text-[30px] leading-none tracking-[-0.01em] tabular-nums", keep ? "text-success" : "text-foreground/80")}>
        {b ? (keep ? `${usd(b.now)} → ${usd(b.next)}` : usd(b.now)) : keep ? "+20%" : "Hold"}
      </span>
    </div>
  );
}
