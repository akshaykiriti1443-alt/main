import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { isEmail } from "@/lib/util";
import { recordSkoolApproval } from "@/server/access";

// Point a Zapier "Skool -> New Paid Member" zap here (Webhooks by Zapier, POST JSON):
//   URL: https://<app>/api/webhooks/skool?secret=<SKOOL_WEBHOOK_SECRET>
//   Body: { "email": "...", "name": "..." }
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-webhook-secret") ?? "";
  if (!env.skoolWebhookSecret || !safeEqual(secret, env.skoolWebhookSecret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email ?? body.Email ?? body.member_email ?? "").trim();
  if (!isEmail(email)) return NextResponse.json({ ok: false, error: "email missing" }, { status: 422 });
  const name = String(body.name ?? body.full_name ?? [body.first_name, body.last_name].filter(Boolean).join(" ") ?? "");
  const result = await recordSkoolApproval({ email, name, payload: body });
  return NextResponse.json({ ok: true, ...result });
}
