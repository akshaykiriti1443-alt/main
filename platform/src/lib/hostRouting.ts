// Which site a request belongs to, decided from its hostname and path. Pure (no Next.js imports)
// so it runs in the Edge middleware and in unit tests alike. See src/middleware.ts and DEPLOY.md.
//
//   marketing hosts (MARKETING_HOSTS, e.g. scaleitads.com, www.scaleitads.com)
//       www.<apex>  -> 308 to <apex>, same path
//       /home       -> 308 to /  (the old GoHighLevel URL of the home page)
//       everything else is served as is: "/" and the agency pages (the (scaleitads) route group),
//       /skool, and the app paths (/app, /login, /signup, /join, /api, ...) keep working. That
//       includes what /apply uses on its own stack, same origin: POST /api/scaleitads/apply, the
//       embedded booking page /b/<workspace>/<calendar> and its manage links /booking/<token>.
//   app hosts (APP_URL's host, ROOT_DOMAIN, app.ROOT_DOMAIN, www.ROOT_DOMAIN, APP_HOSTS, localhost)
//       "/"         -> 307 to /app (which sends logged-out visitors to /login)
//       agency pages (/home, /watch, /privacy, /terms, /skool, /apply, /booked, /not-yet)
//                   -> 308 to the marketing site when MARKETING_HOSTS is set, so each page has one URL;
//                      on localhost they are served right here (/home previews the agency home page).
//   raw IPs and *.vercel.app (health checks, previews): served as is, "/" shows the agency home page.
//   <slug>.ROOT_DOMAIN -> rewrite to /s/<slug>/...   (members' sites, unchanged)
//   any other host     -> rewrite to /d/<host>/...   (members' custom domains, unchanged),
//                         except app paths, which serve the white-label dashboard for agencies.

export const APP_PATHS = ["/app", "/login", "/signup", "/join", "/go/", "/u/", "/b/", "/booking/", "/logout", "/forgot", "/reset", "/verify", "/legal", "/api", "/s/", "/d/", "/_next", "/favicon"];

/** Pages of the agency site (besides "/") that live on the marketing host. */
export const AGENCY_PATHS = ["/home", "/watch", "/privacy", "/terms", "/skool", "/apply", "/booked", "/not-yet"];

export type HostConfig = {
  /** Hostnames that serve the dashboard (no port). */
  appHosts: string[];
  /** Hostnames that serve the agency site; the first one without "www." is canonical. */
  marketingHosts: string[];
  /** Members' sites live at <slug>.<rootDomain>. Empty = /s/<slug> paths only. */
  rootDomain: string;
};

export type RouteDecision =
  | { kind: "next" }
  | { kind: "rewrite"; pathname: string }
  | { kind: "redirect"; pathname: string; status: 307 | 308; host?: string };

export const hostnameOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

// "app.example.com:3000" -> "app.example.com", "[::1]:3000" -> "[::1]"
export const stripPort = (host: string) => (host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0]);

// The "Network" address `next dev` prints, health checks and other raw IPs are never customer domains.
const isIpHost = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");

export const splitHosts = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((h) => stripPort(h.trim().toLowerCase()))
    .filter(Boolean);

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);
export const isAgencyPath = (pathname: string) => AGENCY_PATHS.some((p) => under(pathname, p));

/** The canonical marketing hostname: the first configured one that isn't a www. alias. */
export function marketingApex(cfg: HostConfig) {
  return cfg.marketingHosts.find((h) => !h.startsWith("www.")) ?? cfg.marketingHosts[0] ?? "";
}

/** Build the config from the environment (read on every request, so tests can change it). */
export function hostConfig(env: { appUrl: string; rootDomain?: string; appHosts?: string; marketingHosts?: string }): HostConfig {
  const root = stripPort((env.rootDomain ?? "").trim().toLowerCase());
  const marketingHosts = splitHosts(env.marketingHosts);
  const appHosts = ["localhost", hostnameOf(env.appUrl), ...(root ? [root, `app.${root}`, `www.${root}`] : []), ...splitHosts(env.appHosts)].filter(Boolean);
  return { appHosts: [...new Set(appHosts)], marketingHosts, rootDomain: root };
}

export function routeRequest(rawHost: string, pathname: string, cfg: HostConfig): RouteDecision {
  const host = stripPort(rawHost.toLowerCase());
  if (!host) return { kind: "next" };

  // 1. The agency site. Checked first: with ROOT_DOMAIN=scaleitads.com the apex is also an app host.
  if (cfg.marketingHosts.includes(host)) {
    if (host.startsWith("www.") && cfg.marketingHosts.includes(host.slice(4))) return { kind: "redirect", host: host.slice(4), pathname, status: 308 };
    if (pathname === "/home") return { kind: "redirect", pathname: "/", status: 308 };
    return { kind: "next" };
  }

  // 2. Health checks and preview deployments: everything as is.
  if (isIpHost(host) || host.endsWith(".vercel.app")) return { kind: "next" };

  // 3. The app.
  if (cfg.appHosts.includes(host)) {
    if (pathname === "/") return { kind: "redirect", pathname: "/app", status: 307 };
    if (isAgencyPath(pathname)) {
      const apex = marketingApex(cfg);
      if (apex && host !== "localhost") return { kind: "redirect", host: apex, pathname: pathname === "/home" ? "/" : pathname, status: 308 };
      if (pathname === "/home") return { kind: "rewrite", pathname: "/" };
    }
    return { kind: "next" };
  }

  // 4. Members' sites on <slug>.ROOT_DOMAIN.
  const rest = pathname === "/" ? "" : pathname;
  if (cfg.rootDomain && host.endsWith(`.${cfg.rootDomain}`)) {
    if (pathname.startsWith("/api/") || pathname.startsWith("/_next")) return { kind: "next" };
    const slug = host.slice(0, -(cfg.rootDomain.length + 1));
    return { kind: "rewrite", pathname: `/s/${slug}${rest}` };
  }

  // 5. Members' custom domains (and agencies' white-label app domains).
  if (APP_PATHS.some((p) => pathname.startsWith(p))) return { kind: "next" };
  return { kind: "rewrite", pathname: `/d/${encodeURIComponent(host)}${rest}` };
}
