import Link from "next/link";
import { FlagIcon, GiftIcon, HeartHandshakeIcon, LockOpenIcon, MessageCircleIcon, TrophyIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { claimUrlFor, engagedContactCount, engagementLeaders, listUnlocks, recentClaims, unlockPostText } from "@/server/unlocks";
import { createUnlockAction, toggleUnlockAction } from "@/actions/unlocks";
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
  const { workspace } = await requireWorkspace(wid);
  const [list, claims, leaders, engaged] = await Promise.all([listUnlocks(wid), recentClaims(wid, 25), engagementLeaders(wid, 30, 8), engagedContactCount(wid)]);
  const live = list.filter((u) => u.unlock.active).length;
  const flagged = list.reduce((n, u) => n + u.flagged, 0);
  const month = claims.filter((c) => Date.now() - c.claim.createdAt.getTime() < 30 * 86_400_000).length;
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
        <form action={createUnlockAction.bind(null, wid)}>
          <Panel title="New unlock" sub="Something small and genuinely useful, in return for one post or comment." action={<SubmitButton size="sm">Create unlock</SubmitButton>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="title">What they unlock</FieldLabel>
                <Input id="title" name="title" required maxLength={80} placeholder="The 7-day starter plan" />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="reward">One line about it</FieldLabel>
                <Input id="reward" name="reward" maxLength={300} placeholder="The exact first week I give every new member." />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="rewardUrl">Reward link</FieldLabel>
                <Input id="rewardUrl" name="rewardUrl" type="url" placeholder="https://… (a Google Doc, a lesson, a download)" />
                <FieldDescription>Shown right after they claim, and emailed to them.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="action">They have to…</FieldLabel>
                <NativeSelect id="action" name="action" defaultValue="comment">
                  <NativeSelectOption value="comment">Comment on a post</NativeSelectOption>
                  <NativeSelectOption value="post">Make their own post</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="skoolPostUrl">Where (Skool link)</FieldLabel>
                <Input id="skoolPostUrl" name="skoolPostUrl" type="url" placeholder="https://www.skool.com/your-group/…" />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="instructions">What to write</FieldLabel>
                <Textarea id="instructions" name="instructions" rows={2} maxLength={600} placeholder="Comment your #1 goal for this month, and reply to one other person." />
                <FieldDescription>Make it easy to answer in under 2 minutes. Asking them to reply to someone else doubles the comments.</FieldDescription>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="zapierWebhookUrl">Also unlock a Skool course (optional, Skool Pro)</FieldLabel>
                <Input id="zapierWebhookUrl" name="zapierWebhookUrl" type="url" placeholder="https://hooks.zapier.com/…" />
                <FieldDescription>A Zapier catch hook wired to Skool &ldquo;Unlock Course for Member&rdquo;. We send the member&apos;s email.</FieldDescription>
              </Field>
            </div>
          </Panel>
        </form>

        <Panel title="How it works" sub="No Skool login, no scraping. Members paste the link to their own post.">
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            <li>Create an unlock here. You get a claim page and a ready-made Skool post.</li>
            <li>Publish the post in your community and pin it.</li>
            <li>Members comment or post, paste the link on the claim page, and get the reward at once.</li>
            <li>They&apos;re tagged <code>engaged</code> in your CRM, so an automation can welcome them, and you see who your most active members are.</li>
          </ol>
          <Callout tone="info" title="Stack it with Skool's own levels">
            Every like a member gets is 1 point. Level 2 is 5 points, Level 3 is 20. Set a bonus course to &ldquo;Level unlock&rdquo;, like every intro within 24 hours, and the course opens by itself.
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
                <li key={u.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
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
                    <form action={toggleUnlockAction.bind(null, wid, u.id, !u.active)}>
                      <SubmitButton variant="ghost" size="sm">{u.active ? "Pause" : "Resume"}</SubmitButton>
                    </form>
                  </div>
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
