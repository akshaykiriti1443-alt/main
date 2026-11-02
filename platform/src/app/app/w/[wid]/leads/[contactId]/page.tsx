import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, HistoryIcon, MessageCircleIcon, XIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { contactName, contactTimeline, getContact } from "@/server/contacts";
import { latestConversationFor } from "@/server/inbox";
import { intentForContact } from "@/server/ai/skoolMessages";
import { addTagAction, removeTagAction, saveContactAction, scoreContactAction, setStageAction } from "@/actions/crm";
import { SkoolAssist } from "@/components/skool-assist";
import { relativeTime } from "@/lib/util";
import { Empty, Flash, PageHead, Panel, TempBadge } from "@/components/ui";
import { AutoSubmitSelect, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const LABELS: Record<string, string> = {
  lead: "Opted in",
  email_sent: "Email sent",
  message_in: "Messaged you",
  message_out: "You replied",
  tag_added: "Tag added",
  stage_changed: "Stage changed",
  skool_joined: "Joined your Skool group",
  skool_trial: "Started a Skool trial",
  skool_converted: "Trial converted to paid 🎉",
  skool_churned: "Left your Skool group",
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
  const { workspace } = await requireWorkspace(wid);
  const c = await getContact(wid, contactId);
  if (!c) notFound();
  const defaultIntent = intentForContact(c);
  const [timeline, conv] = await Promise.all([contactTimeline(wid, contactId), latestConversationFor(wid, contactId)]);
  return (
    <>
      <PageHead
        eyebrow={
          <Link href={`/app/w/${wid}/leads`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-3.5" aria-hidden /> Leads
          </Link>
        }
        title={contactName(c)}
        sub={[c.email, c.phone].filter(Boolean).join(" · ") || "No email or phone yet"}
        actions={
          <>
            {conv ? (
              <Button variant="outline" asChild>
                <Link href={`/app/w/${wid}/inbox?c=${conv.id}`}>
                  <MessageCircleIcon data-icon="inline-start" /> Open conversation
                </Link>
              </Button>
            ) : null}
            <form action={scoreContactAction.bind(null, wid, contactId)}>
              <SubmitButton variant="outline" pendingText="Scoring…">
                Re-score lead
              </SubmitButton>
            </form>
          </>
        }
      />
      <Flash searchParams={await searchParams} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Lead score" action={<TempBadge t={c.temperature} />}>
            <div className="flex flex-col gap-1">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {c.score}
                <span className="text-base font-normal text-muted-foreground">/100</span>
              </span>
              <span className="text-sm text-muted-foreground">{c.scoreReason || "Not scored yet."}</span>
            </div>
            <form action={setStageAction.bind(null, wid, contactId)} className="flex flex-wrap items-center gap-3 border-t pt-3">
              <Label htmlFor="stage">Pipeline stage</Label>
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
          </Panel>

          <Panel title="Message with AI" sub="Draft a Skool DM for where they are now. You send it yourself.">
            <SkoolAssist wid={wid} contactId={contactId} defaultIntent={defaultIntent} skoolUrl={workspace.settings.skoolUrl} />
          </Panel>

          <Panel title="Tags">
            <div className="flex flex-wrap items-center gap-1.5">
              {c.tags.length === 0 ? <span className="text-sm text-muted-foreground">No tags yet.</span> : null}
              {c.tags.map((t) => (
                <form key={t} action={removeTagAction.bind(null, wid, contactId, t)}>
                  <Badge variant="secondary" asChild>
                    <button type="submit" title="Remove tag" aria-label={`Remove tag ${t}`} className="cursor-pointer hover:bg-destructive/10 hover:text-destructive">
                      {t}
                      <XIcon data-icon="inline-end" />
                    </button>
                  </Badge>
                </form>
              ))}
            </div>
            <form action={addTagAction.bind(null, wid, contactId)} className="flex items-center gap-2">
              <Input name="tag" placeholder="Add a tag" required aria-label="New tag" className="max-w-56" />
              <SubmitButton variant="outline">Add</SubmitButton>
            </form>
          </Panel>

          <form action={saveContactAction.bind(null, wid, contactId)}>
            <Panel title="Details" action={<SubmitButton size="sm">Save</SubmitButton>}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="firstName">First name</FieldLabel>
                  <Input id="firstName" name="firstName" defaultValue={c.firstName} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                  <Input id="lastName" name="lastName" defaultValue={c.lastName} />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="phone">Phone</FieldLabel>
                  <Input id="phone" name="phone" defaultValue={c.phone ?? ""} />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="notes">Notes</FieldLabel>
                  <Textarea id="notes" name="notes" defaultValue={c.notes} className="min-h-24" />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                Source: <span className="capitalize">{c.source.replace("_", " ")}</span> · Added {c.createdAt.toDateString()}
                {c.unsubscribed ? " · Unsubscribed from email" : ""}
              </p>
            </Panel>
          </form>
        </div>

        <Panel title="Timeline" className="min-w-0">
          {timeline.length === 0 ? (
            <Empty icon={HistoryIcon} title="Nothing yet" />
          ) : (
            <ol className="flex flex-col">
              {timeline.map((a) => (
                <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                  <span className="relative mt-1.5 flex flex-col items-center">
                    <span className="size-2 rounded-full bg-primary" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{LABELS[a.type] ?? a.type}</div>
                    <div className="text-xs break-words text-muted-foreground">{detail(a.type, a.data)}</div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(a.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}
