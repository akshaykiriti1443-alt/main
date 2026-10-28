import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/server/tenancy";
import { getSequenceWithSteps } from "@/server/email/sequences";
import { deleteSequenceAction, saveSequenceAction, sendTestEmailAction } from "@/actions/marketing";
import { Flash, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function SequencePage({ params, searchParams }: { params: Promise<{ wid: string; id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid, id } = await params;
  await requireWorkspace(wid);
  const seq = await getSequenceWithSteps(wid, id);
  if (!seq) notFound();
  const rows = [...seq.steps, { id: "new", position: seq.steps.length, delayMinutes: (seq.steps.at(-1)?.delayMinutes ?? 0) + 1440, subject: "", body: "" }];
  return (
    <>
      <PageHead eyebrow={<Link href={`/app/w/${wid}/emails`} className="muted">← Emails</Link>} title={seq.name} sub="Delays count from when the person joins the sequence. Leave an email's subject blank to remove it." />
      <Flash searchParams={await searchParams} />
      <form action={saveSequenceAction.bind(null, wid, id)} className="stack">
        <div className="card form-grid">
          <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" defaultValue={seq.name} /></div>
          <div className="row" style={{ alignItems: "flex-end", gap: 12 }}>
            <div className="field">
              <label htmlFor="trigger">Starts when</label>
              <select id="trigger" name="trigger" defaultValue={seq.trigger}>
                <option value="lead_created">Someone becomes a lead</option>
                <option value="tag_added">A tag is added</option>
                <option value="manual">An automation starts it</option>
              </select>
            </div>
            <div className="field"><label htmlFor="triggerValue">Tag (for tag trigger)</label><input id="triggerValue" name="triggerValue" defaultValue={seq.triggerValue} placeholder="webinar" /></div>
          </div>
          <label className="check full"><input type="checkbox" name="active" defaultChecked={seq.active} /> Sequence is on</label>
        </div>
        {rows.map((s, i) => (
          <div key={s.id} className="card stack">
            <div className="row-between">
              <h3>{s.id === "new" ? "Add another email" : `Email ${i + 1}`}</h3>
              <label className="row small">Send on day <input name="delayDays" type="number" min={0} max={365} step="0.5" defaultValue={Math.round((s.delayMinutes / 1440) * 2) / 2} style={{ width: 80 }} /></label>
            </div>
            <div className="field"><label>Subject</label><input name="subject" defaultValue={s.subject} placeholder={s.id === "new" ? "Leave blank to skip" : ""} /></div>
            <div className="field">
              <label>Message</label>
              <textarea name="body" defaultValue={s.body} rows={8} />
              <span className="help">Use {"{{first_name}}"}, {"{{skool_url}}"}, {"{{lead_magnet_url}}"}, {"{{business_name}}"}. Blank line = new paragraph. [Link text](https://…) makes a link.</span>
            </div>
          </div>
        ))}
        <div className="row"><SubmitButton>Save sequence</SubmitButton></div>
      </form>
      <div className="grid-2">
        <form action={sendTestEmailAction.bind(null, wid)} className="card stack">
          <h3>Send yourself a test of email 1</h3>
          <input type="hidden" name="back" value={`/app/w/${wid}/emails/sequences/${id}`} />
          <input type="hidden" name="subject" value={seq.steps[0]?.subject ?? ""} />
          <input type="hidden" name="body" value={seq.steps[0]?.body ?? ""} />
          <SubmitButton className="btn">Send test</SubmitButton>
        </form>
        <form action={deleteSequenceAction.bind(null, wid, id)} className="card stack">
          <h3>Delete sequence</h3>
          <p className="small muted">People in it stop getting these emails.</p>
          <SubmitButton className="btn btn-danger" confirm="Yes, delete">Delete</SubmitButton>
        </form>
      </div>
    </>
  );
}
