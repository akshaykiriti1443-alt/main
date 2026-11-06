import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agencies, workspaces } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { recordPageView } from "@/server/leads";
import { findPublicPage, findPublicSite, siteVars, type Site } from "@/server/sites";
import { LandingSections } from "./LandingSections";
import { pageBackground } from "./palette";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="lp-notice">
      <div>
        <h1>{title}</h1>
        <p>{body}</p>
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

// Metadata, viewport and the page itself all need the same rows: look each up once per request.
const siteBySlug = cache((slug: string) => findPublicSite({ slug }));
const siteByDomain = cache((domain: string) => findPublicSite({ domain }));
const pageBySlug = cache((siteId: string, slug: string) => findPublicPage(siteId, slug));

export function publicSite(by: { slug: string } | { domain: string }) {
  return "slug" in by ? siteBySlug(by.slug) : siteByDomain(by.domain);
}

export async function loadPublicPage(site: Site | null, path: string[]) {
  if (!site) return null;
  const page = await pageBySlug(site.id, path.map(decodeURIComponent).join("/"));
  return page;
}

/** The browser's toolbar colour follows the page's own background. */
export function publicViewport(site: Site | null): Viewport {
  return site ? { themeColor: pageBackground(site.theme.style, site.theme.brandColor) } : {};
}

export async function publicMetadata(site: Site | null, path: string[]): Promise<Metadata> {
  const page = await loadPublicPage(site, path);
  if (!site || !page?.publishedContent) return { title: "Not found" };
  const sections = page.publishedContent.sections;
  const hero = sections.find((s) => s.type === "hero");
  const cta = sections.find((s) => s.type === "cta");
  // The browser tab shows the member's own headline, never the platform's name.
  const title = (hero?.type === "hero" && hero.headline) || (cta?.type === "cta" && cta.headline) || page.title;
  const description = (hero?.type === "hero" && hero.subheadline) || (cta?.type === "cta" && cta.body) || site.name;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
    robots: { index: true, follow: true },
  };
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

  // The document behind the page matches it, so overscroll and short pages never flash the app's colours.
  const pageBg = pageBackground(site.theme.style, site.theme.brandColor);
  // The app shell may have put <html> in dark mode for this visitor; the page decides its own scheme.
  const scheme = site.theme.style === "dark" || site.theme.style === "luxe" ? "dark" : "light";

  return (
    <>
      {pixelId ? <PixelScripts pixelId={pixelId} leadEventId={page.kind === "thankyou" && eid ? eid : null} /> : null}
      <style>{`html,body{background:${pageBg}}html{color-scheme:${scheme}!important}`}</style>
      <LandingSections
        standalone
        kind={page.kind}
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
