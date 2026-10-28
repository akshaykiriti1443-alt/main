import Link from "next/link";
import { requireWorkspace } from "@/server/tenancy";
import { listAutomations, TRIGGER_LABELS } from "@/server/automations";
import { hasFeature } from "@/server/plans";
import { Empty, Flash, Locked, PageHead } from "@/components/ui";

const PRESETS = [
  { key: "hot", title: "Hot lead alert", body: "Score every new message. If the lead is hot, tag it, draft a reply and email you." },
  { key: "welcome-dm", title: "Instant DM reply", body: "Reply to new DMs within seconds with your free guide." },
  { key: "nurture", title: "Warm-up new leads", body: "Tag new leads, wait a day, then move them to Engaged." },
  { key: "member", title: "New member welcome", body: "When a lead becomes a member, tag them and send a welcome email." },
];

export default async function AutomationsPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace } = await requireWorkspace(wid);
  if (!hasFeature(workspace.plan, "automations")) {
    return (
      <>
        <PageHead title="Automations" sub="When something happens, do something. Tag, email, DM, score and alert on autopilot." />
        <Locked feature="Automations" wid={wid} />
      </>
    );
  }
  const list = await listAutomations(wid);
  return (
    <>
      <PageHead title="Automations" sub="When something happens, do something. They run 24/7." actions={<Link className="btn btn-primary" href={`/app/w/${wid}/automations/new`}>New automation</Link>} />
      <Flash searchParams={await searchParams} />
      {list.length === 0 ? (
        <Empty title="No automations yet" body="Start from a recipe below." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Trigger</th><th>Steps</th><th>Runs</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="clickable">
                  <td><Link href={`/app/w/${wid}/automations/${a.id}`}><strong>{a.name}</strong></Link></td>
                  <td className="small">{TRIGGER_LABELS[a.trigger.type]}{a.trigger.value ? `: ${a.trigger.value}` : ""}</td>
                  <td className="num">{a.actions.length}</td>
                  <td className="num">{a.runsCount}</td>
                  <td>{a.active ? <span className="badge badge-good">On</span> : <span className="badge">Off</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2>Recipes</h2>
      <div className="grid-2">
        {PRESETS.map((p) => (
          <div key={p.key} className="card stack">
            <h3>{p.title}</h3>
            <p className="muted small">{p.body}</p>
            <Link className="btn btn-sm" style={{ alignSelf: "flex-start" }} href={`/app/w/${wid}/automations/new?preset=${p.key}`}>Use recipe</Link>
          </div>
        ))}
      </div>
    </>
  );
}
