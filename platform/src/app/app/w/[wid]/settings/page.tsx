import Link from "next/link";
import { ArrowRightIcon, BotIcon, BriefcaseIcon, CircleCheckIcon, InboxIcon, LayoutTemplateIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { listConnections } from "@/server/inbox";
import { hasFeature } from "@/server/plans";
import { metaConfigured } from "@/server/meta/graph";
import { smsConfigured } from "@/server/sms";
import { listUserAgencies } from "@/server/tenancy";
import { env } from "@/lib/env";
import {
  buyNumberAction,
  disconnectChannelAction,
  inviteMemberAction,
  listNumbers,
  removeMemberAction,
  checkAccessAction,
  saveBusinessAction,
  saveTrackingAction,
  searchNumbersAction,
} from "@/actions/account";
import { saveTemplateFromWorkspaceAction } from "@/actions/agency";

import { Callout, Flash, IconTile, LessonTag, MoreOptions, PageHead, Panel, StepDot } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SubmitButton } from "@/components/client";
import { WhatsAppConnect } from "@/components/WhatsAppConnect";
import { listMembers } from "@/server/team";
import { OpenOnHash } from "./open-on-hash";

const KIND: Record<string, string> = { facebook_page: "Facebook Page", instagram: "Instagram", whatsapp: "WhatsApp", sms: "SMS number" };

/** A "More options" that sits inside a card: lighter, no second shadow. */
const INNER_MORE = "bg-background/50 open:border-solid open:border-border open:bg-background/60 open:shadow-none open:ring-0 dark:bg-white/[0.02] dark:open:bg-white/[0.02]";

