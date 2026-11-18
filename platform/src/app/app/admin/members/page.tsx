import { requirePlatformAdmin } from "@/server/auth";
import { lastRosterImport, listMemberAccess, memberStats } from "@/server/access";
import { firstEightDayMembers } from "@/server/admin";
import { grantMemberAction, revokeMemberAction } from "@/actions/admin";
import { approveCoursePostAction, resendCoursePostAction, saveCourseUnlocksAction, saveEntryTicketAction } from "@/actions/unlocks";
import { courseClaimStatus, courseGroup, courseUnlocksBlocker, getCourseUnlocks, listCourseClaims, missingCourseHooks } from "@/server/courseUnlocks";
import { getEntryTicket } from "@/server/unlocks";
import { getDb } from "@/lib/db";
import { unlocks, workspaceMembers, workspaces as workspacesTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { memberCheckoutConfigured } from "@/server/billing/stripe";
import { env } from "@/lib/env";
import { relativeTime } from "@/lib/util";
import { Callout, Empty, Flash, PageHead, Panel, Stat } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RosterUpload } from "./roster";
import { CheckIcon, CloudUploadIcon, ExternalLinkIcon, GraduationCapIcon, HandHelpingIcon, KeyRoundIcon, LockOpenIcon, RefreshCwIcon, ShoppingBagIcon, TicketIcon, UsersIcon, ZapIcon } from "lucide-react";
import { Avatar, EdgeTable } from "@/components/crm-ui";
import { SkoolInviteCard } from "@/components/skool-invite-card";
import { platformInviteHint } from "@/server/skoolInvite";
import { removePlatformInviteAction, savePlatformInviteAction, testPlatformInviteAction } from "@/actions/skoolInvite";

export const metadata = { title: "Members" };

