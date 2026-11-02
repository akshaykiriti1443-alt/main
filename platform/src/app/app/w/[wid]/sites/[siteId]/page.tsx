import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLinkIcon, PencilIcon } from "lucide-react";
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
import { Callout, Flash, PageHead, Panel } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const KIND_LABEL = { optin: "Opt-in", thankyou: "Thank-you", sales: "Sales", custom: "Page" } as const;

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

  return (
    <>
      <PageHead
        eyebrow="Funnel"
        title={site.name}
        sub={
          site.published ? (
            <>
              Live at{" "}
              <a href={base} target="_blank" rel="noreferrer" className="break-all">
                {base}
              </a>
            </>
          ) : (
            "Draft. Publish to put your pages online."
          )
        }
        actions={
          <>
            {site.published ? <CopyButton text={base} label="Copy link" /> : null}
            {site.published ? (
              <form action={unpublishSiteAction.bind(null, wid, siteId)}>
                <SubmitButton variant="outline">Unpublish</SubmitButton>
              </form>
            ) : null}
            <form action={publishSiteAction.bind(null, wid, siteId)}>
              <SubmitButton>{site.published ? (changed ? "Publish changes" : "Republish") : "Publish"}</SubmitButton>
            </form>
          </>
        }
      />
      <Flash searchParams={await searchParams} />
      {site.published && changed ? <Callout tone="info">You have unpublished edits. Click &quot;Publish changes&quot; to make them live.</Callout> : null}

      <Panel title="Pages">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Page</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/app/w/${wid}/sites/${siteId}/pages/${p.id}`} className="font-medium text-foreground hover:text-primary">
                    {p.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{KIND_LABEL[p.kind]}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">/{p.slug}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1.5">
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <form action={addPageAction.bind(null, wid, siteId)} className="mt-1 grid gap-3 border-t pt-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
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
            <NativeSelect id="kind" name="kind" defaultValue="custom" className="w-full sm:w-36">
              <NativeSelectOption value="custom">Page</NativeSelectOption>
              <NativeSelectOption value="sales">Sales page</NativeSelectOption>
              <NativeSelectOption value="thankyou">Thank-you</NativeSelectOption>
            </NativeSelect>
          </Field>
          <SubmitButton variant="outline">Add page</SubmitButton>
        </form>
      </Panel>

      <form action={updateSiteAction.bind(null, wid, siteId)}>
        <Panel title="Funnel settings" action={<SubmitButton variant="outline">Save settings</SubmitButton>}>
          <div className="grid gap-5 md:grid-cols-2">
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
        </Panel>
      </form>

      <div id="domain" className="scroll-mt-6">
        <Panel title="Custom domain">
          {!hasFeature(workspace.plan, "custom_domains") ? (
            <p className="text-muted-foreground">
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
                <div className="rounded-lg border">
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
        </Panel>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <h3 className="font-medium">Delete this funnel</h3>
            <p className="text-muted-foreground">Pages go offline. Leads you collected stay in your Leads list.</p>
          </div>
          <form action={deleteSiteAction.bind(null, wid, siteId)}>
            <SubmitButton variant="destructive" confirm="Yes, delete it">
              Delete funnel
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
