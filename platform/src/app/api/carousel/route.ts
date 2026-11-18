import { isUuid } from "@/lib/util";
import { getCurrentUser } from "@/server/auth";
import { carouselBrandColor, getCarousel } from "@/server/carousel/store";
import { parseCarouselLook } from "@/server/carousel/shape";
import { carouselZip, renderCarouselSlide, zipFileName } from "@/server/carousel/render";

export const runtime = "nodejs"; // reads the bundled font files
export const dynamic = "force-dynamic";
// A slide draws in about a second; the ZIP draws up to 8 of them in a row.
export const maxDuration = 60;

function plain(status: 401 | 403 | 404, text: string) {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * GET /api/carousel?w=<workspace>&id=<carousel>&slide=<1..8>&look=glow|midnight[&download=1]
 *   one slide, a 1080×1350 PNG (inline for the preview, as a file with download=1).
 * GET /api/carousel?w=<workspace>&id=<carousel>&zip=1&look=glow|midnight
 *   every slide in order, in one ZIP.
 * The signed-in member's own saved carousel only. The words are read from the workspace, never from
 * the address, so a link can't put text on a slide.
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

  const carousel = await getCarousel(ctx.workspace.id, url.searchParams.get("id"));
  if (!carousel) return plain(404, "Not found.");
  const look = parseCarouselLook(url.searchParams.get("look") ?? carousel.look);
  const brand = await carouselBrandColor(ctx.workspace.id);

  if (url.searchParams.get("zip") === "1") {
    const zip = await carouselZip(carousel, look, brand);
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(zip.length),
        "Content-Disposition": `attachment; filename="${zipFileName(carousel)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const n = Number(url.searchParams.get("slide") ?? "1");
  if (!Number.isInteger(n) || n < 1 || n > carousel.slides.length) return plain(404, "Not found.");
  return renderCarouselSlide(carousel, n, look, brand, { download: url.searchParams.get("download") === "1" });
}
