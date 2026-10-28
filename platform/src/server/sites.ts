import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pages, sites, type PageKind } from "@/lib/db/schema";
import { pageContentSchema, siteThemeSchema, type PageContent, type Section, type SectionType, type SiteTheme } from "@/lib/db/types";
import { env } from "@/lib/env";
import { safeUrl } from "@/lib/html";
import { shortId, slugify, isUuid } from "@/lib/util";
import { RESERVED_SLUGS } from "./defaults";

export type Site = typeof sites.$inferSelect;
export type Page = typeof pages.$inferSelect;

export const newSectionId = () => shortId(8);

export function defaultSection(type: SectionType): Section {
  const id = newSectionId();
  switch (type) {
    case "hero":
      return {
        id,
        type,
        eyebrow: "Free guide",
        headline: "Get your first win in 7 days",
        subheadline: "A simple plan that fits a busy week.",
        bullets: ["Step-by-step plan", "Takes 10 minutes a day", "Free to start"],
        ctaText: "Send me the free guide",
        formTitle: "Where should I send it?",
        showForm: true,
        imageUrl: "",
      };
    case "benefits":
      return { id, type, title: "What you get", items: [{ title: "A clear plan", body: "Know what to do each day." }] };
    case "steps":
      return { id, type, title: "How it works", items: [{ title: "Grab the guide", body: "Enter your email below." }] };
    case "text":
      return { id, type, title: "About me", body: "Tell people who you help and why." };
    case "faq":
      return { id, type, title: "Questions", items: [{ q: "Is it free?", a: "Yes. The guide is free." }] };
    case "cta":
      return { id, type, headline: "Ready for the full system?", body: "Join the group today.", buttonText: "Join the group", buttonUrl: "{{skool_url}}" };
    case "form":
      return { id, type, title: "Get the free guide", body: "Enter your best email.", buttonText: "Send it to me", collectPhone: false };
    case "video":
      return { id, type, title: "Watch this first", url: "" };
  }
}

async function uniqueSiteSlug(name: string) {
  const db = await getDb();
  const base = slugify(name, 30);
  for (let i = 0; i < 8; i++) {
    const candidate = i === 0 && !RESERVED_SLUGS.has(base) ? base : `${base}-${shortId(4)}`;
    const [hit] = await db.select({ id: sites.id }).from(sites).where(eq(sites.slug, candidate)).limit(1);
    if (!hit) return candidate;
  }
  return `${base}-${shortId(8)}`;
}

export async function createSite(input: {
  workspaceId: string;
  name: string;
  theme?: Partial<SiteTheme>;
  skoolUrl?: string;
  leadMagnetName?: string;
  leadMagnetUrl?: string;
  pages: { slug: string; title: string; kind: PageKind; content: PageContent }[];
}) {
  const db = await getDb();
  const slug = await uniqueSiteSlug(input.name);
  return db.transaction(async (tx) => {
    const [site] = await tx
      .insert(sites)
      .values({
        workspaceId: input.workspaceId,
        name: input.name,
        slug,
        theme: siteThemeSchema.parse(input.theme ?? {}),
        skoolUrl: input.skoolUrl ?? "",
        leadMagnetName: input.leadMagnetName ?? "",
        leadMagnetUrl: input.leadMagnetUrl ?? "",
      })
      .returning();
    if (input.pages.length) {
      await tx.insert(pages).values(
        input.pages.map((p) => ({
          siteId: site.id,
          workspaceId: input.workspaceId,
          slug: p.slug,
          title: p.title,
          kind: p.kind,
          content: pageContentSchema.parse(p.content),
        })),
      );
    }
    return site;
  });
}

export async function listSites(workspaceId: string) {
  const db = await getDb();
  return db.select().from(sites).where(eq(sites.workspaceId, workspaceId)).orderBy(asc(sites.createdAt));
}

export async function getSite(workspaceId: string, siteId: string) {
  if (!isUuid(siteId)) return null;
  const db = await getDb();
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId)))
    .limit(1);
  return site ?? null;
}

export async function listPages(siteId: string) {
  const db = await getDb();
  return db.select().from(pages).where(eq(pages.siteId, siteId)).orderBy(asc(pages.createdAt));
}

export async function getPage(workspaceId: string, pageId: string) {
  if (!isUuid(pageId)) return null;
  const db = await getDb();
  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.workspaceId, workspaceId)))
    .limit(1);
  return page ?? null;
}

export async function savePageContent(workspaceId: string, pageId: string, content: unknown, title?: string) {
  const parsed = pageContentSchema.parse(content);
  const db = await getDb();
  await db
    .update(pages)
    .set({ content: parsed, ...(title ? { title } : {}), updatedAt: new Date() })
    .where(and(eq(pages.id, pageId), eq(pages.workspaceId, workspaceId)));
  return parsed;
}

