import { requirePlatformAdmin } from "@/server/auth";
import { recentJobs, recentWebhooks } from "@/server/admin";
import { retryJobAction, runTickAction } from "@/actions/admin";
import { relativeTime, truncate } from "@/lib/util";
import { Flash, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function AdminJobs({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePlatformAdmin();
  const [failed, pending, hooks] = await Promise.all([recentJobs("failed"), recentJobs("pending"), recentWebhooks()]);
  return (
    <>
      <PageHead title="Jobs & webhooks" sub="Background work: emails, Conversions API events, scoring, posts and webhooks." actions={<form action={runTickAction}><SubmitButton className="btn">Run jobs now</SubmitButton></form>} />
      <Flash searchParams={await searchParams} />
      <div className="card">
        <div className="card-head"><h2>Failed ({failed.length})</h2></div>
        {failed.length === 0 ? <p className="muted small">Nothing failed. 🎉</p> : (
          <div className="table-wrap"><table><thead><tr><th>Type</th><th>Error</th><th>Attempts</th><th>When</th><th></th></tr></thead><tbody>
            {failed.map((j) => (
              <tr key={j.id}><td className="mono small">{j.type}</td><td className="tiny">{truncate(j.lastError ?? "", 160)}</td><td className="num">{j.attempts}</td><td className="small muted">{relativeTime(j.createdAt)}</td><td><form action={retryJobAction.bind(null, j.id)}><SubmitButton className="btn btn-sm">Retry</SubmitButton></form></td></tr>
            ))}
          </tbody></table></div>
        )}
      </div>
      <div className="card">
        <div className="card-head"><h2>Pending ({pending.length})</h2></div>
        <div className="table-wrap"><table><thead><tr><th>Type</th><th>Runs</th><th>Attempts</th></tr></thead><tbody>
          {pending.map((j) => <tr key={j.id}><td className="mono small">{j.type}</td><td className="small">{relativeTime(j.runAt)}</td><td className="num">{j.attempts}</td></tr>)}
        </tbody></table></div>
      </div>
      <div className="card">
        <div className="card-head"><h2>Recent webhooks</h2></div>
        <div className="table-wrap"><table><thead><tr><th>Source</th><th>Received</th><th>Status</th></tr></thead><tbody>
          {hooks.map((h) => <tr key={h.id}><td className="small">{h.source}</td><td className="small muted">{relativeTime(h.createdAt)}</td><td>{h.error ? <span className="badge badge-bad" title={h.error}>error</span> : h.processedAt ? <span className="badge badge-good">processed</span> : <span className="badge">queued</span>}</td></tr>)}
        </tbody></table></div>
      </div>
    </>
  );
}
