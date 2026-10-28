import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

// Routes requests by hostname:
//   app host (APP_URL, ROOT_DOMAIN, app.ROOT_DOMAIN, localhost, raw IPs) -> the dashboard as-is
//   <slug>.ROOT_DOMAIN                                                   -> /s/<slug>/...
//   any other host                                                        -> /d/<host>/... (custom site domain),
//                                                                            except app paths, which serve the
//                                                                            white-label dashboard for agencies.

const APP_PATHS = ["/app", "/login", "/signup", "/logout", "/forgot", "/reset", "/legal", "/api", "/s/", "/d/", "/_next", "/favicon"];

const hostnameOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

// "app.example.com:3000" -> "app.example.com", "[::1]:3000" -> "[::1]"
const stripPort = (host: string) => (host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0]);

// The "Network" address `next dev` prints, health checks and other raw IPs are never customer domains.
const isIpHost = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const host = stripPort((req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase());
  const root = stripPort(env.rootDomain.toLowerCase());
  const appHosts = new Set(["localhost", hostnameOf(env.appUrl), ...(root ? [root, `app.${root}`, `www.${root}`] : [])].filter(Boolean));
  const extra = (process.env.APP_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (!host || isIpHost(host) || appHosts.has(host) || extra.includes(host) || host.endsWith(".vercel.app")) return NextResponse.next();

  const rest = url.pathname === "/" ? "" : url.pathname;
  if (root && host.endsWith(`.${root}`)) {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next")) return NextResponse.next();
    const slug = host.slice(0, -(root.length + 1));
    return NextResponse.rewrite(new URL(`/s/${slug}${rest}${url.search}`, url));
  }
  if (APP_PATHS.some((p) => url.pathname.startsWith(p))) return NextResponse.next();
  return NextResponse.rewrite(new URL(`/d/${encodeURIComponent(host)}${rest}${url.search}`, url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
