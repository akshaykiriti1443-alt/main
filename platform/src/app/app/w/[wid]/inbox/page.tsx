import Link from "next/link";
import { requireWorkspace } from "@/server/tenancy";
import { getConversation, listConversations, markRead } from "@/server/inbox";
import { contactName } from "@/server/contacts";
import { hasFeature } from "@/server/plans";
import { draftReplyAction, sendReplyAction, setConversationStatusAction } from "@/actions/crm";
import type { ConversationChannel } from "@/lib/db/schema";
import { relativeTime } from "@/lib/util";
import { Empty, Flash, Locked, PageHead, TempBadge } from "@/components/ui";
import { SubmitButton } from "@/components/client";

const CHANNEL: Record<ConversationChannel, string> = { facebook: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp", sms: "SMS", email: "Email" };

export default async function InboxPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace } = await requireWorkspace(wid);
  if (!hasFeature(workspace.plan, "inbox")) {
    return (
      <>
        <PageHead title="Inbox" sub="Every DM, WhatsApp and text in one place, sorted by how hot the lead is." />
        <Locked feature="The unified inbox" wid={wid} />
      </>
    );
  }
  const status = sp.status === "closed" ? "closed" : "open";
  const list = await listConversations(wid, { status, channel: (sp.channel as ConversationChannel) || undefined });
  const activeId = sp.c ?? list[0]?.conversation.id;
  const active = activeId ? await getConversation(wid, activeId) : null;
  if (active && active.conversation.unread > 0) await markRead(wid, active.conversation.id);
  // Hot leads first, then newest.
  const rank = { hot: 0, warm: 1, cold: 2 } as const;
  const sorted = [...list].sort((a, b) => rank[a.contact.temperature] - rank[b.contact.temperature] || (b.conversation.lastMessageAt?.getTime() ?? 0) - (a.conversation.lastMessageAt?.getTime() ?? 0));

  return (
    <>
      <PageHead
        title="Inbox"
        sub="Hot leads float to the top. AI drafts a reply; you review and send."
        actions={
          <div className="tabs" style={{ border: 0 }}>
            <Link className={`tab${status === "open" ? " active" : ""}`} href={`/app/w/${wid}/inbox`}>Open</Link>
            <Link className={`tab${status === "closed" ? " active" : ""}`} href={`/app/w/${wid}/inbox?status=closed`}>Closed</Link>
          </div>
        }
      />
      <Flash searchParams={sp} />
      {list.length === 0 && !active ? (
        <Empty
          title={status === "open" ? "No conversations yet" : "No closed conversations"}
          body="Connect Instagram, Facebook, WhatsApp or SMS in Settings. New messages appear here."
          action={<Link className="btn btn-primary" href={`/app/w/${wid}/settings#channels`}>Connect a channel</Link>}
        />
      ) : (
        <div className="inbox">
          <div className="inbox-list">
            {sorted.map(({ conversation: c, contact }) => (
              <Link key={c.id} href={`/app/w/${wid}/inbox?c=${c.id}${status === "closed" ? "&status=closed" : ""}`} className={`inbox-item${c.id === activeId ? " active" : ""}`}>
                <div className="row-between">
                  <strong className="small">{contactName(contact)}</strong>
                  <span className="tiny muted">{relativeTime(c.lastMessageAt)}</span>
                </div>
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  <span className="badge">{CHANNEL[c.channel]}</span>
                  <TempBadge t={contact.temperature} />
                  {c.unread ? <span className="nav-count">{c.unread}</span> : null}
                </div>
                <div className="tiny muted" style={{ marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastMessagePreview}</div>
              </Link>
            ))}
          </div>
          <div className="inbox-thread">
            {!active ? (
              <div className="empty" style={{ margin: 16 }}>Pick a conversation.</div>
            ) : (
              <>
                <div className="thread-head">
                  <div>
                    <Link href={`/app/w/${wid}/leads/${active.contact.id}`}><strong>{contactName(active.contact)}</strong></Link>{" "}
                    <span className="badge">{CHANNEL[active.conversation.channel]}</span> <TempBadge t={active.contact.temperature} />
                    {active.contact.scoreReason ? <div className="tiny muted">{active.contact.scoreReason}</div> : null}
                  </div>
                  <form action={setConversationStatusAction.bind(null, wid, active.conversation.id, active.conversation.status === "open" ? "closed" : "open")}>
                    <SubmitButton className="btn btn-sm">{active.conversation.status === "open" ? "Close" : "Reopen"}</SubmitButton>
                  </form>
                </div>
                <div className="thread-body">
                  {active.messages.map((m) => (
                    <div key={m.id} className="stack" style={{ gap: 2, alignItems: m.direction === "in" ? "flex-start" : "flex-end" }}>
                      <div className={`bubble ${m.direction}`}>{m.body}</div>
                      <span className="bubble-meta">
                        {relativeTime(m.createdAt)}
                        {m.direction === "out" ? ` · ${m.status}` : ""}
                        {m.error ? ` · ${m.error}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <form action={sendReplyAction.bind(null, wid, active.conversation.id)} className="thread-compose">
                  {active.conversation.suggestedReply ? <span className="tiny muted">✨ AI draft. Edit it, then send.</span> : null}
                  <textarea name="body" rows={3} defaultValue={active.conversation.suggestedReply ?? ""} placeholder="Write a reply…" aria-label="Reply" key={active.conversation.suggestedReply ?? "empty"} />
                  <div className="row-between">
                    <SubmitButton pendingText="Sending…">Send</SubmitButton>
                    <button formAction={draftReplyAction.bind(null, wid, active.conversation.id)} className="btn btn-sm" formNoValidate>
                      ✨ Draft with AI
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
