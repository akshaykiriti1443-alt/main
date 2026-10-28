import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/server/tenancy";
import { hasFeature } from "@/server/plans";
import { completeWhatsAppSignup } from "@/server/whatsapp";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { workspaceId?: string; code?: string; phoneNumberId?: string; wabaId?: string };
  const { workspace } = await requireWorkspace(body.workspaceId ?? "", "admin");
  if (!hasFeature(workspace.plan, "whatsapp")) return NextResponse.json({ ok: false, error: "WhatsApp needs the Growth plan." }, { status: 403 });
  if (!body.code || !body.phoneNumberId || !body.wabaId) return NextResponse.json({ ok: false, error: "Signup didn't finish. Try again." }, { status: 400 });
  try {
    const name = await completeWhatsAppSignup({ workspaceId: workspace.id, code: body.code, phoneNumberId: body.phoneNumberId, wabaId: body.wabaId });
    return NextResponse.json({ ok: true, name });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "WhatsApp setup failed." }, { status: 502 });
  }
}
