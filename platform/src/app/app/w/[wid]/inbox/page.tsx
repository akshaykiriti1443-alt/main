import Link from "next/link";
import { InboxIcon, MessageSquareIcon, SparklesIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { getConversation, listConversations, markRead } from "@/server/inbox";
import { contactName } from "@/server/contacts";
import { hasFeature } from "@/server/plans";
import { draftReplyAction, sendReplyAction, setConversationStatusAction } from "@/actions/crm";
import type { ConversationChannel } from "@/lib/db/schema";
import { relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Empty, Flash, Locked, PageHead, TempBadge } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
          <nav className="inline-flex items-center gap-1 rounded-lg bg-muted p-1" aria-label="Conversation status">
            {(
              [
                ["open", "Open", `/app/w/${wid}/inbox`],
                ["closed", "Closed", `/app/w/${wid}/inbox?status=closed`],
              ] as const
            ).map(([key, label, href]) => (
              <Button
                key={key}
                variant="ghost"
                size="sm"
                asChild
                className={cn(status === key ? "bg-background text-foreground shadow-sm hover:bg-background dark:bg-input/40" : "text-muted-foreground")}
              >
                <Link href={href} aria-current={status === key ? "page" : undefined}>
                  {label}
                </Link>
              </Button>
            ))}
          </nav>
        }
      />
      <Flash searchParams={sp} />
      {list.length === 0 && !active ? (
        <Empty
          icon={InboxIcon}
          title={status === "open" ? "No conversations yet" : "No closed conversations"}
          body="Connect Instagram, Facebook, WhatsApp or SMS in Settings. New messages appear here."
          action={
            <Button asChild>
              <Link href={`/app/w/${wid}/settings#channels`}>Connect a channel</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid min-h-[560px] grid-cols-1 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:grid-cols-[320px_minmax(0,1fr)]">
          <div className="max-h-[260px] overflow-y-auto border-b md:max-h-[72vh] md:border-r md:border-b-0">
            {sorted.map(({ conversation: c, contact }) => {
              const isActive = c.id === activeId;
              return (
                <Link
                  key={c.id}
                  href={`/app/w/${wid}/inbox?c=${c.id}${status === "closed" ? "&status=closed" : ""}`}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "block border-b px-3.5 py-3 text-foreground transition-colors last:border-b-0 hover:bg-muted/60 hover:no-underline",
                    isActive && "bg-accent hover:bg-accent",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>{contactName(contact)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{CHANNEL[c.channel]}</Badge>
                    <TempBadge t={contact.temperature} />
                    {c.unread ? <Badge className="ml-auto tabular-nums">{c.unread}</Badge> : null}
                  </div>
                  <div className="mt-1.5 truncate text-xs text-muted-foreground">{c.lastMessagePreview}</div>
                </Link>
              );
            })}
          </div>
          <div className="flex min-w-0 flex-col">
            {!active ? (
              <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <MessageSquareIcon className="size-6" aria-hidden />
                  Pick a conversation.
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/app/w/${wid}/leads/${active.contact.id}`} className="font-semibold text-foreground">
                        {contactName(active.contact)}
                      </Link>
                      <Badge variant="outline">{CHANNEL[active.conversation.channel]}</Badge>
                      <TempBadge t={active.contact.temperature} />
                    </div>
                    {active.contact.scoreReason ? <div className="mt-0.5 text-xs text-muted-foreground">{active.contact.scoreReason}</div> : null}
                  </div>
                  <form action={setConversationStatusAction.bind(null, wid, active.conversation.id, active.conversation.status === "open" ? "closed" : "open")}>
                    <SubmitButton variant="outline" size="sm">
                      {active.conversation.status === "open" ? "Close" : "Reopen"}
                    </SubmitButton>
                  </form>
                </div>
                <div className="flex max-h-[52vh] flex-1 flex-col gap-3 overflow-y-auto bg-muted/30 p-4">
                  {active.messages.map((m) => (
                    <div key={m.id} className={cn("flex flex-col gap-1", m.direction === "in" ? "items-start" : "items-end")}>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap sm:max-w-[75%]",
                          m.direction === "in" ? "rounded-bl-sm bg-card ring-1 ring-foreground/10" : "rounded-br-sm bg-primary text-primary-foreground",
                        )}
                      >
                        {m.body}
                      </div>
                      <span className={cn("text-[11px] text-muted-foreground", m.error && "text-destructive")}>
                        {relativeTime(m.createdAt)}
                        {m.direction === "out" ? ` · ${m.status}` : ""}
                        {m.error ? ` · ${m.error}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <form action={sendReplyAction.bind(null, wid, active.conversation.id)} className="flex flex-col gap-2 border-t px-4 py-3">
                  {active.conversation.suggestedReply ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <SparklesIcon className="size-3.5 text-primary" aria-hidden /> AI draft. Edit it, then send.
                    </span>
                  ) : null}
                  <Textarea
                    name="body"
                    rows={3}
                    defaultValue={active.conversation.suggestedReply ?? ""}
                    placeholder="Write a reply…"
                    aria-label="Reply"
                    key={active.conversation.suggestedReply ?? "empty"}
                    className="max-h-60 min-h-20"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <SubmitButton pendingText="Sending…">Send</SubmitButton>
                    <Button type="submit" variant="ghost" size="sm" formAction={draftReplyAction.bind(null, wid, active.conversation.id)} formNoValidate>
                      <SparklesIcon data-icon="inline-start" /> Draft with AI
                    </Button>
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
