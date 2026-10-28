import Link from "next/link";
import { requireWorkspace } from "@/server/tenancy";
import { listConnections } from "@/server/inbox";
import { listPosts } from "@/server/social";
import { hasFeature } from "@/server/plans";
import { cancelPostAction, schedulePostAction } from "@/actions/marketing";
import { relativeTime, truncate } from "@/lib/util";
import { Empty, Flash, Locked, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function SocialPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace } = await requireWorkspace(wid);
  if (!hasFeature(workspace.plan, "social")) {
    return (
      <>
        <PageHead title="Social planner" sub="Write once, post to Instagram and Facebook on a schedule." />
        <Locked feature="The social planner" wid={wid} />
      </>
    );
  }
  const [connections, posts] = await Promise.all([listConnections(wid), listPosts(wid)]);
  const postable = connections.filter((c) => c.status === "active" && (c.kind === "instagram" || c.kind === "facebook_page"));
  const names = new Map(connections.map((c) => [c.id, c.name]));
  return (
    <>
      <PageHead title="Social planner" sub="Schedule posts to your Instagram and Facebook Page. Instagram posts need an image link." />
      <Flash searchParams={await searchParams} />
      {postable.length === 0 ? (
        <Empty title="Connect an account first" body="Connect Instagram and Facebook in Settings to start posting." action={<Link className="btn btn-primary" href={`/app/w/${wid}/settings#channels`}>Connect accounts</Link>} />
      ) : (
        <form action={schedulePostAction.bind(null, wid)} className="card stack">
          <h2>New post</h2>
          <div className="field"><label htmlFor="caption">Caption</label><textarea id="caption" name="caption" rows={5} maxLength={2200} placeholder="Hook first. Then value. Then a call to action: link in bio." /></div>
          <div className="form-grid">
            <div className="field"><label htmlFor="mediaUrl">Image link</label><input id="mediaUrl" name="mediaUrl" type="url" placeholder="https://…/image.jpg" /><span className="help">A public JPG or PNG link. Required for Instagram.</span></div>
            <div className="field"><label htmlFor="scheduledAt">When (leave blank to post now)</label><input id="scheduledAt" name="scheduledAt" type="datetime-local" /></div>
          </div>
          <div className="row">
            {postable.map((c) => (
              <label key={c.id} className="check"><input type="checkbox" name="connectionIds" value={c.id} defaultChecked /> {c.name} <span className="tiny muted">({c.kind === "instagram" ? "Instagram" : "Facebook"})</span></label>
            ))}
          </div>
          <SubmitButton>Schedule post</SubmitButton>
        </form>
      )}
      <div className="card">
        <div className="card-head"><h2>Posts</h2></div>
        {posts.length === 0 ? <p className="muted small">No posts yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Post</th><th>Accounts</th><th>When</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id}>
                    <td className="small">{truncate(p.caption || "(image only)", 80)}</td>
                    <td className="tiny">{p.connectionIds.map((id) => names.get(id) ?? "removed").join(", ")}</td>
                    <td className="small muted">{p.scheduledAt ? relativeTime(p.scheduledAt) : "—"}</td>
                    <td>
                      <span className={`badge ${p.status === "published" ? "badge-good" : p.status === "failed" ? "badge-bad" : p.status === "scheduled" ? "badge-warm" : ""}`}>{p.status}</span>
                      {p.status === "failed" ? <div className="tiny" style={{ color: "var(--bad)" }}>{Object.values(p.results).find((r) => !r.ok)?.error}</div> : null}
                    </td>
                    <td>{p.status === "scheduled" ? <form action={cancelPostAction.bind(null, wid, p.id)}><SubmitButton className="btn btn-sm">Cancel</SubmitButton></form> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
