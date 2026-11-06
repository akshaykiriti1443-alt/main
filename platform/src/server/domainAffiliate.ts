import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { platformSettings } from "@/lib/db/schema";
import { isPublicHttpsUrl } from "@/lib/html";

// "Get a domain": members buy their domain through the platform owner's affiliate link
// (Namecheap, Hostinger, GoDaddy…), so the owner earns the registrar's commission. The owner sets
// the link once in Admin. A {domain} in the link is replaced with the name the member searched for.

const KEY = "domain_affiliate";
export type DomainAffiliate = { url: string; partner: string };

export async function getDomainAffiliate(): Promise<DomainAffiliate | null> {
  const db = await getDb();
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, KEY)).limit(1);
  const v = row?.value as Partial<DomainAffiliate> | undefined;
  if (v?.url && isPublicHttpsUrl(v.url.replace(/\{domain\}/g, "example.com"))) return { url: v.url, partner: v.partner || "our domain partner" };
  const envUrl = process.env.DOMAIN_AFFILIATE_URL ?? "";
  if (envUrl && isPublicHttpsUrl(envUrl.replace(/\{domain\}/g, "example.com"))) return { url: envUrl, partner: process.env.DOMAIN_AFFILIATE_PARTNER || "our domain partner" };
  return null;
}

export async function setDomainAffiliate(input: DomainAffiliate | null) {
  const db = await getDb();
  const value = input ? { url: input.url.trim(), partner: input.partner.trim().slice(0, 60) } : {};
  await db
    .insert(platformSettings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
}

/** A domain idea typed by a member, tidied into something a registrar search understands. */
export function cleanDomainIdea(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9.-]+/g, "")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 63);
}

/** Where the member goes: the affiliate link, with their search filled in when the link supports it. */
export function affiliateTarget(a: DomainAffiliate, idea: string): string {
  const d = cleanDomainIdea(idea);
  return a.url.includes("{domain}") ? a.url.replace(/\{domain\}/g, encodeURIComponent(d)) : a.url;
}
