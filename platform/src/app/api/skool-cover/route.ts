import { isUuid } from "@/lib/util";
import { getCurrentUser } from "@/server/auth";
import { loadCoverData, parseLook, renderSkoolCover } from "@/server/cover/skoolCover";

export const runtime = "nodejs"; // reads the bundled font files
export const dynamic = "force-dynamic";

function plain(status: 401 | 403 | 404, text: string) {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * GET /api/skool-cover?w=<workspace>&look=glow|split|midnight[&kit=<launch kit id>][&download=1]
 * The signed-in member's Skool group cover (1084×576 PNG), drawn from their own launch kit. Nothing on
 * it comes from the address: the words are read from the workspace, so a link can't put text on a cover.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const wid = url.searchParams.get("w");
  const user = await getCurrentUser();
  if (!user) return plain(401, "Sign in to OneX again.");
  if (!isUuid(wid)) return plain(404, "Not found.");

  const tenancy = await import("@/server/tenancy");
  let ctx: Awaited<ReturnType<typeof tenancy.getWorkspaceContext>>;
  try {
    // Throws (notFound) for a workspace this user can't open.
    ctx = await tenancy.getWorkspaceContext(wid);
  } catch {
    return plain(404, "Not found.");
  }
  if (ctx.user.id !== user.id) return plain(404, "Not found.");
  // The same gates as the app's pages: a paused account, or one still before its entry ticket, gets nothing.
  if (ctx.effectiveStatus === "paused" || ctx.viewAs === "entry") return plain(403, "Not available right now.");
  if (!ctx.user.isPlatformAdmin && ctx.workspace.accessSource === "member") {
    const unlocks = await import("@/server/unlocks");
    if (await unlocks.entryTicketPending(await unlocks.getEntryTicket(), ctx.workspace)) return plain(403, "Not available right now.");
  }

  const data = await loadCoverData(ctx.workspace, url.searchParams.get("kit"));
  return renderSkoolCover(data, parseLook(url.searchParams.get("look")), { download: url.searchParams.get("download") === "1" });
}
