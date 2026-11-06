import { NextResponse, type NextRequest } from "next/server";
import { clientIp } from "@/lib/ip";
import { captureApplyLead } from "@/server/scaleitads";

export const dynamic = "force-dynamic";

// POST /api/scaleitads/apply: leads from the ScaleitAds /apply page (same origin on scaleitads.com),
// once SCALEITADS_WORKSPACE is set. 503 when it isn't (the page then still posts to GoHighLevel).
// The page sends JSON; its fallback resend is a no-cors text/plain POST, so the body is read as text.
export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => "");
  if (text.length > 20_000) return NextResponse.json({ ok: false, error: "That's too much to send." }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {}
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ ok: false, error: "Send the form as JSON." }, { status: 400 });
  try {
    const r = await captureApplyLead(body, { ip: clientIp(req.headers) });
    return NextResponse.json(r.body, { status: r.status, headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[scaleitads] apply lead failed", err);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
