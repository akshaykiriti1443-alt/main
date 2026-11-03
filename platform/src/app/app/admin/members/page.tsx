import { requirePlatformAdmin } from "@/server/auth";
import { lastRosterImport, listMemberAccess, memberStats } from "@/server/access";
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
import { Callout, Flash, PageHead, Panel, Stat } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RosterUpload } from "./roster";

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
  const [stats, last, rows] = await Promise.all([memberStats(), lastRosterImport(), listMemberAccess({ q: sp.q })]);
  const staleDays = last ? Math.floor((Date.now() - last.createdAt.getTime()) / 86_400_000) : null;
  const zapUrl = `${env.appUrl}/api/webhooks/skool?secret=${env.skoolWebhookSecret || "<SKOOL_WEBHOOK_SECRET>"}`;
  const now = Date.now();

  return (
    <>
      <PageHead
        title="Members"
        sub="Active members get the app. No codes. People come in from Skool (Zapier or your member export), from a purchase on /join, or a manual grant. When someone leaves, their account pauses after a 7-day grace and turns back on if they return."
      />
      <Flash searchParams={sp} />

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat label="Active members" value={stats.total} />
        <Stat label="From Skool" value={(stats.byChannel.skool_export ?? 0) + (stats.byChannel.skool_zapier ?? 0)} hint={`${stats.byChannel.skool_zapier ?? 0} via Zapier`} />
        <Stat label="Bought on /join" value={stats.byChannel.stripe ?? 0} hint={memberCheckoutConfigured() ? "Stripe on" : "Set STRIPE_PRICE_MEMBER"} />
        <Stat label="Last Skool sync" value={last ? relativeTime(last.createdAt) : "Never"} hint={last ? `${last.added} in · ${last.removed} out` : undefined} />
      </div>

      {staleDays === null || staleDays > 7 ? (
        <Callout tone="warn" title={staleDays === null ? "Upload your first Skool export" : `Your last Skool sync was ${staleDays} days ago`}>
          The export is the only safe way to learn who left Skool. Do it weekly. Members on the export stay active for 35 days, so a missed week never locks anyone out.
        </Callout>
      ) : null}

      <Panel title="Sync from Skool" sub="Skool › your group › Members › Export. Upload the full, unfiltered file. Everyone on it gets access. Anyone who dropped off is removed after you confirm.">
        <RosterUpload />
        <p className="text-xs text-muted-foreground">
          Tip: add the membership question “What email will you use for the app?”. Its answers are in the export, so members who use a different email still match.
        </p>
      </Panel>

      <form action={saveEntryTicketAction}>
        <Panel
          title="Entry ticket: post to get connected"
          sub="Ask new members to introduce themselves in your community before their app account opens. They post, paste the link, and they're in. Every new member becomes a post, and Skool ranks communities on engagement."
          action={<SubmitButton size="sm" variant="outline">Save</SubmitButton>}
        >
          {myUnlocks.length === 0 ? (
            <Callout tone="info">Create an unlock in your own workspace first (Unlocks › New unlock, action: “Make their own post”, e.g. “Introduce yourself”). Then pick it here.</Callout>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="unlockId">The intro unlock</FieldLabel>
                <NativeSelect id="unlockId" name="unlockId" defaultValue={ticket?.unlockId ?? ""}>
                  <NativeSelectOption value="">Pick one…</NativeSelectOption>
                  {myUnlocks.map((u) => (
                    <NativeSelectOption key={u.id} value={u.id}>{u.title} · {u.workspace}{u.active ? "" : " (paused)"}</NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldDescription>Its instructions and Skool link are what new members see.</FieldDescription>
              </Field>
              <div className="flex flex-col gap-2 text-sm">
                <Label className="flex items-center gap-2 font-normal">
                  <input type="checkbox" name="on" defaultChecked={ticket?.on ?? false} /> Turn the entry ticket on
                </Label>
                <Label className="flex items-center gap-2 font-normal">
                  <input type="checkbox" name="everyone" defaultChecked={ticket ? new Date(ticket.since).getTime() === 0 : false} /> Also ask existing members who haven&apos;t posted yet
                </Label>
                <span className="text-xs text-muted-foreground">{ticket?.on ? "On now." : "Off now."} Admins and agency accounts never see it.</span>
              </div>
            </div>
          )}
        </Panel>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Instant access for paid joins (Skool Pro)" sub="Zapier: Skool “New Paid Member” → Webhooks by Zapier, POST JSON with email and name. Paid members get in about 15 minutes after joining.">
          <div className="flex items-center gap-2">
            <Input readOnly value={zapUrl} className="font-mono text-xs" aria-label="Zapier webhook URL" />
            <CopyButton text={zapUrl} />
          </div>
          {!env.skoolWebhookSecret ? <Callout tone="warn">Set SKOOL_WEBHOOK_SECRET on the server first.</Callout> : null}
        </Panel>

        <Panel title="Give someone access" sub="For partners, comps or support fixes.">
          <form action={grantMemberAction} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
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
        title="Everyone"
        action={
          <form>
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search email or name" className="h-8 w-48" aria-label="Search members" />
          </form>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Source</TableHead>
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
                  <TableCell>
                    <span className="block font-medium">{r.email}</span>
                    {r.name ? <span className="block text-xs text-muted-foreground">{r.name}</span> : null}
                  </TableCell>
                  <TableCell>{CHANNEL[r.channel] ?? r.channel}</TableCell>
                  <TableCell>
                    {live ? (
                      <Badge variant="secondary" className="bg-success-soft text-success">Active</Badge>
                    ) : (
                      <Badge variant="outline">{r.status === "removed" ? "Removed" : "Expired"}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.activeUntil ? r.activeUntil.toDateString() : "Lifetime"}</TableCell>
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
      </Panel>
    </>
  );
}