const CHANNEL: Record<string, string> = { skool_zapier: "Skool · Zapier", skool_export: "Skool · export", stripe: "Bought on /join", admin: "Manual", welcome: "Welcome days (unconfirmed)" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const admin = await requirePlatformAdmin();
  const sp = await searchParams;
  const db = await getDb();
  const [ticket, myUnlocks] = await Promise.all([
    getEntryTicket(),
    db
      .select({ id: unlocks.id, title: unlocks.title, active: unlocks.active, workspace: workspacesTable.name })
      .from(unlocks)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, unlocks.workspaceId))
      .innerJoin(workspacesTable, eq(workspacesTable.id, unlocks.workspaceId))
      .where(eq(workspaceMembers.userId, admin.id)),
  ]);
  const [stats, last, rows, firstDays, course, courseClaims] = await Promise.all([memberStats(), lastRosterImport(), listMemberAccess({ q: sp.q }), firstEightDayMembers(), getCourseUnlocks(), listCourseClaims(100)]);
  const group = courseGroup();
  const blocker = courseUnlocksBlocker();
  const missingHooks = missingCourseHooks(course);
  const staleDays = last ? Math.floor((Date.now() - last.createdAt.getTime()) / 86_400_000) : null;
  const zapUrl = `${env.appUrl}/api/webhooks/skool?secret=${env.skoolWebhookSecret || "<SKOOL_WEBHOOK_SECRET>"}`;
  const now = Date.now();

  return (
    <>
      <PageHead
        eyebrow="Platform admin"
        title="Members"
        sub="Active members get the app. No codes. People come in from Skool (Zapier or your member export), from a purchase on /join, or a manual grant. When someone leaves, their account pauses after a 7-day grace and turns back on if they return."
      />
      <Flash searchParams={sp} />

      <div className="grid grid-cols-2 gap-4 @4xl/main:grid-cols-4">
        <Stat icon={UsersIcon} label="Active members" value={stats.total} />
        <Stat icon={GraduationCapIcon} tone="success" label="From Skool" value={(stats.byChannel.skool_export ?? 0) + (stats.byChannel.skool_zapier ?? 0)} hint={`${stats.byChannel.skool_zapier ?? 0} via Zapier`} />
        <Stat icon={ShoppingBagIcon} tone="gold" label="Bought on /join" value={stats.byChannel.stripe ?? 0} hint={memberCheckoutConfigured() ? "Stripe on" : "Set STRIPE_PRICE_MEMBER"} />
        <Stat icon={RefreshCwIcon} tone="muted" label="Last Skool sync" value={last ? relativeTime(last.createdAt) : "Never"} hint={last ? `${last.added} in · ${last.removed} out` : undefined} />
      </div>

      {staleDays === null || staleDays > 7 ? (
        <Callout tone="warn" title={staleDays === null ? "Upload your first Skool export" : `Your last Skool sync was ${staleDays} days ago`}>
          The export is the only safe way to learn who left Skool. Do it weekly. Members on the export stay active for 35 days, so a missed week never locks anyone out.
        </Callout>
      ) : null}

      {firstDays.length ? (
        <Panel icon={HandHelpingIcon} title="In their first 8 days" sub="App days, from sign-up, so not their Skool trial. Use this to help in public, in their thread. Never a DM, never a sale.">
          <EdgeTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>App day</TableHead>
                  {["Kit", "Funnel", "Statics", "Ad click", "Check-in"].map((h) => (
                    <TableHead key={h} className="text-center">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {firstDays.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="max-w-56 truncate">{m.owner ?? "No owner"}</TableCell>
                    <TableCell className="tabular-nums">{m.day}</TableCell>
                    {[m.kit, m.funnel, m.statics, m.adClick, m.checkin].map((yes, i) => (
                      <TableCell key={i} className="text-center">
                        {yes ? <CheckIcon className="mx-auto size-4 text-primary dark:text-violet-300" aria-label="Yes" /> : <span className="sr-only">No</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </EdgeTable>
        </Panel>
      ) : null}

      <Panel icon={CloudUploadIcon} title="Sync from Skool" sub="Skool › your group › Members › Export. Upload the full, unfiltered file. Everyone on it gets access. Anyone who dropped off is removed after you confirm.">
        <RosterUpload />
        <p className="text-xs text-muted-foreground">
          Tip: add the membership question “What email will you use for the app?”. Its answers are in the export, so members who use a different email still match.
        </p>
      </Panel>

      <form action={saveEntryTicketAction}>
        <Panel
          icon={TicketIcon}
          title="Entry ticket: post to get connected"
          sub="Ask new members to introduce themselves in your community before their app account opens. They post, paste the link, and they're in. Every new member becomes a post, and Skool ranks communities on engagement."
          action={<SubmitButton size="sm" variant="outline">Save</SubmitButton>}
        >
          {myUnlocks.length === 0 ? (
            <Callout tone="info">Create an unlock in your own workspace first (Unlocks › New unlock, action: “Make their own post”, e.g. “Introduce yourself”). Then pick it here.</Callout>
          ) : (
            <div className="grid gap-4 @2xl/main:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="unlockId">The intro unlock</FieldLabel>
                <NativeSelect id="unlockId" name="unlockId" defaultValue={ticket?.unlockId ?? ""} className="w-full">
                  <NativeSelectOption value="">Pick one…</NativeSelectOption>
                  {myUnlocks.map((u) => (
                    <NativeSelectOption key={u.id} value={u.id}>{u.title} · {u.workspace}{u.active ? "" : " (paused)"}</NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldDescription>Its instructions and Skool link are what new members see.</FieldDescription>
              </Field>
              <div className="flex flex-col gap-2.5 rounded-xl bg-muted/40 p-4 text-sm ring-1 ring-ink/[0.03] ring-inset dark:ring-white/[0.04]">
                <Label className="flex items-center gap-2.5 font-normal">
                  <input type="checkbox" name="on" defaultChecked={ticket?.enabled ?? false} /> Turn the entry ticket on
                </Label>
                <Label className="flex items-center gap-2.5 font-normal">
                  <input type="checkbox" name="everyone" defaultChecked={ticket ? new Date(ticket.since).getTime() === 0 : false} /> Also ask existing members who haven&apos;t posted yet
                </Label>
                <span className="text-xs text-muted-foreground">
                  {ticket?.on ? "On now." : ticket?.enabled ? "Waiting: its unlock can't be claimed right now (switched off, or its workspace is paused), so nobody is asked." : "Off now."} Admins and agency accounts never see it.
                </span>
              </div>
            </div>
          )}
        </Panel>
      </form>

      <form action={saveCourseUnlocksAction} id="course-unlocks" className="scroll-mt-20">
        <Panel
          icon={LockOpenIcon}
          tone="success"
          title="Course unlocks: post to open the next day"
          sub="Your 7-day course opens one day at a time, by posting. Each day ends with the member's post in that day's section. They paste its link in Your path, and that ticks their post, and fires the Zapier link below, which opens the next day's lesson in Skool and that day's bonus lesson. ReelVault and the app's tools are open from the start, so nothing in the app waits on a post. The app never signs in to Skool: members paste their own links."
          action={<SubmitButton size="sm" variant="outline">Save</SubmitButton>}
        >
          <div className="flex flex-col gap-5">
            <Label className="flex items-center gap-2.5 font-normal">
              <input type="checkbox" name="on" defaultChecked={course.on} /> Turn course unlocks on
            </Label>
            <span className="-mt-3 text-xs text-muted-foreground">
              {course.on ? "On now: each day's post is a pasted link that opens the next day in Skool." : "Off now: members tick their posts on their word."}{" "}
              {group ? `Links must be posts in skool.com/${group} (from SKOOL_GROUP_URL).` : null}
            </span>
            {blocker ? (
              <Callout tone="warn" title="Course unlocks can't go on yet">
                {blocker}
                {course.on ? " Until then members can't paste post links, so nothing opens." : ""}
              </Callout>
            ) : null}
            {missingHooks.length ? (
              <Callout tone="warn" title={`No Zapier link for Day ${missingHooks.join(", Day ")}`}>
                Course unlocks are on, so members finishing {missingHooks.length === 1 ? "that day" : "those days"} get nothing opened in Skool. Add the link below and press Save, then use Send again on their posts under Course post links.
              </Callout>
            ) : null}
            <ol className="flex list-decimal flex-col gap-1.5 rounded-xl bg-muted/40 py-4 pr-4 pl-9 text-[13px] leading-relaxed ring-1 ring-ink/[0.03] ring-inset dark:ring-white/[0.04]">
              <li>You need Skool&apos;s Pro plan: Zapier only works with Pro groups.</li>
              <li>In Skool › Classroom, set the Day 2 to Day 7 courses to Private (course settings › Access › Private). Skool can only unlock Private courses. Day 1 stays open.</li>
              <li>In Zapier, make one Zap per day. Trigger: Webhooks by Zapier › Catch Hook. Copy its URL into that day below.</li>
              <li>Press Save here, then paste a test post link for that day in your own Your path, so Zapier sees one sample: email, name, day and post_url.</li>
              <li>Action: Skool › Unlock Course for Member. Pick your group, pick the next day&apos;s course (the Day 1 link opens Day 2), and set Email to the hook&apos;s email. Add a second Unlock Course for Member step for that day&apos;s bonus lesson (Day 1: Steal the Hook, Day 2: Ten Posts From One Reel, Day 3: The Text That Gets a Reply, Day 4: The About Page Swipe, Day 5: Your Second Week), set to Private too. Turn the Zap on.</li>
              <li>Day 7&apos;s link is optional: point it at a bonus course, or leave it empty.</li>
            </ol>
            <div className="grid gap-4 @2xl/main:grid-cols-2">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <Field key={d}>
                  <FieldLabel htmlFor={`hook${d}`}>Day {d} Zapier link</FieldLabel>
                  <Input id={`hook${d}`} name={`hook${d}`} type="url" defaultValue={course.hooks[String(d)] ?? ""} placeholder="https://hooks.zapier.com/hooks/catch/…" className="font-mono text-xs" />
                  <FieldDescription>
                    Fires when a member finishes Day {d}.{" "}
                    {d < 7 ? `Point it at Skool › Unlock Course for Member for Day ${d + 1}.` : "Point it at a bonus course, or leave it empty."}
                  </FieldDescription>
                </Field>
              ))}
            </div>
          </div>
        </Panel>
      </form>

      <Panel icon={GraduationCapIcon} title="Course post links" sub="Every day's post link members pasted, for spot-checks. A flagged one (a link they already used, or someone else's post) fired nothing: look at it in Skool, then approve it if it's fine.">
        {courseClaims.length === 0 ? (
          <Empty icon={GraduationCapIcon} tone="muted" title="No post links yet" body="They show up here as members paste them in Your path." />
        ) : (
          <EdgeTable>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Member</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead className="hidden @2xl/main:table-cell">When</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courseClaims.map((c) => (
                  <TableRow key={`${c.workspaceId}-${c.day}`}>
                    <TableCell className="py-2.5">
                      <div className="grid min-w-0 leading-tight">
                        <span className="max-w-56 truncate font-medium">{c.name || c.email}</span>
                        <span className="mt-0.5 max-w-56 truncate text-xs text-muted-foreground">{c.name ? `${c.email} · ` : ""}{c.workspace}</span>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">{c.day}</TableCell>
                    <TableCell>
                      <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex max-w-56 items-center gap-1 truncate text-[13px]">
                        <span className="truncate">{c.url.replace(/^https:\/\/(www\.)?/, "")}</span>
                        <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
                      </a>
                    </TableCell>
                    <TableCell className="hidden text-[13px] text-subtle-foreground @2xl/main:table-cell">{relativeTime(new Date(c.at))}</TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const st = courseClaimStatus(c);
                        const variant = st.tone === "danger" ? "destructive" : st.tone === "muted" ? "secondary" : st.tone;
                        return (
                          <div className="flex flex-col items-end gap-1.5">
                            <Badge variant={variant} title={c.hook?.error || undefined}>{st.label}</Badge>
                            {c.hook?.state === "failed" && c.hook.error ? <span className="max-w-56 truncate text-xs text-muted-foreground">{c.hook.error}</span> : null}
                            {c.flagged ? (
                              <form action={approveCoursePostAction.bind(null, c.workspaceId, c.day)}>
                                <SubmitButton size="sm" variant="outline">Looks fine, open the next day</SubmitButton>
                              </form>
                            ) : st.canResend ? (
                              <form action={resendCoursePostAction.bind(null, c.workspaceId, c.day)}>
                                <SubmitButton size="sm" variant="outline">Send again</SubmitButton>
                              </form>
                            ) : null}
                          </div>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </EdgeTable>
        )}
      </Panel>

      <SkoolInviteCard
        connected={await platformInviteHint()}
        save={savePlatformInviteAction}
        test={testPlatformInviteAction}
        remove={removePlatformInviteAction}
        defaultEmail={admin.email}
      />

      <div className="grid items-start gap-6 @4xl/main:grid-cols-2">
        <Panel icon={ZapIcon} tone="gold" title="Instant access for paid joins (Skool Pro)" sub="Zapier: Skool “New Paid Member” → Webhooks by Zapier, POST JSON with email and name. Paid members get in about 15 minutes after joining.">
          <div className="flex items-center gap-2">
            <Input readOnly value={zapUrl} className="font-mono text-xs" aria-label="Zapier webhook URL" />
            <CopyButton text={zapUrl} />
          </div>
          {!env.skoolWebhookSecret ? <Callout tone="warn">Set SKOOL_WEBHOOK_SECRET on the server first.</Callout> : null}
        </Panel>

        <Panel icon={KeyRoundIcon} tone="success" title="Give someone access" sub="For partners, comps or support fixes.">
          <form action={grantMemberAction} className="flex flex-col gap-4">
            <div className="grid gap-4 @xl/main:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" name="email" type="email" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="days">Days</FieldLabel>
                <Input id="days" name="days" type="number" min={0} placeholder="Lifetime" />
                <FieldDescription>Leave blank for lifetime.</FieldDescription>
              </Field>
            </div>
            <div>
              <SubmitButton>Give access</SubmitButton>
            </div>
          </form>
        </Panel>
      </div>

      <Panel
        icon={UsersIcon}
        title="Everyone"
        sub="Every email that has, or had, access."
        action={
          <form>
            <Input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Search email or name" className="h-9 w-52 rounded-full" aria-label="Search members" />
          </form>
        }
      >
        {rows.length === 0 ? (
          <Empty icon={UsersIcon} tone="muted" title={sp.q ? `No one matches “${sp.q}”` : "No members yet"} body="Upload your Skool export above or give someone access." />
        ) : (
          <EdgeTable>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Email</TableHead>
                <TableHead className="hidden @2xl/main:table-cell">Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Active until</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const live = r.status === "active" && (!r.activeUntil || r.activeUntil.getTime() > now);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={r.name || r.email} size="sm" />
                        <div className="grid min-w-0 leading-tight">
                          <span className="truncate font-medium">{r.email}</span>
                          {r.name ? <span className="mt-0.5 truncate text-xs text-muted-foreground">{r.name}</span> : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground @2xl/main:table-cell">{CHANNEL[r.channel] ?? r.channel}</TableCell>
                    <TableCell>
                      {live ? <Badge variant="success">Active</Badge> : <Badge variant="outline">{r.status === "removed" ? "Removed" : "Expired"}</Badge>}
                    </TableCell>
                    <TableCell className="text-[13px] text-subtle-foreground">{r.activeUntil ? r.activeUntil.toDateString() : "Lifetime"}</TableCell>
                    <TableCell className="text-right">
                      {live ? (
                        <form action={revokeMemberAction.bind(null, r.email, r.channel)}>
                          <SubmitButton variant="ghost" size="sm" confirm={`Remove ${r.email}?`}>
                            Remove
                          </SubmitButton>
                        </form>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </EdgeTable>
        )}
      </Panel>
    </>
  );
}
