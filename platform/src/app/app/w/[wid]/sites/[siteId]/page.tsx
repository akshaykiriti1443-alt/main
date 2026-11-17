import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  FilePlus2Icon,
  FileTextIcon,
  GlobeIcon,
  type LucideIcon,
  MailCheckIcon,
  PaletteIcon,
  PencilIcon,
  RocketIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { domainTools, getSite, joinLinkMissing, lastPublishedAt, listPages, siteBaseUrl, siteVars } from "@/server/sites";
import { dnsInstructions } from "@/server/domains";
import { hasFeature } from "@/server/plans";
import { getDomainAffiliate } from "@/server/domainAffiliate";
import { GetDomain } from "@/components/get-domain";
import { relativeTime } from "@/lib/util";
import { saveSkoolLinkAction } from "@/actions/account";
import {
  addPageAction,
  connectDomainAction,
  deletePageAction,
  deleteSiteAction,
  publishSiteAction,
  removeDomainAction,
  unpublishSiteAction,
  updateSiteAction,
} from "@/actions/sites";
import { Callout, Flash, IconTile, MoreOptions, NextStep, PageHead, Panel, type Tone } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Funnel" };

const KIND: Record<"optin" | "thankyou" | "sales" | "custom", { label: string; icon: LucideIcon; tone: Tone }> = {
  optin: { label: "Opt-in", icon: FileTextIcon, tone: "primary" },
  thankyou: { label: "Thank-you", icon: MailCheckIcon, tone: "gold" },
  sales: { label: "Sales", icon: TagIcon, tone: "success" },
  custom: { label: "Page", icon: FileTextIcon, tone: "muted" },
};

const DOMAIN_STATE: Record<string, { label: string; badge: "success" | "destructive" | "warning" }> = {
  verified: { label: "Connected", badge: "success" },
  pending: { label: "Waiting for your record", badge: "warning" },
  error: { label: "Not connected", badge: "destructive" },
};

