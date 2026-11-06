import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/ip";
import { isUuid } from "@/lib/util";
import { logActivity } from "@/server/activity";
import { affiliateTarget, cleanDomainIdea, getDomainAffiliate } from "@/server/domainAffiliate";
import { takeRateLimit } from "@/server/rateLimit";

// "Get a domain": counts the click for the platform owner, then sends the member to the owner's
// domain partner through the affiliate link (so the owner earns the commission). It only ever
// redirects to the configured affiliate link, never to a URL from the request.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const affiliate = await getDomainAffiliate();
  if (!affiliate) return NextResponse.redirect(env.appUrl, 302);
  const idea = cleanDomainIdea(req.nextUrl.searchParams.get("q") ?? "");
  const wid = req.nextUrl.searchParams.get("w") ?? "";
  const ip = clientIp(req.headers) ?? "unknown";
  if (isUuid(wid) && (await takeRateLimit(`domain-click:${ip}`, [{ seconds: 60, max: 10 }]))) {
    const db = await getDb();
    const [ws] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, wid)).limit(1);
    if (ws) await logActivity({ workspaceId: ws.id, type: "domain_affiliate_click", data: { idea } });
  }
  return NextResponse.redirect(affiliateTarget(affiliate, idea), 302);
}
