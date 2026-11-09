import Link from "next/link";
import { ExternalLinkIcon, FlagIcon, GiftIcon, HeartHandshakeIcon, LightbulbIcon, LinkIcon, LockOpenIcon, MessageCircleIcon, PencilIcon, PlusIcon, TrophyIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { claimCountSince, claimUrlFor, engagedContactCount, engagementLeaders, listUnlocks, recentClaims, unlockPostText, type Unlock } from "@/server/unlocks";
import { createUnlockAction, toggleUnlockAction, updateUnlockAction } from "@/actions/unlocks";
import { relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Callout, Empty, Flash, IconTile, MoreOptions, PageHead, Panel, Stat, StepDot } from "@/components/ui";
import { Avatar, EdgeTable, QuietEmpty } from "@/components/crm-ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export const metadata = { title: "Unlocks" };

const IDEAS = [
  { title: "The 7-day starter plan", action: "comment", instructions: "Comment your #1 goal for this month." },
  { title: "My swipe file", action: "post", instructions: "Post your first win (big or tiny) in the Wins category." },
  { title: "Lesson 1, early", action: "post", instructions: "Introduce yourself: who you are, what you want, one fun fact." },
];

const HOW = [
  "Create an unlock here. You get a claim page and a ready-made Skool post.",
  "Publish the post in your community and pin it.",
  "Members comment or post, paste the link on the claim page, and get the reward at once.",
  "They're tagged engaged in your CRM, so an automation can welcome them, and you see who your most active members are.",
];

export default async function UnlocksPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace, role } = await requireWorkspace(wid);
  // Creating and editing unlocks is for owners and admins (the Zapier link is a secret).
  const canEdit = role === "owner" || role === "admin";
  const [list, claims, leaders, engaged, month] = await Promise.all([
    listUnlocks(wid),
    recentClaims(wid, 25),
    engagementLeaders(wid, 30, 8),
    engagedContactCount(wid),
    claimCountSince(wid, 30),
  ]);
  const live = list.filter((u) => u.unlock.active).length;
  const flagged = list.reduce((n, u) => n + u.flagged, 0);
  const base = `/app/w/${wid}`;
  const first = list.length === 0;

  const createForm = canEdit ? (
    <form data-guide="unlock-create" action={createUnlockAction.bind(null, wid)} className="flex flex-col gap-5">
      <UnlockFields />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant={first ? "cta" : "default"} size={first ? "lg" : "default"} pendingText="Creating…">
          <GiftIcon data-icon="inline-start" />
          Create unlock
        </SubmitButton>
        <span className="text-xs text-muted-foreground">You get a claim page and a Skool post to copy.</span>
      </div>
    </form>
  ) : null;

  return (
    <>
      <PageHead
        lesson="5.2"
        stage="Talk"
        eyebrow="Engagement"
        title="Unlocks"
        sub="Give members a small reward for posting or commenting in your Skool group. Skool ranks groups on engagement, and members who talk stay longer."
        first={first && canEdit ? "Create your first unlock below. Small and useful beats big and vague." : undefined}
      />
      <Flash searchParams={await searchParams} />

      {!workspace.settings.skoolUrl ? (
        <Callout tone="warn">
          Add your Skool group link in <Link href={`${base}/settings#business`}>Settings</Link>, so claims only count when the post is in your community.
        </Callout>
      ) : null}

      {first ? (
        <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          {createForm ? (
            <Panel step={1} title="Create your first unlock" sub="Something small and genuinely useful, in return for one post or comment." className="ring-violet-200/90 dark:ring-violet-400/20">
              {createForm}
            </Panel>
          ) : (
            <Empty icon={GiftIcon} tone="gold" title="No unlocks yet" body="Ask the account owner or an admin to create the first one." />
          )}
          <HowItWorks />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 @2xl/main:grid-cols-4">
            <Stat icon={LockOpenIcon} tone="gold" label="Live unlocks" value={live} />
            <Stat icon={MessageCircleIcon} label="Claims, 30 days" value={month} hint="Each one is a post or comment" />
            <Stat icon={HeartHandshakeIcon} tone="success" label="Engaged members" value={engaged} hint="Tagged “engaged”" />
            <Stat icon={FlagIcon} tone={flagged ? "warning" : "muted"} label="To spot-check" value={flagged} hint={flagged ? "See flagged claims below" : "All clear"} />
          </div>

          <Panel icon={GiftIcon} tone="gold" title="Your unlocks" sub="Copy the Skool post, publish it in your group and pin it. Members do the rest.">
            <ul className="-mx-6 -mb-6 flex flex-col divide-y divide-border/80 border-t border-border/80">
              {list.map(({ unlock: u, claims: n, flagged: f }) => {
                const url = claimUrlFor(u.slug);
                return (
                  <li key={u.id} className={cn("flex flex-col gap-4 px-6 py-5", !u.active && "bg-muted/30")}>
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                      <div className="flex min-w-0 flex-1 basis-64 items-start gap-3.5">
                        <IconTile icon={GiftIcon} tone={u.active ? "gold" : "muted"} className="size-10 rounded-xl" />
                        <div className="grid min-w-0 gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[15px] font-semibold tracking-[-0.01em]">{u.title}</span>
                            <Badge variant={u.active ? "success" : "secondary"}>{u.active ? "Live" : "Paused"}</Badge>
                          </div>
                          <span className="text-[13px] text-muted-foreground">
                            <span className="font-medium text-foreground tabular-nums">{n}</span> claim{n === 1 ? "" : "s"}
                            {f ? <span className="text-warning"> · {f} flagged</span> : ""} · for a {u.action === "comment" ? "comment" : "post"}
                          </span>
                        </div>
                      </div>
                      {canEdit ? (
                        <form action={toggleUnlockAction.bind(null, wid, u.id, !u.active)}>
                          <SubmitButton variant="ghost" size="sm">
                            {u.active ? "Pause" : "Resume"}
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-2 pl-3.5 ring-1 ring-ink/[0.03] ring-inset dark:ring-white/[0.04]">
                      <LinkIcon className="size-3.5 shrink-0 text-subtle-foreground" aria-hidden />
                      <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 basis-40 truncate font-mono text-xs text-muted-foreground hover:text-primary">
                        {url}
                      </a>
                      <div className="flex flex-wrap gap-2">
                        <CopyButton text={url} label="Copy link" className="bg-card" />
                        <CopyButton text={unlockPostText(u)} label="Copy Skool post" className="bg-card" />
                      </div>
                    </div>
                    {canEdit ? (
                      <details className="group/edit">
                        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-primary dark:text-violet-300 [&::-webkit-details-marker]:hidden">
                          <PencilIcon className="size-3.5" aria-hidden /> Edit
                        </summary>
                        <form action={updateUnlockAction.bind(null, wid, u.id)} className="mt-4 flex flex-col gap-4 border-t border-border/80 pt-4">
                          <UnlockFields u={u} />
                          <p className="text-xs text-muted-foreground">The claim link stays the same, so your pinned Skool post keeps working.</p>
                          <SubmitButton size="sm" className="self-start">
                            Save changes
                          </SubmitButton>
                        </form>
                      </details>
                    ) : u.zapierWebhookUrl ? (
                      <span className="text-xs text-muted-foreground">Zapier: connected</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Panel>

          <div className="grid items-start gap-6 @4xl/main:grid-cols-[1.4fr_1fr]">
            <Panel icon={MessageCircleIcon} title="Recent claims" sub="Spot-check the flagged ones: open the link and make sure the post is real.">
              {claims.length === 0 ? (
                <QuietEmpty icon={MessageCircleIcon} tone="primary" title="No claims yet" body="Pin your Skool post. Claims show up here the moment someone unlocks something." />
              ) : (
                <EdgeTable>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Member</TableHead>
                        <TableHead className="hidden @xl/main:table-cell">Unlock</TableHead>
                        <TableHead>Post</TableHead>
                        <TableHead className="text-right">When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {claims.map(({ claim: c, title }) => {
                        const who = c.name || c.email;
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="py-2.5">
                              <div className="flex min-w-0 items-center gap-3">
                                <Avatar name={who} size="sm" />
                                <div className="grid min-w-0 gap-1 leading-tight">
                                  {c.contactId ? (
                                    <Link href={`${base}/leads/${c.contactId}`} className="truncate font-medium text-foreground no-underline hover:text-primary hover:no-underline">
                                      {who}
                                    </Link>
                                  ) : (
                                    <span className="truncate font-medium">{who}</span>
                                  )}
                                  {c.flagged ? (
                                    <Badge variant="warning" className="w-fit">
                                      <FlagIcon data-icon="inline-start" /> {c.flagReason}
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden max-w-40 truncate text-muted-foreground @xl/main:table-cell">{title}</TableCell>
                            <TableCell>
                              <a href={c.postUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium">
                                Open <ExternalLinkIcon className="size-3" aria-hidden />
                              </a>
                            </TableCell>
                            <TableCell className="text-right text-[13px] text-subtle-foreground">{relativeTime(c.createdAt)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </EdgeTable>
              )}
            </Panel>
            <Panel icon={TrophyIcon} tone="gold" title="Most engaged, 30 days" sub="Say thanks, feature them, ask them for a win story.">
              {leaders.length === 0 ? (
                <QuietEmpty icon={TrophyIcon} tone="gold" title="Nobody yet" body="Your first engaged members show up here." />
              ) : (
                <ol className="-mx-6 -mb-6 flex flex-col divide-y divide-border/80 border-t border-border/80">
                  {leaders.map((l, i) => {
                    const who = l.name || l.email;
                    return (
                      <li key={l.email} className="flex items-center justify-between gap-3 px-6 py-3">
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              "grid size-6 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold tabular-nums",
                              i === 0 ? "bg-gold-soft text-gold-foreground ring-1 ring-gold/50" : "text-subtle-foreground",
                            )}
                          >
                            {i + 1}
                          </span>
                          <Avatar name={who} size="sm" />
                          {l.contactId ? (
                            <Link href={`${base}/leads/${l.contactId}`} className="truncate text-sm font-medium text-foreground no-underline hover:text-primary hover:no-underline">
                              {who}
                            </Link>
                          ) : (
                            <span className="truncate text-sm font-medium">{who}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-subtle-foreground tabular-nums">
                          {l.claims} unlock{l.claims === 1 ? "" : "s"}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>
          </div>

          {createForm ? (
            <MoreOptions icon={PlusIcon} title="New unlock" sub="One small reward per week keeps the comments coming.">
              {createForm}
            </MoreOptions>
          ) : null}
          <HowItWorks compact />
        </>
      )}
    </>
  );
}

/** The four steps and some ideas. Open by default for a first unlock, tucked away after that. */
function HowItWorks({ compact }: { compact?: boolean }) {
  const body = (
    <>
      <ol className="flex flex-col gap-3.5">
        {HOW.map((step, i) => (
          <li key={step} className="flex items-start gap-3 text-sm leading-relaxed">
            <StepDot n={i + 1} className="size-6 text-xs" />
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <LightbulbIcon className="size-4 text-gold-foreground" aria-hidden /> Ideas that get comments
        </span>
        <ul className="flex flex-col gap-2">
          {IDEAS.map((i) => (
            <li key={i.title} className="rounded-xl bg-muted/50 px-3.5 py-2.5 text-sm ring-1 ring-ink/[0.03] ring-inset dark:ring-white/[0.04]">
              <span className="font-medium">{i.title}</span>
              <span className="block text-muted-foreground">
                {i.action === "comment" ? "For a comment: " : "For a post: "}
                {i.instructions}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Callout tone="tip" title="Stack it with Skool's member levels (points)">
        Members earn 1 point for every like their posts and comments get. Member level 2 needs 5 points, level 3 needs 20. Set a bonus course to unlock at level 2. Like every intro post within 24 hours, and ask members to like and reply to new intros. About 5 likes opens the course by itself.
      </Callout>
    </>
  );
  if (compact) {
    return (
      <MoreOptions icon={LightbulbIcon} title="How it works, and ideas" sub="No Skool login, no scraping. Members paste the link to their own post.">
        {body}
      </MoreOptions>
    );
  }
  return (
    <Panel icon={LightbulbIcon} tone="gold" title="How it works" sub="No Skool login, no scraping. Members paste the link to their own post.">
      {body}
    </Panel>
  );
}

/** The unlock form fields: empty for a new unlock, prefilled to edit one (ids stay unique per form). */
function UnlockFields({ u }: { u?: Unlock }) {
  const id = (name: string) => (u ? `${name}-${u.id}` : name);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 @2xl/main:grid-cols-2">
        <Field className="@2xl/main:col-span-2">
          <FieldLabel htmlFor={id("title")}>What they unlock</FieldLabel>
          <Input id={id("title")} name="title" required maxLength={80} placeholder="The 7-day starter plan" defaultValue={u?.title} />
        </Field>
        <Field className="@2xl/main:col-span-2">
          <FieldLabel htmlFor={id("reward")}>One line about it</FieldLabel>
          <Input id={id("reward")} name="reward" maxLength={300} placeholder="The exact first week I give every new member." defaultValue={u?.reward} />
        </Field>
        <Field className="@2xl/main:col-span-2">
          <FieldLabel htmlFor={id("rewardUrl")}>Reward link</FieldLabel>
          <Input id={id("rewardUrl")} name="rewardUrl" type="url" placeholder="https://… (a Google Doc, a lesson, a download)" defaultValue={u?.rewardUrl} />
          <FieldDescription>Shown right after they claim, and emailed to them. Open it in a private window to check it works for someone who isn&apos;t you.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={id("action")}>They have to…</FieldLabel>
          <NativeSelect id={id("action")} name="action" defaultValue={u?.action ?? "comment"} className="w-full">
            <NativeSelectOption value="comment">Comment on a post</NativeSelectOption>
            <NativeSelectOption value="post">Make their own post</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field className="@2xl/main:col-span-2">
          <FieldLabel htmlFor={id("instructions")}>What to write</FieldLabel>
          <Textarea id={id("instructions")} name="instructions" rows={2} maxLength={600} placeholder="Comment your #1 goal for this month, and reply to one other person." defaultValue={u?.instructions} />
          <FieldDescription>Make it easy to answer in under 2 minutes. Asking them to reply to someone else doubles the comments.</FieldDescription>
        </Field>
      </div>
      <MoreOptions title="More options" sub="Point them at a Skool post, and auto-unlock a Skool course (Zapier)." defaultOpen={Boolean(u?.skoolPostUrl || u?.zapierWebhookUrl)} className="bg-transparent">
        <Field>
          <FieldLabel htmlFor={id("skoolPostUrl")}>Where to engage (Skool link, optional)</FieldLabel>
          <Input id={id("skoolPostUrl")} name="skoolPostUrl" type="url" placeholder="https://www.skool.com/your-group/…" defaultValue={u?.skoolPostUrl} />
          <FieldDescription>The post they comment on, or the category they post in. Members get an Open button for it.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={id("zapierWebhookUrl")}>Also unlock a Skool course (optional, Skool Pro)</FieldLabel>
          {/* The saved link is never sent back to the browser: empty keeps it. */}
          <Input id={id("zapierWebhookUrl")} name="zapierWebhookUrl" type="url" placeholder={u?.zapierWebhookUrl ? "Connected. Leave empty to keep it, or paste a new one." : "https://hooks.zapier.com/…"} />
          <FieldDescription>A Zapier catch hook wired to Skool &ldquo;Unlock Course for Member&rdquo;. We send the member&apos;s email.</FieldDescription>
          {u?.zapierWebhookUrl ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="clearZapier" /> Disconnect Zapier
            </label>
          ) : null}
        </Field>
      </MoreOptions>
    </div>
  );
}
