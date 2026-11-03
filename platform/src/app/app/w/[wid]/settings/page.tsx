import Link from "next/link";
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

import { cn } from "@/lib/utils";
import { Callout, Flash, PageHead, Panel } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SubmitButton } from "@/components/client";
import { WhatsAppConnect } from "@/components/WhatsAppConnect";
import { listMembers } from "@/server/team";

const KIND: Record<string, string> = { facebook_page: "Facebook Page", instagram: "Instagram", whatsapp: "WhatsApp", sms: "SMS number" };

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

  const nav = [
    { href: "#business", label: "Business details" },
    ...(viaMember ? [{ href: "#access", label: "Member access" }] : []),
    { href: "#ai", label: "Your AI" },
    { href: "#tracking", label: "Meta Pixel" },
    { href: "#channels", label: "Inbox channels" },
    { href: "#team", label: "Team" },
    ...(showTemplate ? [{ href: "#template", label: "Save as a template" }] : []),
  ];

  return (
    <>
      <PageHead title="Settings" />
      <Flash searchParams={sp} />

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-20 flex flex-col gap-0.5">
            {nav.map((n) => (
              <li key={n.href}>
                <a href={n.href} className="block rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <form action={saveBusinessAction.bind(null, wid)} id="business" className="scroll-mt-20">
            <Panel title="Business details" action={<SubmitButton variant="outline" size="sm">Save</SubmitButton>}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="businessName">Business or community name</FieldLabel>
                  <Input id="businessName" name="businessName" defaultValue={s.businessName ?? workspace.name} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="skoolUrl">Skool group link</FieldLabel>
                  <Input id="skoolUrl" name="skoolUrl" type="url" defaultValue={s.skoolUrl ?? ""} placeholder="https://www.skool.com/your-group/about" />
                </Field>
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
            </Panel>
          </form>

          {viaMember ? (
            <form action={checkAccessAction.bind(null, wid)} id="access" className="scroll-mt-20">
              <Panel
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

          <div id="ai" className="scroll-mt-20">
            <Panel title="Your AI" sub="Connect the AI you already use (Claude, Gemini, ChatGPT…), run playbooks, or add your own API key so AI never touches your wallet.">
              <div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/w/${wid}/ai`}>Open Your AI</Link>
                </Button>
              </div>
            </Panel>
          </div>

          <form action={saveTrackingAction.bind(null, wid)} id="tracking" className="scroll-mt-20">
            <Panel
              title="Meta Pixel & Conversions API"
              sub="Your pages fire PageView and Lead in the browser and send the same Lead from our server. Meta matches them, so you get better tracking even with ad blockers. This works on Skool's $9 plan."
              action={<SubmitButton variant="outline" size="sm">Save</SubmitButton>}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="metaPixelId">Pixel (dataset) ID</FieldLabel>
                  <Input id="metaPixelId" name="metaPixelId" defaultValue={s.metaPixelId ?? ""} placeholder="123456789012345" inputMode="numeric" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="metaTestEventCode">Test event code (optional)</FieldLabel>
                  <Input id="metaTestEventCode" name="metaTestEventCode" defaultValue={s.metaTestEventCode ?? ""} placeholder="TEST12345" />
                  <FieldDescription>Remove it when you finish testing.</FieldDescription>
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="metaCapiToken">Conversions API access token</FieldLabel>
                  <Input
                    id="metaCapiToken"
                    name="metaCapiToken"
                    type="password"
                    placeholder={s.metaCapiTokenEnc ? "Saved. Paste a new one to replace it." : "From Events Manager › Settings › Generate access token"}
                    autoComplete="off"
                  />
                  {s.metaCapiTokenEnc ? (
                    <Label className="font-normal">
                      <input type="checkbox" name="clearToken" className="size-4 accent-primary" /> Remove saved token
                    </Label>
                  ) : null}
                </Field>
              </div>
            </Panel>
          </form>

          <section id="channels" className="scroll-mt-20">
            <Panel title="Inbox channels">
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
                              <Badge variant="secondary" className={cn("capitalize", c.status === "active" ? "bg-success-soft text-success" : "bg-destructive/10 text-destructive")}>
                                {c.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {c.status === "active" ? (
                                <form action={disconnectChannelAction.bind(null, wid, c.id)}>
                                  <SubmitButton variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" confirm="Confirm">
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
                    <p className="text-sm text-muted-foreground">No channels yet. Connect one below and new messages land in your inbox.</p>
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
                  <Separator className="my-2" />
                  <div id="sms" className="flex scroll-mt-20 flex-col gap-3">
                    <h3 className="font-medium">SMS number</h3>
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
                            <div className="flex flex-col divide-y rounded-lg border">
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
            </Panel>
          </section>

          <section id="team" className="scroll-mt-20">
            <Panel title="Team" sub="Team members can work leads and the inbox. Admins can also edit funnels, emails, automations and settings.">
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
                            <SubmitButton variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" confirm="Confirm">
                              Remove
                            </SubmitButton>
                          </form>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {role !== "user" ? (
                <form action={inviteMemberAction.bind(null, wid)} className="grid gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                  <Field>
                    <FieldLabel htmlFor="iname">Name</FieldLabel>
                    <Input id="iname" name="name" className="bg-background" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="iemail">Email</FieldLabel>
                    <Input id="iemail" name="email" type="email" required className="bg-background" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="irole">Role</FieldLabel>
                    <NativeSelect id="irole" name="role" defaultValue="user" className="w-full bg-background sm:w-auto">
                      <NativeSelectOption value="user">Team member</NativeSelectOption>
                      <NativeSelectOption value="admin">Admin</NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <SubmitButton variant="outline">Invite</SubmitButton>
                </form>
              ) : null}
            </Panel>
          </section>

          {showTemplate ? (
            <form action={saveTemplateFromWorkspaceAction.bind(null, user.isPlatformAdmin && agency.isPlatform ? null : agency.id)} id="template" className="scroll-mt-20">
              <Panel title="Save as a template" sub="Copies this account's funnels, email sequences and automations (never contacts) so you can load them into new accounts.">
                <input type="hidden" name="workspaceId" value={wid} />
                <div className="grid gap-4 sm:grid-cols-2">
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
              </Panel>
            </form>
          ) : null}
        </div>
      </div>
    </>
  );
}
