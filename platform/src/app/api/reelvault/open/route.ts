import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { isEmailVerified } from "@/server/emailVerify";
import { reelVaultConfigured, reelVaultSignInUrl } from "@/lib/reelvault";
import { reelVaultAccessOk } from "@/server/reelvault";
import { isReelVaultRoute } from "@/components/reelvault/routes";

export const runtime = "nodejs"; // node:crypto is needed
export const dynamic = "force-dynamic"; // every click signs a fresh ticket

/** In the frame a failure answers in plain words: a redirect would draw a second OneX inside the frame. */
function plain(status: 401 | 403, text: string) {
  return new NextResponse(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

// Two callers:
// - the ReelVault page inside OneX sets its frame to /api/reelvault/open?embed=1&w=<wid>&theme=..&to=.. and
//   the frame lands in ReelVault's frame mode, signed in under the same email;
// - the "Open ReelVault" button (white-label hosts) opens /api/reelvault/open?w=<wid> in a new tab.
// `w` is OneX's own: it picks the workspace whose gates apply (paused, entry ticket) and is never sent on.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const embed = url.searchParams.get("embed") === "1";
  const wid = url.searchParams.get("w");
  const user = await getCurrentUser();
  if (!user?.email) return embed ? plain(401, "Sign in to OneX again.") : NextResponse.redirect(new URL("/login", request.url));
  // The ticket vouches for the email, so only a confirmed one gets it (signups can log in before they confirm).
  // A paused account, or one still before its entry ticket, gets no ticket either: the page's gate alone
  // wouldn't stop someone typing this address. The frame always names its workspace.
  const allowed =
    reelVaultConfigured() &&
    (!embed || wid !== null) &&
    (await isEmailVerified(user.id)) &&
    (await reelVaultAccessOk(user, wid));
  if (!allowed) return embed ? plain(403, "ReelVault is not available.") : NextResponse.redirect(new URL("/app", request.url));
  let target: string;
  if (embed) {
    const theme = url.searchParams.get("theme");
    const to = url.searchParams.get("to");
    target = reelVaultSignInUrl(
      { email: user.email, name: user.name },
      {
        // This route's own origin: the page that framed it. ReelVault only accepts the origin it was told about.
        parent: url.origin,
        theme: theme === "light" || theme === "dark" ? theme : undefined,
        to: isReelVaultRoute(to) ? to : "home",
      },
    );
  } else {
    target = reelVaultSignInUrl({ email: user.email, name: user.name });
  }
  const res = NextResponse.redirect(target, 307);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
