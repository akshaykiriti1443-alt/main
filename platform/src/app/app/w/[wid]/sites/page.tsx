import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { ExternalLinkIcon, GlobeIcon, SparklesIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { contacts, pages } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { listSites, siteBaseUrl } from "@/server/sites";
import { PLANS } from "@/server/plans";
import { createSiteAction } from "@/actions/sites";
import { Empty, Flash, PageHead, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function SitesPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace } = await requireWorkspace(wid);
  const sites = await listSites(wid);
  const db = await getDb();
  const counts = await db
    .select({
      siteId: pages.siteId,
      pages: sql<number>`count(*)::int`,
    })
    .from(pages)
    .where(eq(pages.workspaceId, wid))
    .groupBy(pages.siteId);
  const leads = await db
    .select({ siteId: contacts.sourceRef, n: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, wid), eq(contacts.source, "landing_page")))
    .groupBy(contacts.sourceRef);
  const limit = PLANS[workspace.plan].maxSites;

  return (
    <>
      <PageHead
        title="Funnels & pages"
        sub={`Each funnel has an opt-in page, a thank-you page that sends people to Skool, and any extra pages you add. Your plan includes ${limit} funnels.`}
        actions={
          <Button variant={sites.length === 0 ? "outline" : "default"} asChild>
            <Link href={`/app/w/${wid}/launch?new=1`}>
              <SparklesIcon data-icon="inline-start" />
              Build one with AI
            </Link>
          </Button>
        }
      />
      <Flash searchParams={await searchParams} />
      {sites.length === 0 ? (
        <Empty
          icon={GlobeIcon}
          title="No funnels yet"
          body="The fastest start is the AI launch kit. It builds the whole funnel for you."
          action={
            <Button asChild>
              <Link href={`/app/w/${wid}/launch`}>
                <SparklesIcon data-icon="inline-start" />
                Start the AI launch kit
              </Link>
            </Button>
          }
        />
      ) : (
        <Panel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funnel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Pages</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Live link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((s) => {
                const url = siteBaseUrl(s);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link href={`/app/w/${wid}/sites/${s.id}`} className="font-medium text-foreground hover:text-primary">
                        {s.name}
                      </Link>
                      {s.customDomain ? <div className="text-xs text-muted-foreground">{s.customDomain}</div> : null}
                    </TableCell>
                    <TableCell>
                      {s.published ? (
                        <Badge variant="secondary" className="bg-success-soft text-success">
                          Live
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Draft</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{counts.find((c) => c.siteId === s.id)?.pages ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{leads.find((l) => l.siteId === s.id)?.n ?? 0}</TableCell>
                    <TableCell className="text-right">
                      {s.published ? (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={url} target="_blank" rel="noreferrer">
                            Open
                            <ExternalLinkIcon data-icon="inline-end" />
                          </a>
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">Publish first</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>
      )}
      {sites.length < limit ? (
        <Panel>
          <form action={createSiteAction.bind(null, wid)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field className="flex-1">
              <FieldLabel htmlFor="name">Start a blank funnel</FieldLabel>
              <Input id="name" name="name" placeholder="Free workout plan funnel" />
            </Field>
            <SubmitButton variant="outline">Create funnel</SubmitButton>
          </form>
        </Panel>
      ) : null}
    </>
  );
}
