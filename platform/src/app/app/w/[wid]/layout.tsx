import Link from "next/link";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  getWorkspaceContext,
  listUserAgencies,
  listUserWorkspaces,
} from "@/server/tenancy";
import { PLANS } from "@/server/plans";
import { accessGap, membershipFor } from "@/server/access";
import { memberCheckoutConfigured } from "@/server/billing/stripe";
import { workspaceOwnerEmail } from "@/server/email/send";
import { loadPath } from "@/server/path";
import { AppShell, type NavGroup, type Place } from "@/components/AppShell";
import { checkAccessAction } from "@/actions/account";
import { SubmitButton } from "@/components/client";
import { Callout } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { ViewAsBar } from "@/components/view-as-bar";
import { reelVaultConfigured } from "@/lib/reelvault";
import { Companion, GuideButton } from "@/components/companion";
import { snapshotFromPath } from "@/server/companion";
import { GUIDE_COOKIE, GUIDE_HELLO_COOKIE, isGuideMode } from "@/lib/guides";
import { workspaceNav } from "./nav";

const quietLink = "font-medium text-foreground underline underline-offset-2";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ wid: string }>;
}) {
  const { wid } = await params;
  const ctx = await getWorkspaceContext(wid);
  const { workspace, agency, user } = ctx;
  const [mine, agencies] = await Promise.all([
    listUserWorkspaces(user.id),
    listUserAgencies(user.id),
  ]);
  const db = await getDb();
  const [{ unread }] = await db
    .select({
      unread: sql<number>`coalesce(sum(${conversations.unread}), 0)::int`,
    })
    .from(conversations)
    .where(eq(conversations.workspaceId, wid));
  const base = `/app/w/${wid}`;
  const paused = ctx.effectiveStatus === "paused";
  // Worked out once per request (loadPath is cached): the menu, Penny and the page all read the same next step.
  const path = paused ? null : await loadPath(wid, user.id).catch(() => null);
  const mode = path?.mode ?? "week";
  const nextHref =
    path?.current && !path.current.external && path.current.href
      ? path.current.href.split(/[?#]/)[0]
      : null;

  // A paused account only shows what still opens, so nothing in the menu bounces you back.
  const pausedGroups: NavGroup[] = [
    {
      items: [
        {
          href: `${base}/paused`,
          label: "Unlock your account",
          icon: "shield",
        },
      ],
    },
    {
      title: "Account",
      items: [
        { href: `${base}/billing`, label: "Plan & wallet", icon: "billing" },
      ],
    },
  ];
  const groups = paused
    ? pausedGroups
    : workspaceNav({
        base,
        plan: workspace.plan,
        unread,
        // Only shown once ONEX_SSO_SECRET is set, and open from the start: ReelVault is never locked behind a post.
        reelVault: reelVaultConfigured(),
        member: workspace.plan === "starter" && agency.isPlatform,
        mode,
        nextHref,
      });

  const places: Place[] = [
    ...mine
      .filter((m) => m.workspace.id !== wid)
      .map((m) => ({
        href: `/app/w/${m.workspace.id}`,
        label: m.workspace.name,
        sub: PLANS[m.workspace.plan].label,
        icon: "boxes" as const,
      })),
    ...agencies.map((a) => ({
      href: `/app/agency/${a.agency.id}`,
      label: a.agency.name,
      sub: "Agency",
      icon: "clients" as const,
    })),
    ...(user.isPlatformAdmin
      ? [
          {
            href: "/app/admin",
            label: "Platform admin",
            icon: "shield" as const,
          },
        ]
      : []),
  ];

  // `banner` sits above the page and is only for something the member has to act on.
  // `footnote` is the quiet line under the page: nothing there sits above the next step.
  let banner: React.ReactNode = null;
  let footnote: React.ReactNode = null;
  const canBuy = memberCheckoutConfigured();
  if (ctx.effectiveStatus === "grace" && workspace.accessSource === "member") {
    // Only the free welcome days so far ("matching"): nearly always someone a few days into their
    // Skool free trial, whom the app only hears about at the first charge or the next member
    // update. That is a matching delay, not a lapse, so it gets calm words and no warning.
    const ownerEmail = (await workspaceOwnerEmail(wid)) ?? user.email;
    const gap = await accessGap(ownerEmail);
    const join = gap === "matching" ? "Join" : "Rejoin";
    banner =
      gap === "matching" ? (
        <Callout
          tone="info"
          action={
            <form action={checkAccessAction.bind(null, wid)}>
              <SubmitButton size="sm" variant="outline" pendingText="Checking…">
                Check my membership
              </SubmitButton>
            </form>
          }
        >
          We&apos;re still matching you to your Skool membership. Your app
          stays fully on meanwhile. Joined Skool with {ownerEmail}? Nothing to
          do: it switches over by itself when your trial turns paid, or at the
          next member update. Not in the community yet?{" "}
          {env.skoolGroupUrl ? (
            <a
              href={env.skoolGroupUrl}
              target="_blank"
              rel="noreferrer"
              className={quietLink}
            >
              Join here
            </a>
          ) : (
            "Join on Skool"
          )}
          .
        </Callout>
      ) : (
      <Callout
        tone="warn"
        title={`We haven't matched ${ownerEmail} to a Skool membership yet`}
        action={
          <div className="flex flex-wrap gap-2">
            {env.skoolGroupUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={env.skoolGroupUrl} target="_blank" rel="noreferrer">
                  {join} on Skool
                </a>
              </Button>
            ) : null}
            <form action={checkAccessAction.bind(null, wid)}>
              <SubmitButton size="sm" pendingText="Checking…">
                Check again
              </SubmitButton>
            </form>
          </div>
        }
      >
        Joined the community with a different email? Tell us in Skool and
        we&apos;ll match it by hand.{" "}
        {/* One plain date or nothing, never "soon". */}
        {workspace.graceEndsAt ? (
          <>
            Your pages stay live until {workspace.graceEndsAt.toDateString()}
            .{" "}
          </>
        ) : null}
        {canBuy ? (
          <>
            {join}, or{" "}
            <Link href={`/join?email=${encodeURIComponent(ownerEmail)}`}>
              buy access directly
            </Link>
            , and everything stays on.
          </>
        ) : (
          `${join} the community with this email and everything stays on.`
        )}
      </Callout>
      );
  } else if (
    workspace.accessSource === "member" &&
    workspace.accessVerifiedUntil &&
    workspace.accessVerifiedUntil.getTime() - Date.now() < 4 * 86_400_000
  ) {
    // Say what keeps it on for how this owner got in: a card renews by itself, a Skool member is
    // confirmed by the next sync. The welcome window is a matching delay, never a free-trial clock:
    // the app can't see a Skool trial, and most people here started theirs minutes ago.
    const ownerEmail = (await workspaceOwnerEmail(wid)) ?? user.email;
    const channels = (await membershipFor(ownerEmail)).channels;
    const until = workspace.accessVerifiedUntil.toDateString();
    const welcomeOnly =
      channels.length > 0 && channels.every((c) => c === "welcome");
    footnote = channels.includes("stripe") ? (
      <p>
        Your card renews this plan on {until}.{" "}
        <Link href={`${base}/billing`} className={quietLink}>
          Plan &amp; wallet
        </Link>{" "}
        has the details.
      </p>
    ) : (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 basis-72">
          {welcomeOnly ? (
            <>
              Your app is on while we match you to your Skool membership.
              Joined with {ownerEmail}? Nothing to do. Not in the community
              yet?{" "}
              {env.skoolGroupUrl ? (
                <a
                  href={env.skoolGroupUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={quietLink}
                >
                  Join here
                </a>
              ) : (
                "Join on Skool"
              )}
              {canBuy ? (
                <>
                  {" or "}
                  <Link
                    href={`/join?email=${encodeURIComponent(ownerEmail)}`}
                    className={quietLink}
                  >
                    buy access
                  </Link>
                </>
              ) : null}
              .
            </>
          ) : (
            <>
              You&apos;re in until {until}. Use the same email as your Skool
              account ({ownerEmail}) and we confirm you automatically. Nothing
              to type.
            </>
          )}
        </p>
        <form action={checkAccessAction.bind(null, wid)}>
          <SubmitButton size="sm" variant="outline" pendingText="Checking…">
            Check my membership
          </SubmitButton>
        </form>
      </div>
    );
  } else if (ctx.effectiveStatus === "grace") {
    banner = (
      <Callout tone="warn">
        Your account pauses on {workspace.graceEndsAt?.toDateString() ?? "soon"}
        . Email us at{" "}
        <a href={`mailto:${env.emailReplyTo}`} className={quietLink}>
          {env.emailReplyTo}
        </a>{" "}
        to keep it on.
      </Callout>
    );
  }

  // Penny, the step-by-step guide: on for everyone until they turn it off. She reads the same
  // path as the menu, so her step and the glowing dot can't disagree.
  const jar = await cookies();
  const savedMode = jar.get(GUIDE_COOKIE)?.value;
  const guideMode = isGuideMode(savedMode) ? savedMode : "open";
  const showGuide = !paused;
  const guide =
    showGuide && guideMode !== "off" && path ? snapshotFromPath(path) : null;
  const companion = showGuide ? (
    <Companion
      wid={wid}
      initialMode={guideMode}
      firstVisit={!jar.get(GUIDE_HELLO_COOKIE)}
      initial={guide}
    />
  ) : null;

  const brand = agency.isPlatform ? null : agency.brand;
  return (
    <AppShell
      brand={{
        name: workspace.name,
        sub: `${PLANS[workspace.plan].label} plan · ${brand?.name || env.platformName}`,
        logoUrl: brand?.logoUrl,
        color: brand?.color,
      }}
      groups={groups}
      places={places}
      user={{ email: user.email, name: user.name }}
      headerExtra={showGuide ? <GuideButton initialMode={guideMode} /> : null}
      companion={companion}
      banner={
        user.isPlatformAdmin ? (
          <div className="flex flex-col gap-3">
            <ViewAsBar wid={wid} current={ctx.viewAs ?? "owner"} />
            {banner}
          </div>
        ) : (
          banner
        )
      }
      footnote={footnote}
    >
      {children}
    </AppShell>
  );
}
