import { and, desc, eq } from "drizzle-orm";
import { ClipboardListIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { aiGenerations } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import type { AdReview } from "@/server/ai/adReview";
import { adReviewAction } from "@/actions/marketing";
import { isUuid } from "@/lib/util";
import { Callout, Empty, Flash, PageHead, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export const maxDuration = 300;

const STATUS = {
  good: { label: "Good", className: "bg-success-soft text-success" },
  ok: { label: "OK", className: "bg-warning-soft text-warning" },
  fix: { label: "Fix", className: "bg-destructive/10 text-destructive" },
} as const;

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
  return (
    <>
      <PageHead title="Ad review" sub="Paste your numbers from Meta Ads Manager. You get a custom plan: what to keep, what to fix and how much to spend next." />
      <Flash searchParams={sp} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <form action={adReviewAction.bind(null, wid)}>
          <Panel title="Your last few days of ads" sub="Where to find these: Ads Manager › Columns › Performance and clicks. Pick the last 3 or 7 days.">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["spend", "Amount spent ($)", "0.01"],
                ["days", "Days", "1"],
                ["impressions", "Impressions", "1"],
                ["linkClicks", "Link clicks", "1"],
                ["leads", "Leads", "1"],
                ["followers", "New followers", "1"],
                ["members", "New members", "1"],
              ].map(([name, label, step]) => (
                <Field key={name}>
                  <FieldLabel htmlFor={name}>{label}</FieldLabel>
                  <Input
                    id={name}
                    name={name}
                    type="number"
                    min={0}
                    step={step}
                    required={["spend", "impressions", "linkClicks", "leads"].includes(name)}
                    defaultValue={last?.[name] !== undefined ? String(last[name]) : name === "days" ? "3" : ""}
                    className="tabular-nums"
                  />
                </Field>
              ))}
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="goal">Your goal</FieldLabel>
                <Input id="goal" name="goal" placeholder="30 new paying members this month" defaultValue={last?.goal ? String(last.goal) : ""} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="notes">
                  Anything else? <span className="font-normal text-muted-foreground">(optional)</span>
                </FieldLabel>
                <Textarea id="notes" name="notes" placeholder="Which ads you ran, countries, what you changed…" />
              </Field>
            </div>
            <div className="pt-1">
              <SubmitButton pendingText="Reviewing your ads…">Get my custom plan</SubmitButton>
            </div>
          </Panel>
        </form>

        <Panel title="Your plan" sub={review ? `Reviewed ${row?.createdAt.toDateString()} · ${row?.model === "rules" ? "rule-based" : "AI"}` : undefined}>
          {!review ? (
            <Empty icon={ClipboardListIcon} title="No plan yet" body="Submit your numbers to get your plan." />
          ) : (
            <>
              <Callout tone="info">
                <span className="font-medium">{review.verdict}</span>
              </Callout>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead className="text-right">Yours</TableHead>
                      <TableHead>
                        <span className="sr-only">Status</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {review.metrics.map((m) => {
                      const st = STATUS[m.status as keyof typeof STATUS] ?? STATUS.good;
                      return (
                        <TableRow key={m.name}>
                          <TableCell className="whitespace-normal">
                            <div className="font-medium">{m.name}</div>
                            <div className="text-xs text-muted-foreground">{m.note}</div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{m.value}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary" className={st.className}>
                              {st.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-2.5 pt-1">
                <h3 className="font-medium">Do this next</h3>
                <ol className="flex flex-col gap-3">
                  {review.actions.map((a, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">{i + 1}</span>
                      <span>
                        <span className="font-medium">{a.title}.</span> <span className="text-muted-foreground">{a.detail}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3.5 py-3">
                <span className="text-muted-foreground">Next daily budget</span>
                <span className="text-lg font-semibold tabular-nums">${review.nextBudgetUsdPerDay.toFixed(2)}</span>
              </div>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
