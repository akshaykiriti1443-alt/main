import { leadsCsv } from "@/server/contacts";
import { requireWorkspace } from "@/server/tenancy";

export const dynamic = "force-dynamic";

// Download every lead as a CSV. Open while paused: leaving, or lapsing, never traps anyone's list.
export async function GET(_req: Request, { params }: { params: Promise<{ wid: string }> }) {
  const { wid } = await params;
  const { workspace } = await requireWorkspace(wid, "user", { allowPaused: true, allowEntry: true });
  return new Response(await leadsCsv(wid), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${workspace.slug.replace(/[^a-z0-9-]/gi, "")}.csv"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
