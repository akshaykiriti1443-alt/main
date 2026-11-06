import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { hostConfig, routeRequest } from "@/lib/hostRouting";

// Routes requests by hostname (the rules live in src/lib/hostRouting.ts):
//   marketing hosts (MARKETING_HOSTS)  -> the ScaleitAds agency site + /skool; app paths still work; www -> apex
//   app host (APP_URL, ROOT_DOMAIN, app.ROOT_DOMAIN, APP_HOSTS, localhost) -> the dashboard; "/" opens /app
//   <slug>.ROOT_DOMAIN                -> /s/<slug>/...
//   any other host                    -> /d/<host>/... (custom site domain), except app paths, which
//                                        serve the white-label dashboard for agencies.

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const cfg = hostConfig({
    appUrl: env.appUrl,
    rootDomain: process.env.ROOT_DOMAIN ?? env.rootDomain,
    appHosts: process.env.APP_HOSTS,
    marketingHosts: process.env.MARKETING_HOSTS,
  });
  const d = routeRequest(host, url.pathname, cfg);
  if (d.kind === "next") return NextResponse.next();
  const to = url.clone();
  to.pathname = d.pathname;
  if (d.kind === "rewrite") return NextResponse.rewrite(to);
  if (d.host) {
    to.hostname = d.host;
    const proto = req.headers.get("x-forwarded-proto");
    if (proto === "http" || proto === "https") to.protocol = `${proto}:`;
  }
  return NextResponse.redirect(to, d.status);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
