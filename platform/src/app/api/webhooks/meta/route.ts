import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { enqueue } from "@/server/jobs/queue";
import { verifyMetaSignature } from "@/server/meta/webhooks";

// Subscription handshake from the Meta App Dashboard.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && env.metaVerifyToken && safeEqual(p.get("hub.verify_token") ?? "", env.metaVerifyToken)) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// Messenger, Instagram and WhatsApp deliveries. Store fast, process in a job.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Bad signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }
  const db = await getDb();
  const [row] = await db.insert(webhookEvents).values({ source: "meta", payload }).returning({ id: webhookEvents.id });
  await enqueue("inbox.webhook", { webhookEventId: row.id }, { maxAttempts: 8 });
  return NextResponse.json({ ok: true });
}