export async function publishSite(workspaceId: string, siteId: string) {
  const db = await getDb();
  const site = await getSite(workspaceId, siteId);
  if (!site) throw new Error("Site not found");
  const all = await listPages(siteId);
  await db.transaction(async (tx) => {
    for (const p of all) {
      await tx.update(pages).set({ publishedContent: p.content, publishedAt: new Date() }).where(eq(pages.id, p.id));
    }
    await tx.update(sites).set({ published: true, updatedAt: new Date() }).where(eq(sites.id, siteId));
  });
}

export async function unpublishSite(workspaceId: string, siteId: string) {
  const db = await getDb();
  await db
    .update(sites)
    .set({ published: false, updatedAt: new Date() })
    .where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId)));
}

export async function updateSite(
  workspaceId: string,
  siteId: string,
  patch: { name?: string; theme?: SiteTheme; skoolUrl?: string; leadMagnetName?: string; leadMagnetUrl?: string },
) {
  const db = await getDb();
  await db
    .update(sites)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId)));
}

export async function deleteSite(workspaceId: string, siteId: string) {
  const db = await getDb();
  await db.delete(sites).where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId)));
}

export async function addPage(workspaceId: string, siteId: string, input: { title: string; slug: string; kind: PageKind }) {
  const site = await getSite(workspaceId, siteId);
  if (!site) throw new Error("Site not found");
  const slug = input.slug === "" ? "" : slugify(input.slug, 40);
  if (RESERVED_SLUGS.has(slug)) throw new Error("That page address is reserved. Pick another.");
  const db = await getDb();
  const content: PageContent =
    input.kind === "thankyou"
      ? { sections: [defaultSection("cta")] }
      : { sections: [defaultSection("hero"), defaultSection("benefits"), defaultSection("form")] };
  const [page] = await db
    .insert(pages)
    .values({ siteId, workspaceId, title: input.title, slug, kind: input.kind, content })
    .returning();
  return page;
}

export async function deletePage(workspaceId: string, pageId: string) {
  const db = await getDb();
  await db.delete(pages).where(and(eq(pages.id, pageId), eq(pages.workspaceId, workspaceId)));
}

// ---------------------------------------------------------------------------
// Public lookups (used by the page renderer)
// ---------------------------------------------------------------------------

export async function findPublicSite(by: { slug?: string; domain?: string }) {
  const db = await getDb();
  // Custom domains serve only after verification, so nobody can squat on a domain.
  const where = by.domain
    ? and(eq(sites.customDomain, by.domain.toLowerCase()), eq(sites.domainStatus, "verified"))
    : eq(sites.slug, (by.slug ?? "").toLowerCase());
  const [site] = await db.select().from(sites).where(where).limit(1);
  return site ?? null;
}

export async function findPublicPage(siteId: string, pageSlug: string) {
  const db = await getDb();
  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.siteId, siteId), eq(pages.slug, pageSlug)))
    .limit(1);
  return page ?? null;
}

export async function thankYouPageFor(siteId: string) {
  const db = await getDb();
  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.siteId, siteId), eq(pages.kind, "thankyou")))
    .limit(1);
  return page ?? null;
}

export function sitePublicPath(site: Pick<Site, "slug">, pageSlug = "") {
  return `/s/${site.slug}${pageSlug ? `/${pageSlug}` : ""}`;
}

// Absolute base URL where a site is served.
export function siteBaseUrl(site: Pick<Site, "slug" | "customDomain" | "domainStatus">): string {
  if (site.customDomain && site.domainStatus === "verified") return `https://${site.customDomain}`;
  if (env.rootDomain) return `${env.appUrl.startsWith("https") ? "https" : "http"}://${site.slug}.${env.rootDomain}`;
  return `${env.appUrl}/s/${site.slug}`;
}

// Links stored as "/guide" mean "a page on this site"; full URLs pass through.
export function resolveSiteLink(site: Pick<Site, "slug" | "customDomain" | "domainStatus">, link: string): string {
  if (!link) return "";
  if (link.startsWith("/")) return `${siteBaseUrl(site)}${link}`;
  return safeUrl(link);
}

export function siteVars(site: Site): Record<string, string> {
  return {
    skool_url: safeUrl(site.skoolUrl),
    lead_magnet_url: resolveSiteLink(site, site.leadMagnetUrl),
    lead_magnet_name: site.leadMagnetName,
    site_url: siteBaseUrl(site),
  };
}
