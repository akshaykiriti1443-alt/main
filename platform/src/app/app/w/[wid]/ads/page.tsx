import { and, desc, eq } from "drizzle-orm";
import { ClipboardListIcon, GaugeIcon, StethoscopeIcon, WalletIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { aiGenerations } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import type { AdReview } from "@/server/ai/adReview";
import { adReviewAction } from "@/actions/marketing";
import { isUuid } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Callout, Empty, Flash, MoreOptions, PageHead, Panel, StepDot } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const metadata = { title: "Ad review" };
export const maxDuration = 300;

const STATUS = {
  good: { label: "Good", className: "bg-success-soft text-success", dot: "bg-success" },
  ok: { label: "OK", className: "bg-gold-soft text-gold-foreground", dot: "bg-gold" },
  fix: { label: "Fix", className: "bg-warning-soft text-warning", dot: "bg-warning" },
} as const;

/** The numbers Meta shows you, in the order Ads Manager lists them. */
const MAIN: [name: string, label: string, step: string][] = [
  ["spend", "Amount spent ($)", "0.01"],
  ["days", "Days", "1"],
  ["impressions", "Impressions", "1"],
  ["linkClicks", "Link clicks", "1"],
  ["leads", "Leads", "1"],
];
const EXTRA: [name: string, label: string, step: string][] = [
  ["followers", "New followers", "1"],
  ["members", "New members", "1"],
];
const REQUIRED = ["spend", "impressions", "linkClicks", "leads"];

export default async function AdsPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  await requireWorkspace(wid);
  const db = await getDb();
  const [row] = await db
    .select()
    .from(aiGenerations)
    .where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "ad_review"), ...(isUuid(sp.review) ? [eq(aiGenerations.id, sp.review)] : [])))
    .orderBy(desc(aiGenerations.createdAt))
    .limit(1);
  const review = row?.output as unknown as AdReview | undefined;
  const last = row?.input as Record<string, number | string> | undefined;

  const numberField = ([name, label, step]: [string, string, string]) => (
    <Field key={name}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        name={name}
        type="number"
        min={0}
        step={step}
        required={REQUIRED.includes(name)}
        defaultValue={last?.[name] !== undefined ? String(last[name]) : name === "days" ? "3" : ""}
        className="tabular-nums"
      />
    </Field>
  );

  return (
    <>
      <PageHead
        lesson="2.8"
        stage="Stage 2"
        title="Ad review"
        sub="After 72 hours of ads, paste your numbers and get a plan: keep it, fix one part, or kill it."
        first="Copy 5 numbers from Meta Ads Manager into the form, then press Get my custom plan."
      />
      <Flash searchParams={sp} />

      <div className="grid items-start gap-5 @3xl/main:grid-cols-2">
        <form action={adReviewAction.bind(null, wid)} data-guide="ad-review">
          <Panel step={1} title="Your last few days of ads" sub="Pick the last 3 or 7 days in Meta Ads Manager and copy these five numbers.">
            <Callout tone="tip">
              Where to look: <b>Ads Manager › Columns › Performance and clicks</b>.
            </Callout>
            <div className="grid gap-4 sm:grid-cols-2">{MAIN.map(numberField)}</div>
            <MoreOptions title="Add more detail" sub="Optional: followers, members, your goal and notes. The plan gets sharper.">
              <div className="grid gap-4 sm:grid-cols-2">
                {EXTRA.map(numberField)}
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="goal">Your goal</FieldLabel>
                  <Input id="goal" name="goal" placeholder="30 new paying members this month" defaultValue={last?.goal ? String(last.goal) : ""} />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="notes">Anything else?</FieldLabel>
                  <Textarea id="notes" name="notes" placeholder="Which ads you ran, countries, what you changed…" />
                </Field>
              </div>
            </MoreOptions>
            <SubmitButton size="lg" className="self-start" pendingText="Reviewing your ads…">
              <StethoscopeIcon data-icon="inline-start" />
              Get my custom plan
            </SubmitButton>
          </Panel>
        </form>

        {!review ? (
          <Panel step={2} title="Your plan" sub="Shows up here the moment you send your numbers.">
            <Empty
              icon={ClipboardListIcon}
              title="Keep, fix or kill"
              body="You get a verdict, a traffic light for every number, and what to spend tomorrow. Fix one room at a time: Hook, Turn or Door."
            />
          </Panel>
        ) : (
          <Panel step={2} title="Your plan" sub={`Reviewed ${row?.createdAt.toDateString()} · ${row?.model === "rules" ? "rule-based" : "AI"}`}>
            <div className="rounded-2xl bg-accent p-4 text-accent-foreground">
              <span className="text-[11px] font-bold tracking-[0.1em] uppercase opacity-75">The verdict</span>
              <p className="mt-1 font-heading text-lg leading-snug font-semibold">{review.verdict}</p>
            </div>

            <div className="flex flex-col gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <GaugeIcon className="size-4 text-primary" aria-hidden />
                Your numbers
              </span>
              <ul className="flex flex-col divide-y rounded-xl border bg-background/60">
                {review.metrics.map((m) => {
                  const st = STATUS[m.status as keyof typeof STATUS] ?? STATUS.good;
                  return (
                    <li key={m.name} className="flex items-start gap-3 px-3.5 py-3">
                      <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", st.dot)} aria-hidden />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="text-sm font-medium">{m.name}</span>
                        <span className="text-xs text-muted-foreground">{m.note}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-heading font-bold tabular-nums">{m.value}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.className)}>{st.label}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="text-sm font-semibold">Do this next</span>
              <ol className="flex flex-col gap-3">
                {review.actions.map((a, i) => (
                  <li key={i} className="flex gap-3">
                    <StepDot n={i + 1} active={i === 0} />
                    <span className="pt-0.5 text-sm">
                      <span className="font-semibold">{a.title}.</span> <span className="text-muted-foreground">{a.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl bg-success-soft px-4 py-3.5 text-success">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <WalletIcon className="size-4" aria-hidden />
                Next daily budget
              </span>
              <span className="font-heading text-2xl font-bold tabular-nums">${review.nextBudgetUsdPerDay.toFixed(2)}</span>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
