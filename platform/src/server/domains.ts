import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { enqueue } from "./jobs/queue";

// Custom domains are attached to the Vercel project that serves the platform.
// Customers add a CNAME (subdomain) or A record (apex) at their registrar.

const vercelConfigured = () => Boolean(env.vercelToken && env.vercelProjectId);
const team = () => (env.vercelTeamId ? `?teamId=${encodeURIComponent(env.vercelTeamId)}` : "");

async function vercel<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`https://api.vercel.com${path}${path.includes("?") ? team().replace("?", "&") : team()}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${env.vercelToken}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T };
}

export function normalizeDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) || d.length > 253) return null;
  if (env.rootDomain && (d === env.rootDomain || d.endsWith(`.${env.rootDomain}`))) return null;
  return d;
}

export function dnsInstructions(domain: string) {
  const apex = domain.split(".").length === 2;
  return apex
    ? { type: "A", name: "@", value: "76.76.21.21", note: "Add this A record at your domain registrar." }
    : { type: "CNAME", name: domain.split(".")[0], value: "cname.vercel-dns.com", note: "Add this CNAME record at your domain registrar." };
}

export async function connectDomain(workspaceId: string, siteId: string, rawDomain: string) {
  const domain = normalizeDomain(rawDomain);
  if (!domain) throw new Error("Enter a domain like join.yourbrand.com");
  const db = await getDb();
  const [owned] = await db.select({ id: sites.id }).from(sites).where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId))).limit(1);
  if (!owned) throw new Error("Site not found");
  const [taken] = await db.select({ id: sites.id }).from(sites).where(eq(sites.customDomain, domain)).limit(1);
  if (taken && taken.id !== siteId) throw new Error("That domain is already connected to another site.");
  if (vercelConfigured()) {
    const res = await vercel<{ error?: { message: string; code?: string } }>(`/v10/projects/${env.vercelProjectId}/domains`, {
      method: "POST",
      body: { name: domain },
    });
    if (!res.ok && res.data.error?.code !== "domain_already_in_use") {
      throw new Error(`Couldn't add the domain: ${res.data.error?.message ?? res.status}`);
    }
  }
  await db
    .update(sites)
    .set({ customDomain: domain, domainStatus: "pending", updatedAt: new Date() })
    .where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId)));
  await enqueue("domain.check", { siteId }, { runAt: new Date(Date.now() + 60_000) });
  return { domain, dns: dnsInstructions(domain) };
}

export async function removeDomain(workspaceId: string, siteId: string) {
  const db = await getDb();
  const [site] = await db.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId))).limit(1);
  if (!site?.customDomain) return;
  if (vercelConfigured()) {
    await vercel(`/v9/projects/${env.vercelProjectId}/domains/${site.customDomain}`, { method: "DELETE" });
  }
  await db.update(sites).set({ customDomain: null, domainStatus: "none" }).where(eq(sites.id, siteId));
}

export async function checkDomainJob(siteId: string) {
  const db = await getDb();
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site?.customDomain || site.domainStatus === "verified") return;
  if (!vercelConfigured()) {
    // Without a hosting API we can only trust the owner; mark verified for local use.
    await db.update(sites).set({ domainStatus: "verified" }).where(eq(sites.id, siteId));
    return;
  }
  const res = await vercel<{ verified?: boolean }>(`/v9/projects/${env.vercelProjectId}/domains/${site.customDomain}`);
  const config = await vercel<{ misconfigured?: boolean }>(`/v6/domains/${site.customDomain}/config`);
  if (res.ok && res.data.verified && config.ok && config.data.misconfigured === false) {
    await db.update(sites).set({ domainStatus: "verified" }).where(eq(sites.id, siteId));
    return;
  }
  // Keep checking for up to ~2 days (the job retries with backoff).
  const age = Date.now() - site.updatedAt.getTime();
  if (age < 48 * 3_600_000) await enqueue("domain.check", { siteId }, { runAt: new Date(Date.now() + 10 * 60_000) });
  else await db.update(sites).set({ domainStatus: "error" }).where(eq(sites.id, siteId));
}
