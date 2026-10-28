import { NextResponse, type NextRequest } from "next/server";

// Routes requests by hostname:
//   app host (ROOT_DOMAIN, app.ROOT_DOMAIN, localhost) -> the dashboard as-is
//   <slug>.ROOT_DOMAIN                                -> /s/<slug>/...
//   any other host                                     -> /d/<host>/... (custom site domain),
//                                                         except app paths, which serve the
//                                                         white-label dashboard for agencies.

const APP_PATHS = ["/app", "/login", "/signup", "/logout", "/forgot", "/reset", "/legal", "/api", "/s/", "/d/", "/_next", "/favicon"];

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const root = (process.env.ROOT_DOMAIN ?? "").toLowerCase().split(":")[0];
  const appHosts = new Set(["localhost", "127.0.0.1", root, `app.${root}`, `www.${root}`].filter(Boolean));
  const extra = (process.env.APP_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (!host || appHosts.has(host) || extra.includes(host) || host.endsWith(".vercel.app")) return NextResponse.next();

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
