import { Suspense } from "react";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { reelVaultConfigured, reelVaultOrigin } from "@/lib/reelvault";
import { requireWorkspace } from "@/server/tenancy";
import { isEmailVerified } from "@/server/emailVerify";
import { embedHostState, viewerIsWorkspaceMember } from "@/server/reelvault";
import { resendVerifyAction } from "@/actions/account";
import { SubmitButton } from "@/components/client";
import { Callout } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { NOT_THIS_MEMBERS } from "@/components/reelvault/proven-hooks";
import { ReelVaultFrame, ReelVaultLoading } from "@/components/reelvault/frame";
import { ReelVaultNotice } from "@/components/reelvault/notice";

export const dynamic = "force-dynamic";

// ReelVault, inside OneX. The frame lives here, in the layout, so it stays mounted while the member moves
// between ReelVault's screens (the sub-paths); the page under it only exists to match those addresses.
export default async function ReelVaultLayout({ children, params }: { children: React.ReactNode; params: Promise<{ wid: string }> }) {
  const { wid } = await params;
  // Same gate as every workspace page: a paused account goes to /paused, a pending entry ticket to /hello.
  // (/api/reelvault/open checks the same gates again, since the frame loads it directly.)
  const { user, viewAs } = await requireWorkspace(wid);
  // Admin-only hints stay hidden while the owner previews the app as a member ("View as").
  const isAdmin = user.isPlatformAdmin && !viewAs;

  if (!reelVaultConfigured()) {
    return (
      <>
        <ReelVaultNotice
          title="ReelVault isn't switched on yet"
          body="It opens right here once it's connected."
          adminNote={isAdmin ? "Set REELVAULT_URL and ONEX_SSO_SECRET (the same value as ReelVault's onex-sso-secret.txt), then restart OneX." : undefined}
        />
        {children}
      </>
    );
  }

  if (!(await isEmailVerified(user.id))) {
    return (
      <>
        <ReelVaultNotice
          title="Confirm your email to open ReelVault"
          body="ReelVault signs you in with your OneX email, so we need to know it's yours."
          action={
            <form action={resendVerifyAction.bind(null, wid)}>
              {/* Where the action comes back to: this notice, with its "We sent a new link" flash. */}
              <input type="hidden" name="back" value={`/app/w/${wid}/reelvault`} />
              <SubmitButton pendingText="Sending…">Send the link again</SubmitButton>
            </form>
          }
        />
        {children}
      </>
    );
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const where = embedHostState(host, { appUrl: env.appUrl, reelVaultUrl: env.reelVaultUrl, isProd: env.isProd });

  if (where.kind === "dev-mismatch") {
    const there = `http://${where.reelVaultHostname}${where.port ? `:${where.port}` : ""}/app/w/${wid}/reelvault`;
    return (
      <>
        <ReelVaultNotice
          title="Open OneX under the same name as ReelVault"
          body={
            <>
              Open OneX at <a href={there}>{there}</a> so both apps share a name.
            </>
          }
        />
        {children}
      </>
    );
  }

  if (where.kind === "elsewhere") {
    return (
      <>
        <ReelVaultNotice
          title="ReelVault"
          body="Study your competitors' reels and turn the winners into your scripts. It opens in a new tab, already signed in."
          action={
            <Button asChild>
              <a href={`/api/reelvault/open?${new URLSearchParams({ w: wid }).toString()}`} target="_blank" rel="noopener">
                Open ReelVault
              </a>
            </Button>
          }
        />
        {children}
      </>
    );
  }

  // The frame always signs in the viewer, never the workspace's member. Say so when they differ
  // (a platform admin or agency staff looking in, or "View as").
  const ownWorkspace = !viewAs && (await viewerIsWorkspaceMember(wid, user.id));

  return (
    <>
      {ownWorkspace ? null : <Callout tone="info">{NOT_THIS_MEMBERS}</Callout>}
      <Suspense fallback={<ReelVaultLoading />}>
        <ReelVaultFrame wid={wid} rvOrigin={reelVaultOrigin()} platformName={env.platformName} isAdmin={isAdmin} reelVaultUrl={isAdmin ? env.reelVaultUrl : undefined} />
      </Suspense>
      {children}
    </>
  );
}
