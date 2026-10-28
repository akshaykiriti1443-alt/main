import Link from "next/link";
import { requireAgency, workspaceIdsForAgency, workspacesByIds } from "@/server/tenancy";
import { listTemplates } from "@/server/templates";
import { deleteTemplateAction, saveTemplateFromWorkspaceAction } from "@/actions/agency";
import { relativeTime } from "@/lib/util";
import { Flash, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function AgencyTemplates({ params, searchParams }: { params: Promise<{ aid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { aid } = await params;
  await requireAgency(aid);
  const [templates, wsIds] = await Promise.all([listTemplates(aid), workspaceIdsForAgency(aid)]);
  const workspaces = await workspacesByIds(wsIds);
  return (
    <>
      <PageHead title="Templates" sub="A template copies funnels, email sequences and automations. Build it once in a client account, save it, then load it into every new client." />
      <Flash searchParams={await searchParams} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Template</th><th>Owner</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.name}</strong><div className="tiny muted">{t.description}</div></td>
                <td className="small">{t.agencyId ? "Your agency" : "Platform"}</td>
                <td className="small muted">{relativeTime(t.createdAt)}</td>
                <td>{t.agencyId ? <form action={deleteTemplateAction.bind(null, aid, t.id)}><SubmitButton className="btn btn-sm btn-danger" confirm="Confirm">Delete</SubmitButton></form> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {workspaces.length ? (
        <form action={saveTemplateFromWorkspaceAction.bind(null, aid)} className="card stack">
          <h2>Save a client account as a template</h2>
          <div className="form-grid">
            <div className="field"><label htmlFor="workspaceId">Account</label><select id="workspaceId" name="workspaceId">{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div className="field"><label htmlFor="name">Template name</label><input id="name" name="name" required placeholder="Fitness coach funnel" /></div>
            <div className="field full"><label htmlFor="description">Description</label><input id="description" name="description" /></div>
          </div>
          <SubmitButton>Save template</SubmitButton>
        </form>
      ) : (
        <p className="muted small">Create a client account first, build its funnel, then save it here. <Link href={`/app/agency/${aid}`}>Add a client</Link></p>
      )}
    </>
  );
}
