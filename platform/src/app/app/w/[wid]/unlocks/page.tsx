import Link from "next/link";
import { FlagIcon, GiftIcon, HeartHandshakeIcon, LockOpenIcon, MessageCircleIcon, TrophyIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { claimCountSince, claimUrlFor, engagedContactCount, engagementLeaders, listUnlocks, recentClaims, unlockPostText, type Unlock } from "@/server/unlocks";
import { createUnlockAction, toggleUnlockAction, updateUnlockAction } from "@/actions/unlocks";
import { relativeTime } from "@/lib/util";
import { Callout, Empty, Flash, PageHead, Panel, Stat } from "@/components/ui";
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

  return (
    <>
      <PageHead
        eyebrow="Engagement"
        title="Unlocks"
        sub="Reward people for posting and commenting in your Skool community. Skool ranks communities on engagement, so every comment you earn helps you climb, and engaged members stay longer."
      />
      <Flash searchParams={await searchParams} />

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat icon={LockOpenIcon} label="Live unlocks" value={live} />
        <Stat icon={MessageCircleIcon} label="Claims, 30 days" value={month} hint="Each one is a post or comment" />
        <Stat icon={HeartHandshakeIcon} label="Engaged members" value={engaged} hint="Tagged “engaged”" />
        <Stat icon={FlagIcon} label="To spot-check" value={flagged} hint={flagged ? "See flagged claims below" : "All clear"} />
      </div>

      {!workspace.settings.skoolUrl ? (
        <Callout tone="warn">
          Add your Skool group link in <Link href={`${base}/settings#business`}>Settings</Link>, so claims only count when the post is in your community.
        </Callout>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
        {canEdit ? (
          <form action={createUnlockAction.bind(null, wid)}>
            <Panel title="New unlock" sub="Something small and genuinely useful, in return for one post or comment." action={<SubmitButton size="sm">Create unlock</SubmitButton>}>
              <div className="flex flex-col gap-4">
                <UnlockFields />
                <SubmitButton className="self-start" pendingText="Creating…">
                  Create unlock
                </SubmitButton>
              </div>
            </Panel>
          </form>
        ) : null}

        <Panel title="How it works" sub="No Skool login, no scraping. Members paste the link to their own post.">
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            <li>Create an unlock here. You get a claim page and a ready-made Skool post.</li>
            <li>Publish the post in your community and pin it.</li>
            <li>Members comment or post, paste the link on the claim page, and get the reward at once.</li>
            <li>They&apos;re tagged <code>engaged</code> in your CRM, so an automation can welcome them, and you see who your most active members are.</li>
          </ol>
          <Callout tone="info" title="Stack it with Skool's member levels (points)">
            Members earn 1 point for every like their posts and comments get. Member level 2 needs 5 points, level 3 needs 20. Set a bonus course to unlock at level 2. Like every intro post within 24 hours, and ask members to like and reply to new intros. About 5 likes opens the course by itself.
          </Callout>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Ideas that get comments</span>
            <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              {IDEAS.map((i) => (
                <li key={i.title}>
                  <b className="text-foreground">{i.title}</b>: {i.instructions}
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>

      <Panel title="Your unlocks">
        {list.length === 0 ? (
          <Empty icon={GiftIcon} title="No unlocks yet" body="Create your first one above. Small and useful beats big and vague." />
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map(({ unlock: u, claims: n, flagged: f }) => {
              const url = claimUrlFor(u.slug);
              return (
                <li key={u.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{u.title}</span>
                      <Badge variant={u.active ? "secondary" : "outline"} className={u.active ? "bg-success-soft text-success" : undefined}>{u.active ? "Live" : "Paused"}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {n} claim{n === 1 ? "" : "s"}
                        {f ? ` · ${f} flagged` : ""} · {u.action === "comment" ? "comment" : "post"}
                      </span>
                    </div>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{url}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CopyButton text={unlockPostText(u)} label="Copy Skool post" />
                    <CopyButton text={url} label="Copy link" />
                    {canEdit ? (
                      <form action={toggleUnlockAction.bind(null, wid, u.id, !u.active)}>
                        <SubmitButton variant="ghost" size="sm">{u.active ? "Pause" : "Resume"}</SubmitButton>
                      </form>
                    ) : null}
                  </div>
                  {canEdit ? (
                  <details className="w-full sm:basis-full">
                    <summary className="cursor-pointer text-sm font-medium text-primary">Edit</summary>
                    <form action={updateUnlockAction.bind(null, wid, u.id)} className="mt-3 flex flex-col gap-4">
                      <UnlockFields u={u} />
                      <p className="text-xs text-muted-foreground">The claim link stays the same, so your pinned Skool post keeps working.</p>
                      <SubmitButton size="sm" className="self-start">Save changes</SubmitButton>
                    </form>
                  </details>
                  ) : u.zapierWebhookUrl ? (
                    <span className="text-xs text-muted-foreground">Zapier: connected</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Recent claims" sub="Spot-check the flagged ones: open the link and make sure the post is real.">
          {claims.length === 0 ? (
            <Empty icon={MessageCircleIcon} title="No claims yet" body="They show up here the moment someone unlocks something." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Unlock</TableHead>
                  <TableHead>Post</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map(({ claim: c, title }) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      {c.contactId ? (
                        <Link href={`${base}/leads/${c.contactId}`} className="block font-medium">{c.name || c.email}</Link>
                      ) : (
                        <span className="block font-medium">{c.name || c.email}</span>
                      )}
                      {c.flagged ? (
                        <Badge variant="outline" className="mt-1 border-warning/40 text-warning">
                          <FlagIcon data-icon="inline-start" /> {c.flagReason}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-40 truncate">{title}</TableCell>
                    <TableCell>
                      <a href={c.postUrl} target="_blank" rel="noreferrer" className="text-sm">Open</a>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{relativeTime(c.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
        <Panel title="Most engaged, 30 days" sub="Say thanks, feature them, ask them for a win story.">
          {leaders.length === 0 ? (
            <Empty icon={TrophyIcon} title="Nobody yet" body="Your first engaged members show up here." />
          ) : (
            <ol className="flex flex-col divide-y">
              {leaders.map((l, i) => (
                <li key={l.email} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium tabular-nums">{i + 1}</span>
                    {l.contactId ? <Link href={`${base}/leads/${l.contactId}`} className="truncate">{l.name || l.email}</Link> : <span className="truncate">{l.name || l.email}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{l.claims} unlock{l.claims === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}

/** The unlock form fields: empty for a new unlock, prefilled to edit one (ids stay unique per form). */
function UnlockFields({ u }: { u?: Unlock }) {
  const id = (name: string) => (u ? `${name}-${u.id}` : name);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor={id("title")}>What they unlock</FieldLabel>
        <Input id={id("title")} name="title" required maxLength={80} placeholder="The 7-day starter plan" defaultValue={u?.title} />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor={id("reward")}>One line about it</FieldLabel>
        <Input id={id("reward")} name="reward" maxLength={300} placeholder="The exact first week I give every new member." defaultValue={u?.reward} />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor={id("rewardUrl")}>Reward link</FieldLabel>
        <Input id={id("rewardUrl")} name="rewardUrl" type="url" placeholder="https://… (a Google Doc, a lesson, a download)" defaultValue={u?.rewardUrl} />
        <FieldDescription>Shown right after they claim, and emailed to them. Open it in a private window to check it works for someone who isn&apos;t you.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={id("action")}>They have to…</FieldLabel>
        <NativeSelect id={id("action")} name="action" defaultValue={u?.action ?? "comment"}>
          <NativeSelectOption value="comment">Comment on a post</NativeSelectOption>
          <NativeSelectOption value="post">Make their own post</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor={id("skoolPostUrl")}>Where to engage (Skool link, optional)</FieldLabel>
        <Input id={id("skoolPostUrl")} name="skoolPostUrl" type="url" placeholder="https://www.skool.com/your-group/…" defaultValue={u?.skoolPostUrl} />
        <FieldDescription>The post they comment on, or the category they post in. Members get an Open button for it.</FieldDescription>
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor={id("instructions")}>What to write</FieldLabel>
        <Textarea id={id("instructions")} name="instructions" rows={2} maxLength={600} placeholder="Comment your #1 goal for this month, and reply to one other person." defaultValue={u?.instructions} />
        <FieldDescription>Make it easy to answer in under 2 minutes. Asking them to reply to someone else doubles the comments.</FieldDescription>
      </Field>
      <Field className="sm:col-span-2">
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
    </div>
  );
}
