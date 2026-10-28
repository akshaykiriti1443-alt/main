import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agencies, sites } from "@/lib/db/schema";
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
  if (isReservedHost(d)) return null;
  return d;
}

// Hosts that belong to the platform itself can never be claimed by a customer.
export function isReservedHost(domain: string): boolean {
  const d = domain.toLowerCase();
  const appHost = (() => {
    try {
      return new URL(env.appUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const extra = (process.env.APP_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const root = env.rootDomain.toLowerCase().split(":")[0];
  if (d === "localhost" || d.endsWith(".localhost") || d.endsWith(".vercel.app")) return true;
  if (/^\d+$/.test(d.split(".").pop() ?? "")) return true; // raw IPs are never customer domains
  if (appHost && (d === appHost || d.endsWith(`.${appHost}`))) return true;
  if (root && (d === root || d.endsWith(`.${root}`))) return true;
  return extra.includes(d);
}

/** True when any site or agency (other than the given one) already uses the domain. */
export async function domainInUse(domain: string, except: { siteId?: string; agencyId?: string } = {}) {
  const db = await getDb();
  const siteHit = await db
    .select({ id: sites.id })
    .from(sites)
    .where(except.siteId ? and(eq(sites.customDomain, domain), ne(sites.id, except.siteId)) : eq(sites.customDomain, domain))
    .limit(1);
  if (siteHit.length) return true;
  const agencyHit = await db
    .select({ id: agencies.id })
    .from(agencies)
    .where(except.agencyId ? and(eq(agencies.appDomain, domain), ne(agencies.id, except.agencyId)) : eq(agencies.appDomain, domain))
    .limit(1);
  return agencyHit.length > 0;
}

/** Attach a domain to our Vercel project. Succeeds only if the project ends up owning it. */
export async function attachToHosting(domain: string) {
  if (!vercelConfigured()) return;
  const res = await vercel<{ error?: { message: string; code?: string } }>(`/v10/projects/${env.vercelProjectId}/domains`, {
    method: "POST",
    body: { name: domain },
  });
  if (res.ok) return;
  // Already attached to *this* project is fine; attached anywhere else is not.
  const mine = await vercel<{ name?: string }>(`/v9/projects/${env.vercelProjectId}/domains/${domain}`);
  if (!mine.ok || mine.data.name !== domain) {
    throw new Error(`Couldn't add the domain: ${res.data.error?.message ?? res.status}`);
  }
}

export async function detachFromHosting(domain: string) {
  if (!vercelConfigured()) return;
  await vercel(`/v9/projects/${env.vercelProjectId}/domains/${domain}`, { method: "DELETE" });
}

/** Verified = Vercel confirms ownership and DNS. Without a hosting API we only trust it outside production. */
async function isDomainVerified(domain: string): Promise<boolean | "unknown"> {
  if (!vercelConfigured()) return env.isProd ? "unknown" : true;
  const res = await vercel<{ verified?: boolean }>(`/v9/projects/${env.vercelProjectId}/domains/${domain}`);
  const config = await vercel<{ misconfigured?: boolean }>(`/v6/domains/${domain}/config`);
  return Boolean(res.ok && res.data.verified && config.ok && config.data.misconfigured === false);
}

export function dnsInstructions(domain: string) {
  const labels = domain.split(".");
  return labels.length === 2
    ? { type: "A", name: "@", value: "76.76.21.21", note: "Add this A record at your domain registrar." }
    : { type: "CNAME", name: labels.slice(0, -2).join("."), value: "cname.vercel-dns.com", note: "Add this CNAME record at your domain registrar." };
}

export async function connectDomain(workspaceId: string, siteId: string, rawDomain: string) {
  const domain = normalizeDomain(rawDomain);
  if (!domain) throw new Error("Enter a domain like join.yourbrand.com");
  const db = await getDb();
  const [owned] = await db.select({ id: sites.id }).from(sites).where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId))).limit(1);
  if (!owned) throw new Error("Site not found");
  if (await domainInUse(domain, { siteId })) throw new Error("That domain is already connected to another account.");
  await attachToHosting(domain);
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
  await detachFromHosting(site.customDomain);
  await db.update(sites).set({ customDomain: null, domainStatus: "none" }).where(eq(sites.id, siteId));
}

export async function checkDomainJob(siteId: string) {
  const db = await getDb();
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site?.customDomain || site.domainStatus === "verified") return;
  const verified = await isDomainVerified(site.customDomain);
  if (verified === true) {
    await db.update(sites).set({ domainStatus: "verified" }).where(eq(sites.id, siteId));
    return;
  }
  if (verified === "unknown") {
    await db.update(sites).set({ domainStatus: "error" }).where(eq(sites.id, siteId));
    return;
  }
  // Keep checking for up to ~2 days.
  const age = Date.now() - site.updatedAt.getTime();
  if (age < 48 * 3_600_000) await enqueue("domain.check", { siteId }, { runAt: new Date(Date.now() + 10 * 60_000) });
  else await db.update(sites).set({ domainStatus: "error" }).where(eq(sites.id, siteId));
}

// ---------------------------------------------------------------------------
// Agency white-label app domains
// ---------------------------------------------------------------------------

export async function setAgencyAppDomain(agencyId: string, rawDomain: string | null) {
  const db = await getDb();
  const [agency] = await db.select().from(agencies).where(and(eq(agencies.id, agencyId), eq(agencies.isPlatform, false))).limit(1);
  if (!agency) throw new Error("Agency not found");
  const domain = rawDomain ? normalizeDomain(rawDomain) : null;
  if (rawDomain && !domain) throw new Error("Enter a domain you own, like app.youragency.com");
  if (domain === agency.appDomain) {
    // Saving the same domain after a failed check starts a fresh check.
    if (domain && agency.appDomainStatus === "error") {
      await attachToHosting(domain);
      await db.update(agencies).set({ appDomainStatus: "pending" }).where(eq(agencies.id, agencyId));
      await enqueue("agency_domain.check", { agencyId, startedAt: Date.now() }, { runAt: new Date(Date.now() + 30_000) });
    }
    return;
  }
  if (domain) {
    if (agency.plan !== "agency") throw new Error("Activate the Agency plan before adding an app domain.");
    if (await domainInUse(domain, { agencyId })) throw new Error("That domain is already in use.");
    await attachToHosting(domain);
  }
  if (agency.appDomain) await detachFromHosting(agency.appDomain).catch(() => undefined);
  await db
    .update(agencies)
    .set({ appDomain: domain, appDomainStatus: domain ? "pending" : "none" })
    .where(eq(agencies.id, agencyId));
  if (domain) await enqueue("agency_domain.check", { agencyId, startedAt: Date.now() }, { runAt: new Date(Date.now() + 30_000) });
}

export async function checkAgencyDomainJob(agencyId: string, startedAt: number) {
  const db = await getDb();
  const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId)).limit(1);
  if (!agency?.appDomain || agency.appDomainStatus === "verified") return;
  const verified = await isDomainVerified(agency.appDomain);
  if (verified === true) {
    await db.update(agencies).set({ appDomainStatus: "verified" }).where(eq(agencies.id, agencyId));
  } else if (verified === "unknown" || Date.now() - startedAt > 48 * 3_600_000) {
    await db.update(agencies).set({ appDomainStatus: "error" }).where(eq(agencies.id, agencyId));
  } else {
    await enqueue("agency_domain.check", { agencyId, startedAt }, { runAt: new Date(Date.now() + 10 * 60_000) });
  }
}