export default async function SitePage({ params, searchParams }: { params: Promise<{ wid: string; siteId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid, siteId } = await params;
  const { workspace } = await requireWorkspace(wid);
  const site = await getSite(wid, siteId);
  if (!site) notFound();
  const pages = await listPages(siteId);
  const domain = domainTools(hasFeature(workspace.plan, "custom_domains"), site);
  const domainPartner = domain.offerPurchase ? await getDomainAffiliate() : null;
  const base = siteBaseUrl(site);
  const address = base.replace(/^https?:\/\//, "");
  const dns = site.customDomain ? dnsInstructions(site.customDomain) : null;
  const domainState = DOMAIN_STATE[site.domainStatus] ?? DOMAIN_STATE.pending;
  const changed = pages.some((p) => !p.publishedAt || p.updatedAt > p.publishedAt);
  const liveSince = lastPublishedAt(pages);
  const optin = pages.find((p) => p.kind === "optin");
  // Worked out exactly as the public page does, so what this screen says is what visitors get.
  const skoolLink = siteVars(site, workspace.settings.skoolUrl).skool_url;
  const joinHidden = joinLinkMissing(site, pages, workspace.settings.skoolUrl);
  const here = `/app/w/${wid}/sites/${siteId}`;

  // Pink only when publishing is THE thing to do on this screen (a draft, or edits nobody can see yet).
  const publishForm = (variant: "cta" | "outline") => (
    <form action={publishSiteAction.bind(null, wid, siteId)} data-guide="site-publish" className="inline-flex">
      <SubmitButton size={variant === "cta" ? "lg" : "default"} variant={variant} pendingText="Publishing…">
        {!site.published ? <RocketIcon data-icon="inline-start" /> : null}
        {site.published ? (changed ? "Publish changes" : "Republish") : "Publish"}
      </SubmitButton>
    </form>
  );

  return (
    <>
      <Link
        href={`/app/w/${wid}/sites`}
        className="group -mb-3 inline-flex w-fit items-center gap-1.5 rounded-full py-1 pr-3 pl-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground hover:no-underline"
      >
        <ArrowLeftIcon className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" aria-hidden />
        All funnels
      </Link>
      <PageHead
        lesson="Day 1"
        title={site.name}
        sub={site.published ? "Live and taking sign-ups. Edit any page, then publish the changes." : "A draft, so nobody can see it yet. Check your pages, then publish."}
        first={site.published ? undefined : "Open the opt-in page, make the headline sound like you, then press Publish."}
      />
      <Flash searchParams={await searchParams} />

      {site.published ? (
        <Card className="relative">
          {/* A soft jade glow: live, calm, nothing to worry about. */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-[radial-gradient(70%_120%_at_0%_0%,var(--success-soft),transparent_70%)]" />
          <CardContent className="relative flex flex-col gap-5 @4xl/main:flex-row @4xl/main:items-center @4xl/main:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-success-soft text-success ring-1 ring-success/15 ring-inset">
                <GlobeIcon className="size-[22px]" aria-hidden />
                <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-success ring-[3px] ring-card" aria-hidden />
              </span>
              <div className="grid min-w-0 gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[17px] font-semibold tracking-[-0.012em]">Your website is live</span>
                  <Badge variant="success">
                    <span className="size-1.5 rounded-full bg-current" aria-hidden />
                    Taking sign-ups
                  </Badge>
                  {changed ? <Badge variant="warning">Edits not live yet</Badge> : null}
                </span>
                <div className="flex min-w-0 flex-wrap items-center gap-2" data-guide="site-link">
                  <a
                    href={base}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 truncate rounded-full bg-background/70 px-3.5 py-1.5 font-mono text-[13px] font-medium text-foreground ring-1 ring-ink/[0.08] dark:bg-white/[0.03] dark:ring-white/[0.1]"
                  >
                    {address}
                  </a>
                  <CopyButton text={base} label="Copy link" />
                  <Button variant="ghost" size="sm" asChild>
                    <a href={base} target="_blank" rel="noreferrer">
                      View live <ExternalLinkIcon data-icon="inline-end" />
                    </a>
                  </Button>
                </div>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  This is your website&apos;s link. It&apos;s the one to share, and the one your website ads send people to.
                  {liveSince ? ` Last published ${relativeTime(liveSince)}.` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-row-reverse flex-wrap items-center justify-end gap-2 pl-16 @4xl/main:flex-row @4xl/main:pl-0">
              <form action={unpublishSiteAction.bind(null, wid, siteId)}>
                <SubmitButton variant="ghost" size="sm" confirm="Yes, take it offline">
                  Unpublish
                </SubmitButton>
              </form>
              {publishForm(changed ? "cta" : "outline")}
            </div>
          </CardContent>
        </Card>
      ) : (
        <NextStep
          eyebrow="Day 1 · The scary button"
          title="Publish your funnel"
          body={
            <>
              Not live yet: nobody can see it. Press Publish and it goes online at <span className="font-mono text-[13.5px] break-all text-white">{address}</span>. Nothing is permanent: change anything later and publish again.
            </>
          }
          icon={RocketIcon}
        >
          {publishForm("cta")}
        </NextStep>
      )}
      {site.published && changed ? <Callout tone="tip">You have edits nobody can see yet. Press &quot;Publish changes&quot; to make them live.</Callout> : null}
      {joinHidden ? (
        <Callout tone="info" title="Your Join button is waiting for your Skool group link">
          <div className="flex flex-col gap-3">
            <p>
              No group link is saved yet, so visitors don&apos;t see the Join button. Nothing is broken. Once your Skool group exists, paste its link here and the button appears on every page straight away. No need to publish again.
            </p>
            <form action={saveSkoolLinkAction.bind(null, wid)} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input type="hidden" name="back" value={here} />
              <Input name="skoolUrl" type="url" required aria-label="Skool group link" placeholder="https://www.skool.com/your-group/about" className="bg-background sm:max-w-md sm:flex-1" />
              <SubmitButton variant="outline">Save link</SubmitButton>
            </form>
          </div>
        </Callout>
      ) : null}

      <Panel
        icon={FileTextIcon}
        title="Your pages"
        sub="Visitors go opt-in page → thank-you page → your Skool group. Click a page to edit it."
        action={
          optin ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/w/${wid}/sites/${siteId}/pages/${optin.id}`}>
                <PencilIcon data-icon="inline-start" />
                Edit the opt-in page
              </Link>
            </Button>
          ) : undefined
        }
      >
        <ul className="flex flex-col gap-2.5">
          {pages.map((p, i) => {
            const k = KIND[p.kind];
            return (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-xl bg-background/60 p-3 pr-3.5 ring-1 ring-ink/[0.06] transition-[background-color,box-shadow] duration-150 hover:bg-card hover:shadow-card sm:flex-row sm:items-center dark:bg-white/[0.02] dark:ring-white/[0.07]"
              >
                <Link href={`/app/w/${wid}/sites/${siteId}/pages/${p.id}`} className="group flex min-w-0 flex-1 items-center gap-3.5 text-foreground hover:no-underline">
                  <span className="relative">
                    <IconTile icon={k.icon} tone={k.tone} className="size-10 rounded-[14px]" />
                    <span className="absolute -bottom-1 -left-1 grid size-[18px] place-items-center rounded-full bg-card text-[10px] font-semibold text-muted-foreground tabular-nums shadow-xs ring-1 ring-ink/[0.08] dark:ring-white/10">
                      {i + 1}
                    </span>
                  </span>
                  <span className="grid min-w-0 gap-1">
                    <span className="truncate font-medium group-hover:text-primary">{p.title}</span>
                    <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="h-5 px-2 text-[11px]">
                        {k.label}
                      </Badge>
                      <span className="truncate font-mono text-subtle-foreground">/{p.slug}</span>
                    </span>
                  </span>
                </Link>
                <div className="flex items-center gap-1.5 sm:justify-end">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/app/w/${wid}/sites/${siteId}/pages/${p.id}`}>
                      <PencilIcon data-icon="inline-start" />
                      Edit
                    </Link>
                  </Button>
                  {site.published && p.publishedAt ? (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`${base}${p.slug ? `/${p.slug}` : ""}`} target="_blank" rel="noreferrer">
                        View
                        <ExternalLinkIcon data-icon="inline-end" />
                      </a>
                    </Button>
                  ) : null}
                  {p.kind !== "optin" ? (
                    <form action={deletePageAction.bind(null, wid, siteId, p.id)}>
                      <SubmitButton variant="ghost" size="sm" className="text-destructive hover:text-destructive" confirm="Confirm delete">
                        Delete
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <div className="flex flex-col gap-3">
        <MoreOptions icon={FilePlus2Icon} title="Add another page" sub="A free training, a sales page or a second thank-you page.">
          <form action={addPageAction.bind(null, wid, siteId)} className="grid gap-3 @2xl/main:grid-cols-[1fr_1fr_auto_auto] @2xl/main:items-end">
            <Field>
              <FieldLabel htmlFor="title">New page title</FieldLabel>
              <Input id="title" name="title" placeholder="Free training" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="slug">Address</FieldLabel>
              <Input id="slug" name="slug" placeholder="training" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="kind">Type</FieldLabel>
              <NativeSelect id="kind" name="kind" defaultValue="custom" className="w-full @2xl/main:w-36">
                <NativeSelectOption value="custom">Page</NativeSelectOption>
                <NativeSelectOption value="sales">Sales page</NativeSelectOption>
                <NativeSelectOption value="thankyou">Thank-you</NativeSelectOption>
              </NativeSelect>
            </Field>
            <SubmitButton variant="outline">Add page</SubmitButton>
          </form>
        </MoreOptions>

        <MoreOptions icon={PaletteIcon} title="Funnel settings" sub="Name, free guide, style, font and colour.">
          <form action={updateSiteAction.bind(null, wid, siteId)} className="flex flex-col gap-5">
            <div className="grid gap-5 @2xl/main:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="name">Funnel name</FieldLabel>
                <Input id="name" name="name" defaultValue={site.name} />
              </Field>
              {/* Shown, not edited: there is one Skool link per account, and Settings is where it changes. */}
              <Field>
                <FieldLabel>Skool group link</FieldLabel>
                <p className="flex h-9 min-w-0 items-center rounded-md bg-muted/60 px-3 text-sm text-muted-foreground">
                  <span className="truncate">{skoolLink ? skoolLink.replace(/^https?:\/\//, "") : "Not saved yet"}</span>
                </p>
                <FieldDescription>
                  Every Join button uses your account&apos;s one Skool link. <Link href={`/app/w/${wid}/settings#business`}>{skoolLink ? "Change it in Settings" : "Add it in Settings"}</Link>.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="leadMagnetName">Lead magnet name</FieldLabel>
                <Input id="leadMagnetName" name="leadMagnetName" defaultValue={site.leadMagnetName} />
              </Field>
              <Field>
                <FieldLabel htmlFor="leadMagnetUrl">Lead magnet link</FieldLabel>
                <Input id="leadMagnetUrl" name="leadMagnetUrl" defaultValue={site.leadMagnetUrl} placeholder="/guide or https://..." />
                <FieldDescription>Use /guide for the hosted page, or paste a Google Drive or Notion link.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="style">Style</FieldLabel>
                <NativeSelect id="style" name="style" defaultValue={site.theme.style} className="w-full">
                  <NativeSelectOption value="bold">Bold (color hero)</NativeSelectOption>
                  <NativeSelectOption value="clean">Clean (light)</NativeSelectOption>
                  <NativeSelectOption value="dark">Dark</NativeSelectOption>
                  <NativeSelectOption value="editorial">Editorial (paper, magazine type)</NativeSelectOption>
                  <NativeSelectOption value="luxe">Luxe (deep color, centered)</NativeSelectOption>
                </NativeSelect>
                <FieldDescription>Editorial and Luxe look best with the Classic serif font.</FieldDescription>
              </Field>
              <div className="grid grid-cols-[1fr_auto] items-end gap-4">
                <Field>
                  <FieldLabel htmlFor="font">Font</FieldLabel>
                  <NativeSelect id="font" name="font" defaultValue={site.theme.font} className="w-full">
                    <NativeSelectOption value="sans">Modern sans</NativeSelectOption>
                    <NativeSelectOption value="serif">Classic serif</NativeSelectOption>
                    <NativeSelectOption value="rounded">Rounded</NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="brandColor">Brand color</FieldLabel>
                  <Input id="brandColor" name="brandColor" type="color" defaultValue={site.theme.brandColor} className="w-16 cursor-pointer p-1" />
                </Field>
              </div>
            </div>
            <SubmitButton variant="outline" className="self-start">
              Save settings
            </SubmitButton>
          </form>
        </MoreOptions>

        {/* Hidden, not locked, for accounts that can't connect a domain. */}
        {domain.show ? (
        <MoreOptions id="domain" icon={GlobeIcon} title="Custom domain" sub="Your own address, like join.yourbrand.com." defaultOpen={Boolean(site.customDomain)}>
          {site.customDomain && dns ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-medium break-all">{site.customDomain}</span>
                  <Badge variant={domainState.badge}>{domainState.label}</Badge>
                </span>
                <form action={removeDomainAction.bind(null, wid, siteId)}>
                  <SubmitButton variant="ghost" size="sm" className="text-destructive hover:text-destructive" confirm="Confirm remove">
                    Remove
                  </SubmitButton>
                </form>
              </div>
              {site.domainStatus !== "verified" ? (
                <div className="overflow-hidden rounded-xl ring-1 ring-ink/[0.07] dark:ring-white/[0.08] [&_tr>*:first-child]:pl-4 [&_tr>*:last-child]:pr-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-mono text-xs">{dns.type}</TableCell>
                        <TableCell className="font-mono text-xs">{dns.name}</TableCell>
                        <TableCell className="font-mono text-xs">{dns.value}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : null}
              {site.domainStatus === "verified" ? (
                <p className="text-xs text-muted-foreground">Your website now opens at this address. Nothing to publish again.</p>
              ) : site.domainStatus === "error" ? (
                <p className="text-xs text-muted-foreground">
                  We couldn&apos;t confirm this domain. Check the record above is saved exactly like this where you bought the domain, then press Remove and connect it again.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{dns.note} A new record can take up to a day to show. We keep checking for you.</p>
              )}
            </>
          ) : (
            <form action={connectDomainAction.bind(null, wid, siteId)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field className="flex-1">
                <FieldLabel htmlFor="domain">Domain</FieldLabel>
                <Input id="domain" name="domain" placeholder="join.yourbrand.com" required />
              </Field>
              <SubmitButton variant="outline">Connect domain</SubmitButton>
            </form>
          )}
          {domainPartner ? <GetDomain wid={wid} partner={domainPartner.partner} /> : null}
        </MoreOptions>
        ) : null}

        <MoreOptions icon={Trash2Icon} title="Delete this funnel" sub="Pages go offline. Leads you collected stay in your Leads list.">
          <form action={deleteSiteAction.bind(null, wid, siteId)}>
            <SubmitButton variant="destructive" confirm="Yes, delete it">
              Delete funnel
            </SubmitButton>
          </form>
        </MoreOptions>
      </div>
    </>
  );
}
