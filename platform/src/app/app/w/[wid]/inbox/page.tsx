import Link from "next/link";
import { InboxIcon, MessageSquareIcon, PlugIcon, SendIcon, SparklesIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { getConversation, listConversations, markRead } from "@/server/inbox";
import { contactName } from "@/server/contacts";
import { hasFeature } from "@/server/plans";
import { draftReplyAction, sendReplyAction, setConversationStatusAction } from "@/actions/crm";
import type { ConversationChannel } from "@/lib/db/schema";
import { relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Empty, Flash, Locked, PageHead, TempBadge } from "@/components/ui";
import { Avatar, SegmentedLinks } from "@/components/crm-ui";
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
        <PageHead eyebrow="Talk" title="Inbox" sub="Every DM, WhatsApp and text in one place, sorted by how hot the lead is." />
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
  const unread = list.reduce((n, x) => n + (x.conversation.unread ? 1 : 0), 0);

  return (
    <>
      <PageHead
        eyebrow="Talk"
        title="Inbox"
        sub="Every DM, WhatsApp and text in one place. Hot leads float to the top, AI drafts a reply, you send it."
        first={list.length === 0 && !active && status === "open" ? "Connect Instagram or Facebook in Settings, and new DMs land here." : undefined}
        actions={
          <SegmentedLinks
            label="Conversation status"
            items={[
              { key: "open", href: `/app/w/${wid}/inbox`, label: "Open", active: status === "open", count: status === "open" && list.length ? list.length : undefined },
              { key: "closed", href: `/app/w/${wid}/inbox?status=closed`, label: "Closed", active: status === "closed" },
            ]}
          />
        }
      />
      <Flash searchParams={sp} />
      {list.length === 0 && !active ? (
        status === "open" ? (
          <Empty
            icon={InboxIcon}
            title="Your DMs, all in one place"
            body="Connect Instagram, Facebook, WhatsApp or SMS. New messages land here with the hottest leads on top, so nobody waits three days for a reply."
            action={
              <Button asChild size="lg" variant="cta">
                <Link href={`/app/w/${wid}/settings#channels`}>
                  <PlugIcon data-icon="inline-start" />
                  Connect a channel
                </Link>
              </Button>
            }
          />
        ) : (
          <Empty
            icon={InboxIcon}
            tone="muted"
            title="No closed conversations"
            body="When you close a conversation it moves here, out of your way."
            action={
              <Button asChild variant="outline">
                <Link href={`/app/w/${wid}/inbox`}>Back to open</Link>
              </Button>
            }
          />
        )
      ) : (
        <div className="grid min-h-[600px] grid-cols-1 overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-ink/[0.06] @2xl/main:grid-cols-[260px_minmax(0,1fr)] @4xl/main:grid-cols-[300px_minmax(0,1fr)] dark:ring-white/[0.07]">
          <div className="flex min-h-0 flex-col border-b border-border/80 @2xl/main:border-r @2xl/main:border-b-0">
            <div className="flex items-center justify-between gap-2 border-b border-border/80 px-4 py-3">
              <span className="text-[11.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Hottest first</span>
              {unread ? <span className="text-xs text-subtle-foreground tabular-nums">{unread} unread</span> : null}
            </div>
            <div className="max-h-[300px] overflow-y-auto @2xl/main:max-h-[72vh]">
              {sorted.map(({ conversation: c, contact }) => {
                const isActive = c.id === activeId;
                const name = contactName(contact);
                return (
                  <Link
                    key={c.id}
                    href={`/app/w/${wid}/inbox?c=${c.id}${status === "closed" ? "&status=closed" : ""}`}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "relative flex gap-3 border-b border-border/60 px-4 py-3.5 text-foreground no-underline transition-colors duration-150 last:border-b-0 hover:bg-accent/50 hover:no-underline dark:hover:bg-white/[0.03]",
                      isActive && "bg-accent hover:bg-accent dark:bg-accent dark:hover:bg-accent",
                    )}
                  >
                    {isActive ? <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary" /> : null}
                    <span className="relative">
                      <Avatar name={name} />
                      {c.unread ? <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-card" /> : null}
                    </span>
                    <span className="grid min-w-0 flex-1 gap-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>{name}</span>
                        <span className="shrink-0 text-[11.5px] text-subtle-foreground tabular-nums">{relativeTime(c.lastMessageAt)}</span>
                      </span>
                      <span className={cn("truncate text-[13px]", c.unread ? "text-foreground/85" : "text-muted-foreground")}>{c.lastMessagePreview}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <TempBadge t={contact.temperature} />
                        <span className="text-[11.5px] text-subtle-foreground">{CHANNEL[c.channel]}</span>
                        {c.unread ? <Badge className="ml-auto h-5 min-w-5 px-1.5 tabular-nums">{c.unread}</Badge> : null}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex min-w-0 flex-col">
            {!active ? (
              <div className="grid flex-1 place-items-center p-8">
                <Empty icon={MessageSquareIcon} tone="muted" className="border-0 bg-transparent" title="Pick a conversation" body="Hot leads are at the top of the list." />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-5 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={contactName(active.contact)} size="lg" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/app/w/${wid}/leads/${active.contact.id}`} className="font-semibold text-foreground no-underline hover:text-primary hover:no-underline dark:hover:text-violet-300">
                          {contactName(active.contact)}
                        </Link>
                        <TempBadge t={active.contact.temperature} />
                        <Badge variant="outline">{CHANNEL[active.conversation.channel]}</Badge>
                      </div>
                      {active.contact.scoreReason ? <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{active.contact.scoreReason}</div> : null}
                    </div>
                  </div>
                  <form action={setConversationStatusAction.bind(null, wid, active.conversation.id, active.conversation.status === "open" ? "closed" : "open")}>
                    <SubmitButton variant="outline" size="sm">
                      {active.conversation.status === "open" ? "Close" : "Reopen"}
                    </SubmitButton>
                  </form>
                </div>
                <div className="flex max-h-[52vh] min-h-56 flex-1 flex-col gap-4 overflow-y-auto bg-background/60 px-5 py-6 dark:bg-black/10">
                  {active.messages.map((m) => (
                    <div key={m.id} className={cn("flex flex-col gap-1.5", m.direction === "in" ? "items-start" : "items-end")}>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-[18px] px-4 py-2.5 text-[14.5px] leading-relaxed break-words whitespace-pre-wrap @2xl/main:max-w-[72%]",
                          m.direction === "in"
                            ? "rounded-bl-md bg-card text-foreground shadow-xs ring-1 ring-ink/[0.06] dark:ring-white/[0.07]"
                            : "rounded-br-md bg-primary text-primary-foreground shadow-press",
                        )}
                      >
                        {m.body}
                      </div>
                      <span className={cn("px-1 text-[11px] text-subtle-foreground", m.error && "text-destructive")}>
                        {relativeTime(m.createdAt)}
                        {m.direction === "out" ? ` · ${m.status}` : ""}
                        {m.error ? ` · ${m.error}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <form action={sendReplyAction.bind(null, wid, active.conversation.id)} className="flex flex-col gap-3 border-t border-border/80 px-5 py-4">
                  {active.conversation.suggestedReply ? (
                    <span className="flex w-fit items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
                      <SparklesIcon className="size-3.5" aria-hidden /> AI draft. Edit it, then send.
                    </span>
                  ) : null}
                  <Textarea
                    name="body"
                    rows={3}
                    defaultValue={active.conversation.suggestedReply ?? ""}
                    placeholder="Write a reply…"
                    aria-label="Reply"
                    key={active.conversation.suggestedReply ?? "empty"}
                    className="max-h-60 min-h-24 rounded-xl text-[14.5px] leading-relaxed"
                  />
                  {/* Send stays first in the form (the default button); it just sits on the right. */}
                  <div className="flex flex-row-reverse flex-wrap items-center justify-between gap-2">
                    <SubmitButton pendingText="Sending…">
                      <SendIcon data-icon="inline-start" />
                      Send
                    </SubmitButton>
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
