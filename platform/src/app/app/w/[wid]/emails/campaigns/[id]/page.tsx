import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/server/tenancy";
import { countAudience, getCampaign } from "@/server/email/campaigns";
import { saveCampaignAction, sendTestEmailAction } from "@/actions/marketing";
import { Flash, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ wid: string; id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid, id } = await params;
  await requireWorkspace(wid);
  const c = await getCampaign(wid, id);
  if (!c) notFound();
  const audienceSize = await countAudience(wid, c.audience);
  const locked = c.status !== "draft";
  const temps = c.audience.temperatures ?? [];
  const stages = c.audience.stages ?? [];
  return (
    <>
      <PageHead eyebrow={<Link href={`/app/w/${wid}/emails`} className="muted">← Emails</Link>} title={c.name} sub={locked ? `Status: ${c.status}. ${c.recipients ? `${c.recipients} recipients.` : ""}` : `${audienceSize} people match this audience right now.`} />
      <Flash searchParams={await searchParams} />
      <form action={saveCampaignAction.bind(null, wid, id)} className="stack">
        <fieldset disabled={locked} className="card stack" style={{ border: "1px solid var(--line)" }}>
          <div className="field"><label htmlFor="name">Internal name</label><input id="name" name="name" defaultValue={c.name} /></div>
          <div className="field"><label htmlFor="subject">Subject</label><input id="subject" name="subject" defaultValue={c.subject} /></div>
          <div className="field"><label htmlFor="body">Message</label><textarea id="body" name="body" rows={10} defaultValue={c.body} /><span className="help">Same placeholders as sequences. Unsubscribed people never get broadcasts.</span></div>
          <h3>Audience</h3>
          <div className="row">
            {(["hot", "warm", "cold"] as const).map((t) => (
              <label key={t} className="check"><input type="checkbox" name="temperatures" value={t} defaultChecked={temps.includes(t)} /> {t}</label>
            ))}
          </div>
          <div className="row">
            {(["new", "engaged", "trial", "member", "lost"] as const).map((s) => (
              <label key={s} className="check"><input type="checkbox" name="stages" value={s} defaultChecked={stages.includes(s)} /> {s}</label>
            ))}
          </div>
          <div className="field"><label htmlFor="tags">Tags (any of, comma separated)</label><input id="tags" name="tags" defaultValue={(c.audience.tags ?? []).join(", ")} /></div>
          <p className="tiny muted">Leave everything unticked to send to all subscribed contacts.</p>
          <div className="field" style={{ maxWidth: 280 }}><label htmlFor="sendAt">Send at (optional)</label><input id="sendAt" name="sendAt" type="datetime-local" /></div>
        </fieldset>
        {!locked ? (
          <div className="row">
            <button className="btn" name="intent" value="save">Save draft</button>
            <button className="btn btn-primary" name="intent" value="schedule">Save & send</button>
          </div>
        ) : null}
      </form>
      <form action={sendTestEmailAction.bind(null, wid)} className="card row-between">
        <span className="small muted">Preview it in your own inbox first.</span>
        <input type="hidden" name="back" value={`/app/w/${wid}/emails/campaigns/${id}`} />
        <input type="hidden" name="subject" value={c.subject} />
        <input type="hidden" name="body" value={c.body} />
        <SubmitButton className="btn">Send me a test</SubmitButton>
      </form>
    </>
  );
}
