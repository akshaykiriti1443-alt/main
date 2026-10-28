import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import type { AdReview } from "@/server/ai/adReview";
import { adReviewAction } from "@/actions/marketing";
import { isUuid } from "@/lib/util";
import { Flash, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const maxDuration = 300;

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
      <div className="grid-2">
        <form action={adReviewAction.bind(null, wid)} className="card stack">
          <h2>Your last few days of ads</h2>
          <div className="form-grid">
            {[
              ["spend", "Amount spent ($)", "0.01"],
              ["days", "Days", "1"],
              ["impressions", "Impressions", "1"],
              ["linkClicks", "Link clicks", "1"],
              ["leads", "Leads", "1"],
              ["followers", "New followers", "1"],
              ["members", "New members", "1"],
            ].map(([name, label, step]) => (
              <div className="field" key={name}>
                <label htmlFor={name}>{label}</label>
                <input id={name} name={name} type="number" min={0} step={step} required={["spend", "impressions", "linkClicks", "leads"].includes(name)} defaultValue={last?.[name] !== undefined ? String(last[name]) : name === "days" ? "3" : ""} />
              </div>
            ))}
            <div className="field full"><label htmlFor="goal">Your goal</label><input id="goal" name="goal" placeholder="30 new paying members this month" defaultValue={last?.goal ? String(last.goal) : ""} /></div>
            <div className="field full"><label htmlFor="notes">Anything else? (optional)</label><textarea id="notes" name="notes" placeholder="Which ads you ran, countries, what you changed…" /></div>
          </div>
          <SubmitButton pendingText="Reviewing your ads…">Get my custom plan</SubmitButton>
          <p className="tiny muted">Where to find these: Ads Manager › Columns › Performance and clicks. Pick the last 3 or 7 days.</p>
        </form>
        <div className="card stack">
          <h2>Your plan</h2>
          {!review ? (
            <p className="muted">Submit your numbers to get your plan.</p>
          ) : (
            <>
              <div className="alert alert-info"><strong>{review.verdict}</strong></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Number</th><th>Yours</th><th></th></tr></thead>
                  <tbody>
                    {review.metrics.map((m) => (
                      <tr key={m.name}>
                        <td><strong className="small">{m.name}</strong><div className="tiny muted">{m.note}</div></td>
                        <td className="num">{m.value}</td>
                        <td><span className={`badge ${m.status === "good" ? "badge-good" : m.status === "ok" ? "badge-warm" : "badge-bad"}`}>{m.status === "fix" ? "Fix" : m.status === "ok" ? "OK" : "Good"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>Do this next</h3>
              <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                {review.actions.map((a, i) => (
                  <li key={i}><strong>{a.title}.</strong> <span className="muted">{a.detail}</span></li>
                ))}
              </ol>
              <p>Next daily budget: <strong>${review.nextBudgetUsdPerDay.toFixed(2)}</strong></p>
              <p className="tiny muted">Reviewed {row?.createdAt.toDateString()} · {row?.model === "rules" ? "rule-based" : "AI"}</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
