import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/server/tenancy";
import { contactName, contactTimeline, getContact } from "@/server/contacts";
import { latestConversationFor } from "@/server/inbox";
import { addTagAction, removeTagAction, saveContactAction, scoreContactAction, setStageAction } from "@/actions/crm";
import { relativeTime } from "@/lib/util";
import { Flash, PageHead, TempBadge } from "@/components/ui";
import { AutoSubmitSelect, SubmitButton } from "@/components/client";

const LABELS: Record<string, string> = {
  lead: "Opted in",
  email_sent: "Email sent",
  message_in: "Messaged you",
  message_out: "You replied",
  tag_added: "Tag added",
  stage_changed: "Stage changed",
  temperature_changed: "Temperature changed",
  unsubscribed: "Unsubscribed",
};

function detail(type: string, data: Record<string, unknown>): string {
  if (type === "lead") return String(data.page ?? "");
  if (type === "email_sent") return String(data.subject ?? "");
  if (type === "message_in") return `${data.channel}: ${data.preview ?? ""}`;
  if (type === "tag_added") return String(data.tag ?? "");
  if (type === "stage_changed") return String(data.stage ?? "");
  if (type === "temperature_changed") return `${data.temperature} (${data.score}) · ${data.reason ?? ""}`;
  return "";
}

export default async function ContactPage({ params, searchParams }: { params: Promise<{ wid: string; contactId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid, contactId } = await params;
  await requireWorkspace(wid);
  const c = await getContact(wid, contactId);
  if (!c) notFound();
  const [timeline, conv] = await Promise.all([contactTimeline(wid, contactId), latestConversationFor(wid, contactId)]);
  return (
    <>
      <PageHead
        eyebrow={<Link href={`/app/w/${wid}/leads`} className="muted">← Leads</Link>}
        title={contactName(c)}
        sub={[c.email, c.phone].filter(Boolean).join(" · ") || "No email or phone yet"}
        actions={
          <>
            {conv ? <Link className="btn" href={`/app/w/${wid}/inbox?c=${conv.id}`}>Open conversation</Link> : null}
            <form action={scoreContactAction.bind(null, wid, contactId)}>
              <SubmitButton className="btn" pendingText="Scoring…">Re-score lead</SubmitButton>
            </form>
          </>
        }
      />
      <Flash searchParams={await searchParams} />
      <div className="grid-2">
        <div className="stack">
          <div className="card stack">
            <div className="row-between">
              <h2>Lead score</h2>
              <TempBadge t={c.temperature} />
            </div>
            <div className="stat">
              <span className="value">{c.score}/100</span>
              <span className="hint">{c.scoreReason || "Not scored yet."}</span>
            </div>
            <form action={setStageAction.bind(null, wid, contactId)} className="row">
              <label className="label" htmlFor="stage">Pipeline stage</label>
              <AutoSubmitSelect
                name="stage"
                defaultValue={c.stage}
                options={[
                  { value: "new", label: "New" },
                  { value: "engaged", label: "Engaged" },
                  { value: "trial", label: "On free trial" },
                  { value: "member", label: "Paying member" },
                  { value: "lost", label: "Lost" },
                ]}
              />
            </form>
          </div>
          <div className="card stack">
            <h2>Tags</h2>
            <div className="row">
              {c.tags.length === 0 ? <span className="muted small">No tags yet.</span> : null}
              {c.tags.map((t) => (
                <form key={t} action={removeTagAction.bind(null, wid, contactId, t)}>
                  <button className="tag" title="Remove tag" style={{ cursor: "pointer", background: "none" }}>
                    {t} ✕
                  </button>
                </form>
              ))}
            </div>
            <form action={addTagAction.bind(null, wid, contactId)} className="row">
              <input name="tag" placeholder="Add a tag" style={{ width: 180 }} required aria-label="New tag" />
              <SubmitButton className="btn btn-sm">Add</SubmitButton>
            </form>
          </div>
          <form action={saveContactAction.bind(null, wid, contactId)} className="card stack">
            <div className="card-head">
              <h2>Details</h2>
              <SubmitButton className="btn btn-sm">Save</SubmitButton>
            </div>
            <div className="form-grid">
              <div className="field"><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" defaultValue={c.firstName} /></div>
              <div className="field"><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" defaultValue={c.lastName} /></div>
              <div className="field full"><label htmlFor="phone">Phone</label><input id="phone" name="phone" defaultValue={c.phone ?? ""} /></div>
              <div className="field full"><label htmlFor="notes">Notes</label><textarea id="notes" name="notes" defaultValue={c.notes} /></div>
            </div>
            <p className="tiny muted">
              Source: {c.source.replace("_", " ")} · Added {c.createdAt.toDateString()}
              {c.unsubscribed ? " · Unsubscribed from email" : ""}
            </p>
          </form>
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 12 }}>Timeline</h2>
          {timeline.length === 0 ? (
            <p className="muted">Nothing yet.</p>
          ) : (
            <div className="checklist">
              {timeline.map((a) => (
                <div key={a.id} className="check-item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                  <div>
                    <strong className="small">{LABELS[a.type] ?? a.type}</strong>
                    <div className="tiny muted" style={{ wordBreak: "break-word" }}>{detail(a.type, a.data)}</div>
                  </div>
                  <span className="tiny muted">{relativeTime(a.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
