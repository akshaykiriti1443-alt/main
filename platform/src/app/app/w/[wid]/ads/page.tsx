import Link from "next/link";
import { and, desc, eq, gte } from "drizzle-orm";
import {
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
import { computeMetrics, type AdCall, type AdReview } from "@/server/ai/adReview";
import { adReviewAction } from "@/actions/marketing";
import { isUuid } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Callout, Empty, Flash, MoreOptions, PageHead, Panel, StepDot } from "@/components/ui";
import { Kicker } from "@/components/crm-ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

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

/** The numbers Meta shows you, in the order the course quotes them. Leads: 0 is fine. */
const MAIN: { name: string; label: string; step: string; required?: boolean; placeholder?: string; hint?: string }[] = [
  { name: "spend", label: "Spend ($)", step: "0.01", required: true },
  { name: "days", label: "Days running", step: "1", required: true },
  { name: "impressions", label: "Impressions", step: "1", required: true },
  { name: "linkClicks", label: "Link clicks", step: "1", required: true },
  { name: "leads", label: "Leads", step: "1", placeholder: "0", hint: "0 is fine when it points at your Skool link." },
  { name: "members", label: "New members", step: "1", placeholder: "Not sure", hint: "Joins in Skool since your ads went live." },
];

const CHOICE =
  "flex cursor-pointer items-center gap-3 rounded-xl border border-border-strong bg-card px-3.5 py-3 text-sm shadow-xs transition-colors duration-150 select-none hover:border-violet-200 hover:bg-accent/60 has-checked:border-primary has-checked:bg-accent has-checked:ring-1 has-checked:ring-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/40 dark:bg-white/[0.03] dark:hover:border-white/20";

const usd = (n: number) => `$${n.toFixed(2)}`;

export default async function AdsPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace } = await requireWorkspace(wid);
  const db = await getDb();
  const cols = { id: aiGenerations.id, createdAt: aiGenerations.createdAt, input: aiGenerations.input, output: aiGenerations.output, model: aiGenerations.model };
  const [[row], recent] = await Promise.all([
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
  ]);
  const review = row?.output as unknown as AdReview | undefined;
  const last = row?.input as Record<string, number | string> | undefined;
  const link = skoolLinkFor(workspace.slug);
  const destination = last?.destination === "optin" ? "optin" : "skool";

  // This week's verdicts: the latest review of each ad (by name), so Day 7 ends with one per ad.
  const seen = new Set<string>();
  const week = recent
    .filter((r) => (r.output as unknown as AdReview).mode === "skool")
    .filter((r) => {
      const key = String(r.input.adName ?? "").trim().toLowerCase();
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
  const weekCounted = (week[0]?.output as unknown as AdReview | undefined)?.counted ?? null;

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
        defaultValue={f.name === "days" ? String(last?.days ?? 3) : f.name === "members" && last?.members !== undefined ? String(last.members) : undefined}
        className="tabular-nums"
      />
      {f.hint ? <FieldDescription>{f.hint}</FieldDescription> : null}
    </Field>
  );

  return (
    <>
      <PageHead
        lesson="2.6"
        stage="Day 7"
        eyebrow="Get members"
        title="Ad review"
        sub="One ad at a time: its spend, impressions and link clicks in, keep, fix or kill out, with the one room to fix."
        first="In Ads Manager, set the date range to Maximum and copy one ad's numbers below."
      />
      <Flash searchParams={sp} />

      <div className="grid items-start gap-6 @4xl/main:grid-cols-2">
        <form action={adReviewAction.bind(null, wid)} data-guide="ad-review">
          <Panel step={1} title="One ad's numbers" sub="Wait 72 hours after launch, then copy one ad at a time. Leads: 0 is fine.">
            <Callout tone="tip">
              Where to look: <b className="font-semibold">Ads Manager › Ads</b>, date range <b className="font-semibold">Maximum</b>. Spend is the Amount spent column.
            </Callout>

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
                    <span className="font-semibold">An opt-in page</span>
                    <span className="truncate text-xs text-muted-foreground">A page that asks for an email</span>
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="grid grid-cols-2 items-start gap-4">
              <Field>
                <FieldLabel htmlFor="adName">Which ad?</FieldLabel>
                <Input id="adName" name="adName" placeholder="S1 Notes app" maxLength={80} />
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

            <MoreOptions title="Add more detail" sub="Optional: followers, your goal and notes. Your AI's plan gets sharper.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="followers">New followers</FieldLabel>
                  <Input id="followers" name="followers" type="number" min={0} step="1" className="tabular-nums" />
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
              body="Each ad gets a verdict, a traffic light for every number and the one room to fix: Hook, Door or About page."
            />
          </Panel>
        ) : (
          <Panel step={2} title="Your verdict" sub={`Reviewed ${row?.createdAt.toDateString()} · ${row?.model === "rules" ? "rule-based" : "AI"}`}>
            {review.mode === "skool" && review.call ? (
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
              <BudgetNote review={review} />
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-success-soft px-5 py-4 ring-1 ring-success/15 ring-inset">
                <span className="grid gap-0.5">
                  <Kicker className="flex items-center gap-1.5 text-success">
                    <WalletIcon className="size-3.5" aria-hidden />
                    Next daily budget
                  </Kicker>
                  <span className="text-xs text-muted-foreground">What to spend tomorrow, per day.</span>
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
                </>
              ) : null}
            </p>
          ) : null}
        </Panel>
      ) : null}
    </>
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
      <p className="mt-3 text-[15px] leading-relaxed text-foreground/85">{review.why}</p>
    </div>
  );
}

function BudgetNote({ review }: { review: AdReview }) {
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
          {keep ? "About 20% more, then wait 2 to 3 days." : review.call === "too_early" ? "Hold it steady while Meta learns." : "Hold it steady. Fix one room at a time."}
        </span>
      </span>
      <span className={cn("font-display text-[30px] leading-none tracking-[-0.01em] tabular-nums", keep ? "text-success" : "text-foreground/80")}>
        {b ? (keep ? `${usd(b.now)} → ${usd(b.next)}` : usd(b.now)) : keep ? "+20%" : "Hold"}
      </span>
    </div>
  );
}
