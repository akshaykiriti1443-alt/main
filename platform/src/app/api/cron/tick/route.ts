import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { tick } from "@/server/maintenance";

export const maxDuration = 300;

// Vercel Cron calls this every minute with "Authorization: Bearer <CRON_SECRET>".
async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const ok = env.cronSecret ? safeEqual(auth, `Bearer ${env.cronSecret}`) : !env.isProd;
  if (!ok) return new NextResponse("Unauthorized", { status: 401 });
  const result = await tick();
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
