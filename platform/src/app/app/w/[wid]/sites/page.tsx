import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, pages } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { listSites, siteBaseUrl } from "@/server/sites";
import { PLANS } from "@/server/plans";
import { createSiteAction } from "@/actions/sites";
import { Empty, Flash, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/client";

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
          <Link className="btn" href={`/app/w/${wid}/launch?new=1`}>
            Build one with AI
          </Link>
        }
      />
      <Flash searchParams={await searchParams} />
      {sites.length === 0 ? (
        <Empty
          title="No funnels yet"
          body="The fastest start is the AI launch kit. It builds the whole funnel for you."
          action={
            <Link className="btn btn-primary" href={`/app/w/${wid}/launch`}>
              Start the AI launch kit
            </Link>
          }
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Funnel</th>
                <th>Status</th>
                <th>Pages</th>
                <th>Leads</th>
                <th>Live link</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => {
                const url = siteBaseUrl(s);
                return (
                  <tr key={s.id} className="clickable">
                    <td>
                      <Link href={`/app/w/${wid}/sites/${s.id}`}>
                        <strong>{s.name}</strong>
                      </Link>
                      {s.customDomain ? <div className="tiny muted">{s.customDomain}</div> : null}
                    </td>
                    <td>{s.published ? <span className="badge badge-good">Live</span> : <span className="badge">Draft</span>}</td>
                    <td className="num">{counts.find((c) => c.siteId === s.id)?.pages ?? 0}</td>
                    <td className="num">{leads.find((l) => l.siteId === s.id)?.n ?? 0}</td>
                    <td className="small">
                      {s.published ? (
                        <a href={url} target="_blank" rel="noreferrer">
                          Open ↗
                        </a>
                      ) : (
                        <span className="muted">Publish first</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {sites.length < limit ? (
        <form action={createSiteAction.bind(null, wid)} className="card row">
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="name">Start a blank funnel</label>
            <input id="name" name="name" placeholder="Free workout plan funnel" />
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <SubmitButton className="btn">Create funnel</SubmitButton>
          </div>
        </form>
      ) : null}
    </>
  );
}
