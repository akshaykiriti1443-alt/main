import { NextResponse, type NextRequest } from "next/server";
import { verifySignature } from "@/lib/crypto";
import { unsubscribeContact } from "@/server/contacts";

async function handle(req: NextRequest) {
  const c = req.nextUrl.searchParams.get("c") ?? "";
  const s = req.nextUrl.searchParams.get("s") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(c) || !verifySignature(`unsub:${c}`, s)) {
    return new NextResponse("This unsubscribe link is invalid.", { status: 400 });
  }
  await unsubscribeContact(c);
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:17px/1.6 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f4f5f8;color:#141a2e"><div style="text-align:center;padding:24px"><h1 style="font-size:24px">You're unsubscribed</h1><p>You won't get more emails from this sender.</p></div></body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const GET = handle;
// One-click unsubscribe (RFC 8058) posts to the same URL.
export const POST = handle;
