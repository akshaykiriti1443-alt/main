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
import { getSite, listPages, siteBaseUrl } from "@/server/sites";
import { dnsInstructions } from "@/server/domains";
import { hasFeature } from "@/server/plans";
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
import { cn } from "@/lib/utils";
import { Callout, Flash, MoreOptions, NextStep, PageHead, Panel } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Funnel" };

const KIND: Record<"optin" | "thankyou" | "sales" | "custom", { label: string; icon: LucideIcon; tone: string }> = {
  optin: { label: "Opt-in", icon: FileTextIcon, tone: "bg-accent text-primary" },
  thankyou: { label: "Thank-you", icon: MailCheckIcon, tone: "bg-gold-soft text-gold-foreground" },
  sales: { label: "Sales", icon: TagIcon, tone: "bg-success-soft text-success" },
  custom: { label: "Page", icon: FileTextIcon, tone: "bg-muted text-muted-foreground" },
};

const DOMAIN_TONE: Record<string, string> = {
  verified: "bg-success-soft text-success",
  error: "bg-destructive/10 text-destructive",
};

export default async function SitePage({ params, searchParams }: { params: Promise<{ wid: string; siteId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid, siteId } = await params;
  const { workspace } = await requireWorkspace(wid);
  const site = await getSite(wid, siteId);
  if (!site) notFound();
  const pages = await listPages(siteId);
  const base = siteBaseUrl(site);
  const dns = site.customDomain ? dnsInstructions(site.customDomain) : null;
  const changed = pages.some((p) => !p.publishedAt || p.updatedAt > p.publishedAt);
  const optin = pages.find((p) => p.kind === "optin");

  const publishForm = (className: string, variant?: "outline") => (
    <form action={publishSiteAction.bind(null, wid, siteId)} data-guide="site-publish" className="inline-flex">
      <SubmitButton size="lg" variant={variant} className={className} pendingText="Publishing…">
        {!site.published ? <RocketIcon data-icon="inline-start" /> : null}
        {site.published ? (changed ? "Publish changes" : "Republish") : "Publish"}
      </SubmitButton>
    </form>
  );

  return (
    <>
      <Link href={`/app/w/${wid}/sites`} className="-mb-4 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:no-underline">
        <ArrowLeftIcon className="size-4" aria-hidden />
        All funnels
      </Link>
      <PageHead
        lesson="1.3"
        stage="Stage 1"
        title={site.name}
        sub={site.published ? "Live and taking sign-ups. Edit any page, then publish the changes." : "A draft, so nobody can see it yet. Check your pages, then publish."}
        first={site.published ? undefined : "Open the opt-in page, make the headline sound like you, then press Publish."}
      />
      <Flash searchParams={await searchParams} />

      {site.published ? (
        <Card className="ring-success/25">
          <CardContent className="flex flex-col gap-4 @2xl/main:flex-row @2xl/main:items-center @2xl/main:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-success-soft text-success">
                <GlobeIcon className="size-5" aria-hidden />
                <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-success ring-2 ring-card" aria-hidden />
              </span>
              <div className="grid min-w-0 gap-1.5">
                <span className="font-heading text-lg font-semibold">Your funnel is live</span>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <a href={base} target="_blank" rel="noreferrer" className="min-w-0 truncate font-mono text-xs">
                    {base}
                  </a>
                  <CopyButton text={base} label="Copy link" />
                  <Button variant="ghost" size="sm" asChild>
                    <a href={base} target="_blank" rel="noreferrer">
                      View live <ExternalLinkIcon data-icon="inline-end" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <form action={unpublishSiteAction.bind(null, wid, siteId)}>
                <SubmitButton variant="ghost" size="sm" confirm="Yes, take it offline">
                  Unpublish
                </SubmitButton>
              </form>
              {publishForm("", changed ? undefined : "outline")}
            </div>
          </CardContent>
        </Card>
      ) : (
        <NextStep
          eyebrow="Lesson 1.3 · The scary button"
          title="Publish your funnel"
          body="It goes online the moment you press it. Nothing is permanent: change anything later and publish again."
          icon={RocketIcon}
        >
          {publishForm("bg-white text-[oklch(0.42_0.2_277)] shadow-[0_10px_24px_-10px_oklch(0.2_0.1_277/60%)] hover:bg-white/92 dark:text-[oklch(0.4_0.2_277)]")}
        </NextStep>
      )}
      {site.published && changed ? <Callout tone="tip">You have edits nobody can see yet. Press &quot;Publish changes&quot; to make them live.</Callout> : null}

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
        <ul className="flex flex-col gap-2">
          {pages.map((p) => {
            const k = KIND[p.kind];
            return (
              <li key={p.id} className="flex flex-col gap-3 rounded-xl border bg-background/60 p-3 sm:flex-row sm:items-center">
                <Link href={`/app/w/${wid}/sites/${siteId}/pages/${p.id}`} className="group flex min-w-0 flex-1 items-center gap-3 text-foreground hover:no-underline">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", k.tone)}>
                    <k.icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate font-medium group-hover:text-primary">{p.title}</span>
                    <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="h-5 px-2 text-[11px]">
                        {k.label}
                      </Badge>
                      <span className="truncate font-mono">/{p.slug}</span>
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

        <MoreOptions icon={PaletteIcon} title="Funnel settings" sub="Name, Skool link, free guide, style, font and colour.">
          <form action={updateSiteAction.bind(null, wid, siteId)} className="flex flex-col gap-5">
            <div className="grid gap-5 @2xl/main:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="name">Funnel name</FieldLabel>
                <Input id="name" name="name" defaultValue={site.name} />
              </Field>
              <Field>
                <FieldLabel htmlFor="skoolUrl">Skool group link</FieldLabel>
                <Input id="skoolUrl" name="skoolUrl" type="url" defaultValue={site.skoolUrl} placeholder="https://www.skool.com/your-group/about" />
                <FieldDescription>Every &quot;Join&quot; button on this funnel uses this link.</FieldDescription>
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
                </NativeSelect>
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

        <MoreOptions id="domain" icon={GlobeIcon} title="Custom domain" sub="Your own address, like join.yourbrand.com." defaultOpen={Boolean(site.customDomain)}>
          {!hasFeature(workspace.plan, "custom_domains") ? (
            <p className="text-sm text-muted-foreground">
              Use your own domain like join.yourbrand.com on the <Link href={`/app/w/${wid}/billing`}>Growth plan</Link>.
            </p>
          ) : site.customDomain && dns ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-medium break-all">{site.customDomain}</span>
                  <Badge variant="secondary" className={DOMAIN_TONE[site.domainStatus] ?? "bg-warning-soft text-warning"}>
                    {site.domainStatus}
                  </Badge>
                </span>
                <form action={removeDomainAction.bind(null, wid, siteId)}>
                  <SubmitButton variant="ghost" size="sm" className="text-destructive hover:text-destructive" confirm="Confirm remove">
                    Remove
                  </SubmitButton>
                </form>
              </div>
              {site.domainStatus !== "verified" ? (
                <div className="rounded-xl border">
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
              <p className="text-xs text-muted-foreground">{dns.note} DNS changes can take up to 24 hours. We check every few minutes.</p>
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
        </MoreOptions>

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
