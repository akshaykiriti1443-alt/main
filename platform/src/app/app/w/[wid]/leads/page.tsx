import Link from "next/link";
import { requireWorkspace } from "@/server/tenancy";
import { contactName, listContacts } from "@/server/contacts";
import { addContactAction } from "@/actions/crm";
import type { Stage, Temperature } from "@/lib/db/schema";
import { relativeTime } from "@/lib/util";
import { Empty, Flash, PageHead, TempBadge } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function LeadsPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  await requireWorkspace(wid);
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const list = await listContacts(wid, {
    q: sp.q,
    temperature: (sp.temperature as Temperature) || "",
    stage: (sp.stage as Stage) || "",
    tag: sp.tag,
    limit: 50,
    offset: page * 50,
  });
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k]) => !["ok", "error"].includes(k))), ...patch });
    return `?${p.toString()}`;
  };
  return (
    <>
      <PageHead title="Leads" sub="Everyone who opted in or messaged you. Hot leads are most likely to join soon." />
      <Flash searchParams={sp} />
      <form className="card row" method="get">
        <input type="search" name="q" defaultValue={sp.q} placeholder="Search name, email or phone" style={{ flex: 1, minWidth: 200 }} aria-label="Search" />
        <select name="temperature" defaultValue={sp.temperature ?? ""} aria-label="Temperature">
          <option value="">All temperatures</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </select>
        <select name="stage" defaultValue={sp.stage ?? ""} aria-label="Stage">
          <option value="">All stages</option>
          <option value="new">New</option>
          <option value="engaged">Engaged</option>
          <option value="trial">On trial</option>
          <option value="member">Member</option>
          <option value="lost">Lost</option>
        </select>
        <input name="tag" defaultValue={sp.tag} placeholder="Tag" style={{ width: 120 }} aria-label="Tag" />
        <button className="btn">Filter</button>
      </form>
      {list.length === 0 ? (
        <Empty title="No leads match" body="Leads appear here when people opt in on your pages or message you." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Temperature</th>
                <th>Stage</th>
                <th>Source</th>
                <th>Tags</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="clickable">
                  <td>
                    <Link href={`/app/w/${wid}/leads/${c.id}`}>
                      <strong>{contactName(c)}</strong>
                    </Link>
                    <div className="tiny muted">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>
                    <TempBadge t={c.temperature} /> <span className="tiny muted">{c.score}</span>
                  </td>
                  <td className="small">{c.stage}</td>
                  <td className="small">{c.source.replace("_", " ")}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      {c.tags.slice(0, 4).map((t) => (
                        <Link key={t} className="tag" href={qs({ tag: t, page: "0" })}>
                          {t}
                        </Link>
                      ))}
                    </div>
                  </td>
                  <td className="small muted">{relativeTime(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row-between">
        {page > 0 ? <Link className="btn btn-sm" href={qs({ page: String(page - 1) })}>← Newer</Link> : <span />}
        {list.length === 50 ? <Link className="btn btn-sm" href={qs({ page: String(page + 1) })}>Older →</Link> : null}
      </div>
      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 650 }}>Add a contact by hand</summary>
        <form action={addContactAction.bind(null, wid)} className="form-grid" style={{ marginTop: 14 }}>
          <div className="field"><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" /></div>
          <div className="field"><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" /></div>
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" /></div>
          <div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" /></div>
          <div className="field full"><label htmlFor="tags">Tags (comma separated)</label><input id="tags" name="tags" placeholder="vip, dm" /></div>
          <div className="full"><SubmitButton className="btn">Add contact</SubmitButton></div>
        </form>
      </details>
    </>
  );
}
