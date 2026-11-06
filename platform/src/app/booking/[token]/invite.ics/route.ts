import { bookingByToken, inviteFor, isActive } from "@/server/booking";
import { workspaceOwnerEmail } from "@/server/email/send";

export const dynamic = "force-dynamic";

// The booker's calendar invite. A cancelled booking gets METHOD:CANCEL, so calendar apps remove it.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await bookingByToken(token);
  if (!row) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const { booking, calendar, workspace } = row;
  const host = workspace.settings.businessName || workspace.name;
  const ics = inviteFor(booking, calendar, host, await workspaceOwnerEmail(workspace.id), isActive(booking) ? "REQUEST" : "CANCEL");
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="invite.ics"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
