import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightLeftIcon,
  CalendarClockIcon,
  FlameIcon,
  GiftIcon,
  GraduationCapIcon,
  HistoryIcon,
  MailIcon,
  MailXIcon,
  MessageCircleIcon,
  SendIcon,
  SquareKanbanIcon,
  TagIcon,
  UploadIcon,
  UserIcon,
  UserPlusIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { contactName, contactTimeline, getContact } from "@/server/contacts";
import { latestConversationFor } from "@/server/inbox";
import { addTagAction, removeTagAction, saveContactAction, scoreContactAction, setStageAction } from "@/actions/crm";
import { relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Empty, Flash, Panel, TempBadge, type Tone } from "@/components/ui";
import { Avatar, Kicker, StageChip } from "@/components/crm-ui";
import { AutoSubmitSelect, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContactDeals, crmTimelineDetail } from "@/components/contact-deals";

const LABELS: Record<string, string> = {
  lead: "Opted in",
  email_sent: "Email sent",
  message_in: "Messaged you",
  message_out: "You replied",
  tag_added: "Tag added",
  stage_changed: "Stage changed",
  // From the Skool member sync, which was removed: kept so older timelines still read well.
  skool_joined: "Joined your Skool group",
  skool_trial: "Started a Skool trial",
  skool_converted: "Trial converted to paid 🎉",
  skool_churned: "Left your Skool group",
  temperature_changed: "Temperature changed",
  unsubscribed: "Unsubscribed",
  skool_engaged: "Posted in Skool for an unlock",
  imported: "Imported",
  opportunity_created: "Opportunity added",
  opportunity_moved: "Opportunity moved",
  booking_created: "Booked a call",
  booking_rescheduled: "Moved their call",
  booking_cancelled: "Cancelled their call",
  booking_no_show: "Didn't show up",
  booking_reminder: "Call reminder sent",
};

/** A small picture per kind of event, so the timeline scans at a glance. */
const ART: Record<string, { icon: LucideIcon; tone: Tone }> = {
  lead: { icon: UserPlusIcon, tone: "primary" },
  email_sent: { icon: MailIcon, tone: "muted" },
  message_in: { icon: MessageCircleIcon, tone: "primary" },
  message_out: { icon: SendIcon, tone: "muted" },
  tag_added: { icon: TagIcon, tone: "gold" },
  stage_changed: { icon: ArrowRightLeftIcon, tone: "muted" },
  skool_joined: { icon: GraduationCapIcon, tone: "success" },
  skool_trial: { icon: GraduationCapIcon, tone: "gold" },
  skool_converted: { icon: GraduationCapIcon, tone: "success" },
  skool_churned: { icon: GraduationCapIcon, tone: "muted" },
  temperature_changed: { icon: FlameIcon, tone: "hot" },
  unsubscribed: { icon: MailXIcon, tone: "warning" },
  skool_engaged: { icon: GiftIcon, tone: "gold" },
  imported: { icon: UploadIcon, tone: "muted" },
  opportunity_created: { icon: SquareKanbanIcon, tone: "primary" },
  opportunity_moved: { icon: SquareKanbanIcon, tone: "primary" },
  booking_created: { icon: CalendarClockIcon, tone: "success" },
  booking_rescheduled: { icon: CalendarClockIcon, tone: "primary" },
  booking_cancelled: { icon: CalendarClockIcon, tone: "muted" },
  booking_no_show: { icon: CalendarClockIcon, tone: "warning" },
  booking_reminder: { icon: CalendarClockIcon, tone: "muted" },
};
const DOT: Record<Tone, string> = {
  primary: "bg-accent text-primary dark:text-violet-300",
  pink: "bg-cta-soft text-cta-soft-foreground",
  success: "bg-success-soft text-success",
  gold: "bg-gold-soft text-gold-foreground",
  hot: "bg-hot-soft text-hot",
  warning: "bg-warning-soft text-warning",
  muted: "bg-muted text-muted-foreground",
};

