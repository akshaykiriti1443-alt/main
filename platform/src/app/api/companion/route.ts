import { isUuid } from "@/lib/util";
import { requireWorkspace } from "@/server/tenancy";
import { companionSnapshot } from "@/server/companion";

export const dynamic = "force-dynamic";

/**
 * GET /api/companion?w=<workspace>: fresh "where am I on Your path" for Penny, after each page change.
 * A plain GET on purpose, not a server action: the browser runs server actions one at a time and ties
 * them to page changes, so Penny's look-up used to hold up the member's own buttons (Build my launch
 * kit waited behind it, and its redirect could stall). `null` when there's nothing to show.
 */
export async function GET(request: Request) {
  const wid = new URL(request.url).searchParams.get("w");
  let body = null;
  if (isUuid(wid)) {
    try {
      const { workspace, user } = await requireWorkspace(wid, "user", { allowPaused: true, allowEntry: true });
      body = await companionSnapshot(workspace, user.id);
    } catch {
      body = null;
    }
  }
  return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
