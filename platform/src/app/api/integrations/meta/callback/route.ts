import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { completeMetaLogin, readMetaState } from "@/server/meta/oauth";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const state = readMetaState(p.get("state") ?? "");
  const user = await getCurrentUser();
  if (!state || !user || user.id !== state.u) return new NextResponse("This connect link expired. Try again from Settings.", { status: 400 });
  const back = new URL(`/app/w/${state.w}/settings`, req.url);
  if (p.get("error")) {
    back.searchParams.set("error", "Facebook connection was cancelled.");
    return NextResponse.redirect(back);
  }
  try {
    const connected = await completeMetaLogin(state.w, p.get("code") ?? "");
    back.searchParams.set("ok", connected.length ? `Connected: ${connected.join(", ")}` : "No Pages were shared. Try again and pick your Page.");
  } catch (err) {
    back.searchParams.set("error", err instanceof Error ? err.message : "Couldn't connect to Meta.");
  }
  return NextResponse.redirect(back);
}
