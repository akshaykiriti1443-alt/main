import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agencies, workspaces } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { recordPageView } from "@/server/leads";
import { findPublicPage, siteVars, type Site } from "@/server/sites";
import { LandingSections } from "./LandingSections";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="lp-notice">
      <div>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>{title}</h1>
        <p style={{ color: "#556079" }}>{body}</p>
      </div>
    </div>
  );
}

const PIXEL_ID = /^\d{5,20}$/;

function PixelScripts({ pixelId, leadEventId }: { pixelId: string; leadEventId: string | null }) {
  const base = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(pixelId)});fbq('track','PageView');`;
  const lead = leadEventId ? `fbq('track','Lead',{},{eventID:${JSON.stringify(leadEventId)}});` : "";
  return <script dangerouslySetInnerHTML={{ __html: base + lead }} />;
}

export async function loadPublicPage(site: Site | null, path: string[]) {
  if (!site) return null;
  const page = await findPublicPage(site.id, path.map(decodeURIComponent).join("/"));
  return page;
}

export async function publicMetadata(site: Site | null, path: string[]): Promise<Metadata> {
  const page = await loadPublicPage(site, path);
  if (!site || !page?.publishedContent) return { title: "Not found" };
  const hero = page.publishedContent.sections.find((s) => s.type === "hero");
  const title = hero && hero.type === "hero" ? hero.headline : page.title;
  const description = hero && hero.type === "hero" ? hero.subheadline : site.name;
  return { title, description, openGraph: { title, description }, robots: { index: true, follow: true } };
}

export async function PublicPage({ site, path, searchParams }: { site: Site | null; path: string[]; searchParams: Record<string, string | string[] | undefined> }) {
  if (!site) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ workspace: workspaces, agency: agencies })
    .from(workspaces)
    .innerJoin(agencies, eq(agencies.id, workspaces.agencyId))
    .where(eq(workspaces.id, site.workspaceId))
    .limit(1);
  if (!row) notFound();
  if (row.workspace.status === "paused" || row.agency.status === "paused") {
    return <Notice title="This page is unavailable" body="Please check back soon." />;
  }
  if (!site.published) return <Notice title="This page isn't live yet" body="The owner hasn't published it." />;

  const page = await loadPublicPage(site, path);
  if (!page || !page.publishedContent) notFound();

  const h = await headers();
  await recordPageView({
    workspaceId: site.workspaceId,
    siteId: site.id,
    pageId: page.id,
    userAgent: h.get("user-agent"),
    referrer: h.get("referer"),
  });

  const pixelId = row.workspace.settings.metaPixelId && PIXEL_ID.test(row.workspace.settings.metaPixelId) ? row.workspace.settings.metaPixelId : null;
  const eid = typeof searchParams.eid === "string" ? searchParams.eid.replace(/[^\w-]/g, "").slice(0, 64) : "";
  const error = typeof searchParams.error === "string" ? searchParams.error.slice(0, 200) : undefined;
  const businessName = row.workspace.settings.businessName || row.workspace.name;
  const poweredBy = row.agency.isPlatform ? `Built with ${env.platformName}` : row.agency.brand.name ? `Built with ${row.agency.brand.name}` : "";

  return (
    <>
      {pixelId ? <PixelScripts pixelId={pixelId} leadEventId={page.kind === "thankyou" && eid ? eid : null} /> : null}
      <LandingSections
        sections={page.publishedContent.sections}
        theme={site.theme}
        vars={siteVars(site)}
        businessName={businessName}
        poweredBy={poweredBy}
        form={{ action: "/api/public/lead", pageId: page.id, eventId: crypto.randomUUID(), error }}
      />
    </>
  );
}
