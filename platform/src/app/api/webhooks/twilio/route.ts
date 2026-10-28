import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { ingestInbound } from "@/server/inbox";
import { smsConnectionFor, verifyTwilioSignature } from "@/server/sms";

export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const params = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  const url = `${env.appUrl}/api/webhooks/twilio`;
  if (!verifyTwilioSignature(url, params, req.headers.get("x-twilio-signature"))) {
    return new NextResponse("Bad signature", { status: 403 });
  }
  const conn = await smsConnectionFor(params.To ?? "");
  if (conn && params.From && params.Body !== undefined) {
    await ingestInbound({
      connection: conn,
      channel: "sms",
      threadId: params.From,
      externalId: params.MessageSid ?? null,
      body: params.Body,
      at: new Date(),
      phone: params.From,
    });
  }
  return new NextResponse("<Response></Response>", { headers: { "content-type": "text/xml" } });
}
