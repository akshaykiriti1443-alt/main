import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { logActivity } from "@/server/activity";
import { enqueue } from "@/server/jobs/queue";
import { isBot, skoolTargetFor, visitSource, workspaceBySlug } from "@/server/growth";
import { randomToken } from "@/lib/crypto";
import { clientIp } from "@/lib/ip";
import { takeRateLimit } from "@/server/rateLimit";

// The Skool link: an instant redirect to the owner's Skool About page.
//   - counts the click by source (ads, bio, YouTube...) for the Growth ladder
//   - sends Meta a server-side ViewContent, so ad campaigns can optimise for About-page visits
//     even when the Skool group has no pixel of its own
// It's a plain 302, so the browser keeps the original referrer (Instagram, Facebook...) and
// Skool still sees where the visitor came from. Query params (utm_*, ref) pass through.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await workspaceBySlug(slug);
  const target = ws && ws.status !== "paused" ? await skoolTargetFor(ws.id, ws.settings.skoolUrl) : "";
  if (!ws || !target) return NextResponse.redirect(env.appUrl, 302);

  const url = new URL(target);
  req.nextUrl.searchParams.forEach((v, k) => {
    if (k !== "src") url.searchParams.set(k, v);
  });

  const ua = req.headers.get("user-agent") ?? "";
  const ip = clientIp(req.headers);
  if (!isBot(ua)) {
    const source = visitSource(req.nextUrl.searchParams, req.headers.get("referer") ?? "");
    const campaign = req.nextUrl.searchParams.get("utm_campaign")?.slice(0, 80) ?? "";
    try {
      // Count a visitor a few times a minute at most, and cap Meta events per workspace, so a script
      // can't inflate the clicks or flood the owner's dataset. Over the limit they're still redirected.
      if (!(await takeRateLimit(`go:${ws.id}:${ip ?? "unknown"}`, [{ seconds: 60, max: 3 }]))) return NextResponse.redirect(url.toString(), 302);
      await logActivity({ workspaceId: ws.id, type: "skool_visit", data: { source, campaign } });
      const s = ws.settings;
      if (s.metaPixelId && s.metaCapiTokenEnc && (await takeRateLimit(`go-capi:${ws.id}`, [{ seconds: 60, max: 120 }]))) {
        const fbclid = req.nextUrl.searchParams.get("fbclid");
        const fbc = req.cookies.get("_fbc")?.value ?? (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null);
        await enqueue("meta.capi", {
          workspaceId: ws.id,
          eventName: "ViewContent",
          eventId: `skool-visit:${randomToken(9)}`,
          eventTime: Math.floor(Date.now() / 1000),
          eventSourceUrl: req.nextUrl.toString(),
          ip,
          userAgent: ua,
          fbp: req.cookies.get("_fbp")?.value ?? null,
          fbc,
        });
      }
    } catch (err) {
      // Counting must never block the visitor.
      console.error("[go] tracking failed", err);
    }
  }
  return NextResponse.redirect(url.toString(), 302);
}