/** One numbered line in a how-to, so a field reads like the lesson's steps. */
function FieldStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <StepDot n={n} className="mt-0.5 size-6 text-xs" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace, user, agency, role } = await requireWorkspace(wid);
  const s = workspace.settings;
  const connections = await listConnections(wid);
  const growth = hasFeature(workspace.plan, "inbox");
  const numbers = sp.numbers ? await listNumbers(wid, sp.numbers) : null;
  const agencies = await listUserAgencies(user.id);
  const myAgency = agencies.find((a) => a.agency.id === agency.id);
  const viaMember = workspace.accessSource === "member";
  const members = await listMembers(wid);
  const showTemplate = Boolean(user.isPlatformAdmin || (myAgency && agency.plan === "agency"));
  const activeChannels = connections.filter((c) => c.status === "active").length;

  const first = !s.skoolUrl
    ? "Paste your Skool group link in Business details and press Save."
    : !s.metaPixelId
      ? "Add your Meta Pixel ID so your ads learn who lands on your pages."
      : undefined;
  // One dominant button: the Save of whichever card is the next step. While it's the step,
  // that Save is the screen's one pink button.
  const pixelIsNext = Boolean(s.skoolUrl) && !s.metaPixelId;
  const businessSave = !s.skoolUrl ? "cta" : pixelIsNext ? "outline" : "default";
  const pixelSave = pixelIsNext ? "cta" : "outline";

  return (
    <>
      <PageHead
        eyebrow="Account"
        title="Settings"
        sub="The few things your funnel needs to know about you. Most people only ever fill in the first two cards."
        first={first}
      />
      <Flash searchParams={sp} />
      <OpenOnHash />

      <form action={saveBusinessAction.bind(null, wid)} id="business" className="scroll-mt-20">
        <Panel
          step={1}
          title="Business details"
          sub="Every Join button on your pages points at your Skool group link."
          action={<LessonTag lesson="1.3" stage="Day 1" />}
        >
          <div className="grid gap-5 @2xl/main:grid-cols-2">
            <Field data-guide="skool-link" className="@2xl/main:col-span-2">
              <FieldLabel htmlFor="skoolUrl" className="flex items-center gap-2">
                Skool group link
                {s.skoolUrl ? (
                  <Badge variant="success">
                    <CircleCheckIcon data-icon="inline-start" /> Saved
                  </Badge>
                ) : null}
              </FieldLabel>
              <Input id="skoolUrl" name="skoolUrl" type="url" defaultValue={s.skoolUrl ?? ""} placeholder="https://www.skool.com/your-group/about" className="h-12 rounded-xl px-4 text-[15px]" />
              <FieldDescription>Open your group in Skool, go to its About page and copy the address bar.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="businessName">Business or community name</FieldLabel>
              <Input id="businessName" name="businessName" defaultValue={s.businessName ?? workspace.name} />
            </Field>
          </div>
          <MoreOptions title="More business details" sub="What you help with, your offer, reply-to email and mailing address." className={INNER_MORE}>
            <div className="grid gap-4 @2xl/main:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="niche">What you help with</FieldLabel>
                <Input id="niche" name="niche" defaultValue={s.niche ?? ""} />
              </Field>
              <Field>
                <FieldLabel htmlFor="offer">Your offer</FieldLabel>
                <Input id="offer" name="offer" defaultValue={s.offer ?? ""} />
              </Field>
              <Field>
                <FieldLabel htmlFor="replyToEmail">Reply-to email</FieldLabel>
                <Input id="replyToEmail" name="replyToEmail" type="email" defaultValue={s.replyToEmail ?? ""} placeholder={user.email} />
                <FieldDescription>Replies to your emails go here.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="mailingAddress">Mailing address</FieldLabel>
                <Input id="mailingAddress" name="mailingAddress" defaultValue={s.mailingAddress ?? ""} placeholder="123 Main St, Austin, TX 78701, USA" />
                <FieldDescription>Shown in email footers. Required for broadcasts.</FieldDescription>
              </Field>
            </div>
          </MoreOptions>
          <div>
            <SubmitButton variant={businessSave}>Save</SubmitButton>
          </div>
        </Panel>
      </form>

      <form action={saveTrackingAction.bind(null, wid)} id="tracking" data-guide="pixel" className="scroll-mt-20">
        <Panel
          step={2}
          title="Meta Pixel & Conversions API"
          sub="Optional: your Day 1 ads don't need it. Add it later so your ads learn who actually lands on your pages. Works on Skool's $9 plan too."
          action={<LessonTag lesson="1.7" stage="Optional" />}
        >
          <div className="flex flex-col gap-5">
            <FieldStep n={1}>
              <Field>
                <FieldLabel htmlFor="metaPixelId" className="flex items-center gap-2">
                  Pixel (dataset) ID
                  {s.metaPixelId ? (
                    <Badge variant="success">
                      <CircleCheckIcon data-icon="inline-start" /> Connected
                    </Badge>
                  ) : null}
                </FieldLabel>
                <Input id="metaPixelId" name="metaPixelId" defaultValue={s.metaPixelId ?? ""} placeholder="123456789012345" inputMode="numeric" className="@2xl/main:max-w-sm" />
                <FieldDescription>Meta Events Manager › your Pixel › Settings tab. Copy the Dataset ID.</FieldDescription>
              </Field>
            </FieldStep>
            <FieldStep n={2}>
              <Field>
                <FieldLabel htmlFor="metaCapiToken">Conversions API access token</FieldLabel>
                <Input
                  id="metaCapiToken"
                  name="metaCapiToken"
                  type="password"
                  placeholder={s.metaCapiTokenEnc ? "Saved. Paste a new one to replace it." : "From Events Manager › Settings › Generate access token"}
                  autoComplete="off"
                />
                <FieldDescription>Same Settings tab, scroll to Conversions API › Generate access token. We send each Lead from our server too, so ad blockers can&apos;t hide it.</FieldDescription>
                {s.metaCapiTokenEnc ? (
                  <Label className="font-normal">
                    <input type="checkbox" name="clearToken" className="size-4 accent-primary" /> Remove saved token
                  </Label>
                ) : null}
              </Field>
            </FieldStep>
            <FieldStep n={3}>
              <Field>
                <FieldLabel htmlFor="metaTestEventCode">
                  Test event code <span className="font-normal text-muted-foreground">(optional)</span>
                </FieldLabel>
                <Input id="metaTestEventCode" name="metaTestEventCode" defaultValue={s.metaTestEventCode ?? ""} placeholder="TEST12345" className="@2xl/main:max-w-sm" />
                <FieldDescription>From the Test events tab. Remove it when you finish testing.</FieldDescription>
              </Field>
            </FieldStep>
          </div>
          <div>
            <SubmitButton variant={pixelSave}>Save</SubmitButton>
          </div>
        </Panel>
      </form>

      <Card id="ai" size="sm" className="scroll-mt-20">
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <IconTile icon={BotIcon} />
          <div className="grid min-w-0 flex-1 basis-60 gap-0.5">
            <span className="text-[15px] font-semibold">Your AI</span>
            <span className="text-sm text-muted-foreground">Connect the AI you already use (Claude, ChatGPT, Gemini…), or add your own API key, so AI never touches your wallet.</span>
          </div>
          <Button asChild variant="outline">
            <Link href={`/app/w/${wid}/ai`}>
              Open Your AI <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {viaMember ? (
        <form action={checkAccessAction.bind(null, wid)} id="access" className="scroll-mt-20">
          <Panel
            icon={ShieldCheckIcon}
            tone="success"
            title="Member access"
            sub={
              workspace.accessVerifiedUntil && workspace.accessVerifiedUntil.getFullYear() < 2900 ? (
                <>
                  Active while you&apos;re a member. Confirmed through{" "}
                  <strong className="font-medium text-foreground">{workspace.accessVerifiedUntil.toDateString()}</strong>. It renews by itself each time we see you in the member list. Nothing to type.
                </>
              ) : (
                <>Active while you&apos;re a member. It renews by itself. Nothing to type.</>
              )
            }
          >
            <input type="hidden" name="back" value={`/app/w/${wid}/settings`} />
            <div>
              <SubmitButton variant="outline" pendingText="Checking…">Check my membership now</SubmitButton>
            </div>
          </Panel>
        </form>
      ) : null}

      <section aria-labelledby="more-settings" className="flex flex-col gap-3 pt-4">
        <div className="flex flex-col gap-1.5 pb-1">
          <h2 id="more-settings" className="eyebrow">
            When you need them
          </h2>
          <p className="text-sm text-muted-foreground">Folded away until the day you want them. Nothing here is needed to launch.</p>
        </div>

        <MoreOptions
          id="channels"
          icon={InboxIcon}
          title="Inbox channels"
          sub={growth ? (activeChannels ? `${activeChannels} connected. Messages land in your Inbox.` : "Instagram, Facebook, WhatsApp and SMS in one inbox.") : "On the Growth plan: Instagram, Facebook, WhatsApp and SMS in one inbox."}
        >
          {!growth ? (
            <Callout tone="info">
              Connect Instagram, Facebook, WhatsApp and SMS on the{" "}
              <a href={`/app/w/${wid}/billing`} className="font-medium underline underline-offset-4">
                Growth plan
              </a>
              .
            </Callout>
          ) : (
            <>
              {connections.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {connections.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground">{KIND[c.kind]}</TableCell>
                        <TableCell>
                          <Badge variant={c.status === "active" ? "success" : "destructive"} className="capitalize">
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {c.status === "active" ? (
                            <form action={disconnectChannelAction.bind(null, wid, c.id)}>
                              <SubmitButton variant="ghost" size="sm" className="text-destructive hover:bg-destructive-soft hover:text-destructive" confirm="Confirm">
                                Disconnect
                              </SubmitButton>
                            </form>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No channels yet. Connect one and new messages land in your inbox.</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild>
                  <a href={`/api/integrations/meta/start?w=${wid}`}>Connect Instagram & Facebook</a>
                </Button>
                {metaConfigured() && env.metaWaConfigId ? (
                  <WhatsAppConnect appId={env.metaAppId} configId={env.metaWaConfigId} graphVersion={env.metaGraphVersion} workspaceId={wid} />
                ) : (
                  <span className="text-sm text-muted-foreground">WhatsApp: the platform owner needs to finish Meta Tech Provider setup.</span>
                )}
              </div>
              <Separator className="my-1" />
              <div id="sms" className="flex scroll-mt-20 flex-col gap-3">
                <h3 className="font-semibold">SMS number</h3>
                {!smsConfigured() ? (
                  <p className="text-sm text-muted-foreground">SMS isn&apos;t switched on for this platform yet.</p>
                ) : (
                  <>
                    <form action={searchNumbersAction.bind(null, wid)} className="flex flex-wrap items-center gap-2">
                      <NativeSelect name="country" defaultValue="US" aria-label="Country">
                        <NativeSelectOption value="US">United States</NativeSelectOption>
                        <NativeSelectOption value="CA">Canada</NativeSelectOption>
                        <NativeSelectOption value="GB">United Kingdom</NativeSelectOption>
                        <NativeSelectOption value="AU">Australia</NativeSelectOption>
                      </NativeSelect>
                      <Input name="areaCode" placeholder="Area code" className="w-32" aria-label="Area code" />
                      <SubmitButton variant="outline">Find numbers</SubmitButton>
                    </form>
                    {numbers && !numbers.ok ? <Callout tone="error">{numbers.error}</Callout> : null}
                    {numbers && numbers.ok ? (
                      numbers.numbers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No numbers found. Try another area code.</p>
                      ) : (
                        <div className="flex flex-col divide-y divide-border/80 overflow-hidden rounded-xl bg-card ring-1 ring-ink/[0.07] dark:ring-white/[0.08]">
                          {numbers.numbers.map((n) => (
                            <form key={n.phone_number} action={buyNumberAction.bind(null, wid)} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                              <span className="text-sm">
                                <span className="font-medium tabular-nums">{n.friendly_name}</span>{" "}
                                <span className="text-xs text-muted-foreground">{[n.locality, n.region].filter(Boolean).join(", ")}</span>
                              </span>
                              <input type="hidden" name="phoneNumber" value={n.phone_number} />
                              <SubmitButton variant="outline" size="sm" confirm="Buy (charged monthly)">
                                Buy
                              </SubmitButton>
                            </form>
                          ))}
                        </div>
                      )
                    ) : null}
                    <p className="text-xs text-muted-foreground">US numbers need A2P 10DLC registration before carriers deliver texts at volume.</p>
                  </>
                )}
              </div>
            </>
          )}
        </MoreOptions>

        <MoreOptions
          id="team"
          icon={UsersIcon}
          title="Team"
          sub={members.length > 1 ? `${members.length} people. Team members work leads and the inbox; admins can edit everything.` : "Just you for now. Invite a helper to work leads and the inbox."}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.userId}>
                  <TableCell className="font-medium">{m.name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {m.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {m.role !== "owner" && m.userId !== user.id && role !== "user" ? (
                      <form action={removeMemberAction.bind(null, wid, m.userId)}>
                        <SubmitButton variant="ghost" size="sm" className="text-destructive hover:bg-destructive-soft hover:text-destructive" confirm="Confirm">
                          Remove
                        </SubmitButton>
                      </form>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-sm text-muted-foreground">Team members can work leads and the inbox. Admins can also edit funnels, emails, automations and settings.</p>
          {role !== "user" ? (
            <form action={inviteMemberAction.bind(null, wid)} className="grid gap-3 rounded-xl bg-background/60 p-4 ring-1 ring-ink/[0.06] @2xl/main:grid-cols-[1fr_1fr_auto_auto] @2xl/main:items-end dark:bg-white/[0.02] dark:ring-white/[0.07]">
              <Field>
                <FieldLabel htmlFor="iname">Name</FieldLabel>
                <Input id="iname" name="name" />
              </Field>
              <Field>
                <FieldLabel htmlFor="iemail">Email</FieldLabel>
                <Input id="iemail" name="email" type="email" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="irole">Role</FieldLabel>
                <NativeSelect id="irole" name="role" defaultValue="user" className="w-full @2xl/main:w-auto">
                  <NativeSelectOption value="user">Team member</NativeSelectOption>
                  <NativeSelectOption value="admin">Admin</NativeSelectOption>
                </NativeSelect>
              </Field>
              <SubmitButton variant="outline">Invite</SubmitButton>
            </form>
          ) : null}
        </MoreOptions>

        {showTemplate ? (
          <MoreOptions id="template" icon={LayoutTemplateIcon} title="Save as a template" sub="Copies this account's funnels, email sequences and automations (never contacts) so you can load them into new accounts.">
            <form action={saveTemplateFromWorkspaceAction.bind(null, user.isPlatformAdmin && agency.isPlatform ? null : agency.id)} className="flex flex-col gap-4">
              <input type="hidden" name="workspaceId" value={wid} />
              <div className="grid gap-4 @2xl/main:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="tname">Template name</FieldLabel>
                  <Input id="tname" name="name" defaultValue={`${workspace.name} funnel`} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="tdesc">Description</FieldLabel>
                  <Input id="tdesc" name="description" placeholder="Lead magnet funnel + 3 emails" />
                </Field>
              </div>
              <div>
                <SubmitButton variant="outline">Save template</SubmitButton>
              </div>
            </form>
          </MoreOptions>
        ) : null}
      </section>

      <p className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
        <IconTile icon={BriefcaseIcon} tone="muted" className="size-7 rounded-lg [&_svg]:size-3.5" />
        <span>
          Looking for your plan or wallet? It&apos;s in <Link href={`/app/w/${wid}/billing`}>Plan & wallet</Link>.
        </span>
      </p>
    </>
  );
}
