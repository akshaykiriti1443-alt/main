import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { handleStripeEvent, verifyStripeSignature } from "@/server/billing/stripe";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"))) {
    return new NextResponse("Bad signature", { status: 400 });
  }
  const event = JSON.parse(raw);
  const db = await getDb();
  const [row] = await db.insert(webhookEvents).values({ source: "stripe", payload: event }).returning({ id: webhookEvents.id });
  try {
    await handleStripeEvent(event);
    await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, row.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(webhookEvents).set({ error: message }).where(eq(webhookEvents.id, row.id));
    // A 500 makes Stripe retry later.
    return new NextResponse(message, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
