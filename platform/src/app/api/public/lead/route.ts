import { NextResponse, type NextRequest } from "next/server";
import { captureLead } from "@/server/leads";

const pick = (fd: FormData, k: string) => String(fd.get(k) ?? "").slice(0, 500);

export async function POST(req: NextRequest) {
  const isJson = (req.headers.get("content-type") ?? "").includes("application/json");
  let fields: Record<string, string>;
  if (isJson) {
    fields = (await req.json().catch(() => ({}))) as Record<string, string>;
  } else {
    const fd = await req.formData();
    fields = Object.fromEntries(["pageId", "email", "name", "phone", "website", "eventId"].map((k) => [k, pick(fd, k)]));
  }
  const referer = req.headers.get("referer");
  const utm: Record<string, string> = {};
  if (referer) {
    try {
      const ref = new URL(referer);
      for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid"]) {
        const v = ref.searchParams.get(k);
        if (v) utm[k] = v.slice(0, 200);
      }
    } catch {}
  }
  const fbclid = utm.fbclid;
  const result = await captureLead({
    pageId: fields.pageId ?? "",
    email: fields.email ?? "",
    name: fields.name,
    phone: fields.phone,
    honeypot: fields.website,
    eventId: fields.eventId,
    ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
    userAgent: req.headers.get("user-agent"),
    fbp: req.cookies.get("_fbp")?.value ?? null,
    fbc: req.cookies.get("_fbc")?.value ?? (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null),
    sourceUrl: referer,
    utm,
  });

  if (isJson) return NextResponse.json(result, { status: result.ok ? 200 : result.status });
  if (result.ok) return NextResponse.redirect(result.redirectTo, 303);
  if (result.redirectTo) {
    const back = new URL(result.redirectTo);
    back.searchParams.set("error", result.error);
    return NextResponse.redirect(back, 303);
  }
  return new NextResponse(result.error, { status: result.status });
}
