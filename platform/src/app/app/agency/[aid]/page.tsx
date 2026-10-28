import Link from "next/link";
import { requireAgency } from "@/server/tenancy";
import { listSubAccounts } from "@/server/agency";
import { listTemplates } from "@/server/templates";
import { createSubAccountAction, setSubAccountStatusAction } from "@/actions/agency";
import { Empty, Flash, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function AgencyHome({ params, searchParams }: { params: Promise<{ aid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { aid } = await params;
  const { agency } = await requireAgency(aid);
  const [subs, templates] = await Promise.all([listSubAccounts(aid), listTemplates(aid)]);
  return (
    <>
      <PageHead eyebrow={agency.brand.name || agency.name} title="Client accounts" sub="Each client gets their own funnels, leads, inbox and automations. Usage is billed to your agency wallet." />
      <Flash searchParams={await searchParams} />
      {subs.length === 0 ? (
        <Empty title="No clients yet" body="Add your first client below. Load a template to give them a ready-made funnel." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Account</th><th>Owner</th><th>Contacts</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {subs.map(({ workspace: w, contacts, owner }) => (
                <tr key={w.id}>
                  <td><Link href={`/app/w/${w.id}`}><strong>{w.name}</strong></Link><div className="tiny muted">{w.plan}</div></td>
                  <td className="small">{owner ?? <span className="muted">no owner yet</span>}</td>
                  <td className="num">{contacts}</td>
                  <td><span className={`badge ${w.status === "active" ? "badge-good" : "badge-bad"}`}>{w.status}</span></td>
                  <td>
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      <Link className="btn btn-sm" href={`/app/w/${w.id}`}>Open</Link>
                      <form action={setSubAccountStatusAction.bind(null, aid, w.id, w.status === "paused" ? "active" : "paused")}>
                        <SubmitButton className={`btn btn-sm${w.status === "paused" ? "" : " btn-danger"}`} confirm={w.status === "paused" ? undefined : "Confirm pause"}>
                          {w.status === "paused" ? "Unpause" : "Pause"}
                        </SubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form action={createSubAccountAction.bind(null, aid)} className="card stack">
        <h2>Add a client</h2>
        <div className="form-grid">
          <div className="field"><label htmlFor="name">Business name</label><input id="name" name="name" required placeholder="Coach Maria Fitness" /></div>
          <div className="field">
            <label htmlFor="templateId">Start from</label>
            <select id="templateId" name="templateId" defaultValue="">
              <option value="">Blank account with defaults</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.agencyId ? "" : " (platform)"}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="ownerName">Client's name (optional)</label><input id="ownerName" name="ownerName" /></div>
          <div className="field"><label htmlFor="ownerEmail">Client's email (optional)</label><input id="ownerEmail" name="ownerEmail" type="email" /><span className="help">We email them a link to set their password.</span></div>
        </div>
        <SubmitButton>Create client account</SubmitButton>
      </form>
    </>
  );
}