function detail(type: string, data: Record<string, unknown>): string {
  if (type === "lead") return String(data.page ?? "");
  if (type === "email_sent") return String(data.subject ?? "");
  if (type === "message_in") return `${data.channel}: ${data.preview ?? ""}`;
  if (type === "tag_added") return String(data.tag ?? "");
  if (type === "stage_changed") return String(data.stage ?? "");
  if (type === "temperature_changed") return `${data.temperature} (${data.score}) · ${data.reason ?? ""}`;
  if (type === "skool_engaged") return String(data.unlock ?? "");
  return crmTimelineDetail(type, data) ?? "";
}

export default async function ContactPage({ params, searchParams }: { params: Promise<{ wid: string; contactId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid, contactId } = await params;
  await requireWorkspace(wid);
  const c = await getContact(wid, contactId);
  if (!c) notFound();
  const [timeline, conv] = await Promise.all([contactTimeline(wid, contactId), latestConversationFor(wid, contactId)]);
  const bar = c.temperature === "hot" ? "bg-hot" : c.temperature === "warm" ? "bg-gold" : "bg-mist-400 dark:bg-white/25";
  const name = contactName(c);
  const reach = [c.email, c.phone].filter(Boolean).join(" · ");
  return (
    <>
      {/* A record header: who they are, how to reach them, and the two things you can do from here. */}
      <header className="flex flex-col gap-5">
        <Link href={`/app/w/${wid}/leads`} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground no-underline hover:text-foreground hover:no-underline">
          <ArrowLeftIcon className="size-3.5" aria-hidden /> All leads
        </Link>
        <div className="flex flex-col gap-5 @2xl/main:flex-row @2xl/main:items-end @2xl/main:justify-between">
          <div className="flex min-w-0 items-center gap-4 md:gap-5">
            <Avatar name={name} size="xl" className="md:size-[72px] md:text-xl" />
            <div className="grid min-w-0 gap-1.5">
              <h1 className="truncate text-[36px] leading-[1.02] tracking-[-0.012em] text-foreground md:text-[46px]">{name}</h1>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <TempBadge t={c.temperature} />
                <StageChip stage={c.stage} />
                <span className="truncate text-sm text-muted-foreground">{reach || "No email or phone yet"}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        </div>
        <p className="flex w-fit max-w-full items-start gap-3 rounded-2xl bg-card py-2.5 pr-4 pl-2.5 text-sm leading-snug shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-press">
            <ArrowDownIcon className="size-3.5" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="min-w-0 pt-[3px]">
            <b className="font-semibold text-foreground">Do this first:</b> <span className="text-foreground/85">Read their timeline, then follow up while they&apos;re warm.</span>
          </span>
        </p>
      </header>
      <Flash searchParams={await searchParams} />

      {/* How warm they are, and where they are in your pipeline, at a glance. */}
      <Card className="gap-0 py-0">
        <CardContent className="grid gap-6 py-6 @2xl/main:grid-cols-[minmax(0,1fr)_auto] @2xl/main:items-center">
          <div className="flex min-w-0 flex-col gap-3">
            <Kicker>Lead score</Kicker>
            <div className="flex items-end gap-3">
              <span className="font-display text-[52px] leading-[0.85] tracking-[-0.02em] tabular-nums">{c.score}</span>
              <span className="pb-0.5 text-sm text-subtle-foreground tabular-nums">/ 100</span>
            </div>
            <div className="h-1.5 max-w-md overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.max(3, Math.min(100, c.score))}%` }} />
            </div>
            <span className="max-w-[62ch] text-sm leading-relaxed text-muted-foreground">{c.scoreReason || "Not scored yet. Press Re-score lead and AI reads everything they've done."}</span>
          </div>
          <form action={setStageAction.bind(null, wid, contactId)} className="flex flex-col gap-2 @2xl/main:min-w-52">
            <Label htmlFor="stage" className="text-[11.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Lead stage
            </Label>
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
            <span className="text-xs text-subtle-foreground">Saves as soon as you pick.</span>
          </form>
        </CardContent>
        <dl className="grid grid-cols-2 border-t border-border/80 @2xl/main:grid-cols-4">
          {[
            ["Source", <span key="s" className="capitalize">{c.source.replace("_", " ")}</span>],
            ["Added", c.createdAt.toDateString().replace(/^\w+ /, "")],
            ["Last activity", relativeTime(c.lastActivityAt ?? timeline[0]?.createdAt ?? null)],
            ["Email", c.unsubscribed ? "Unsubscribed" : c.email ? "Subscribed" : "No email"],
          ].map(([k, v], i) => (
            <div key={String(k)} className={cn("flex flex-col gap-1 px-6 py-4", i % 2 === 1 && "border-l border-border/80", i >= 2 && "border-t border-border/80 @2xl/main:border-t-0", i === 2 && "@2xl/main:border-l")}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="truncate text-sm font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid items-start gap-6 @3xl/main:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Panel icon={HistoryIcon} tone="primary" title="Timeline" sub="Everything they've done, newest first." className="min-w-0">
          {timeline.length === 0 ? (
            <Empty icon={HistoryIcon} tone="muted" title="Nothing yet" body="Opt-ins, emails and messages show up here as they happen." className="py-8" />
          ) : (
            <ol className="relative flex flex-col">
              {timeline.map((a, i) => {
                const art = ART[a.type] ?? { icon: HistoryIcon, tone: "muted" as const };
                const d = detail(a.type, a.data);
                return (
                  <li key={a.id} className="relative flex gap-3.5 pb-5 last:pb-0">
                    {i < timeline.length - 1 ? <span aria-hidden className="absolute top-8 bottom-1 left-[13.5px] w-px bg-border" /> : null}
                    <span aria-hidden className={cn("relative grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-card", DOT[art.tone])}>
                      <art.icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium">{LABELS[a.type] ?? a.type}</span>
                        <span className="shrink-0 text-xs text-subtle-foreground tabular-nums">{relativeTime(a.createdAt)}</span>
                      </div>
                      {d ? <div className="mt-0.5 text-[13px] leading-relaxed break-words text-muted-foreground">{d}</div> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-6">
          <ContactDeals wid={wid} contactId={contactId} />
          <Panel icon={TagIcon} tone="gold" title="Tags" sub="Little labels for sorting, like vip or from-instagram.">
            <div className="flex flex-wrap items-center gap-1.5">
              {c.tags.length === 0 ? <span className="text-sm text-muted-foreground">No tags yet.</span> : null}
              {c.tags.map((t) => (
                <form key={t} action={removeTagAction.bind(null, wid, contactId, t)}>
                  <Badge variant="outline" asChild>
                    <button type="submit" title="Remove tag" aria-label={`Remove tag ${t}`} className="h-6 cursor-pointer hover:border-destructive/30 hover:bg-destructive-soft hover:text-destructive">
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
            <Panel icon={UserIcon} tone="muted" title="Details" sub="Notes are just for you." action={<SubmitButton size="sm">Save</SubmitButton>}>
              <div className="grid gap-4 @xl/main:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="firstName">First name</FieldLabel>
                  <Input id="firstName" name="firstName" defaultValue={c.firstName} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                  <Input id="lastName" name="lastName" defaultValue={c.lastName} />
                </Field>
                <Field className="@xl/main:col-span-2">
                  <FieldLabel htmlFor="phone">Phone</FieldLabel>
                  <Input id="phone" name="phone" defaultValue={c.phone ?? ""} />
                </Field>
                <Field className="@xl/main:col-span-2">
                  <FieldLabel htmlFor="notes">Notes</FieldLabel>
                  <Textarea id="notes" name="notes" defaultValue={c.notes} className="min-h-28" placeholder="Their goal, what they said on the call, their dog's name…" />
                </Field>
              </div>
              <p className="text-xs text-subtle-foreground">
                Source: <span className="capitalize">{c.source.replace("_", " ")}</span> · Added {c.createdAt.toDateString()}
                {c.unsubscribed ? " · Unsubscribed from email" : ""}
              </p>
            </Panel>
          </form>
        </div>
      </div>
    </>
  );
}
