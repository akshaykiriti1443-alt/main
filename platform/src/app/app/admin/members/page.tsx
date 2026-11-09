import { requirePlatformAdmin } from "@/server/auth";
import { lastRosterImport, listMemberAccess, memberStats } from "@/server/access";
import { firstEightDayMembers } from "@/server/admin";
import { grantMemberAction, revokeMemberAction } from "@/actions/admin";
import { saveEntryTicketAction } from "@/actions/unlocks";
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
import { CheckIcon, CloudUploadIcon, GraduationCapIcon, HandHelpingIcon, KeyRoundIcon, RefreshCwIcon, ShoppingBagIcon, TicketIcon, UsersIcon, ZapIcon } from "lucide-react";
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
  const [stats, last, rows, firstDays] = await Promise.all([memberStats(), lastRosterImport(), listMemberAccess({ q: sp.q }), firstEightDayMembers()]);
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
