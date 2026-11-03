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
import { hasFeature, PLANS } from "@/server/plans";
import { membershipFor, pastChannels } from "@/server/access";
import { memberCheckoutConfigured } from "@/server/billing/stripe";
import { workspaceOwnerEmail } from "@/server/email/send";
import { AppShell, type NavGroup, type Place } from "@/components/AppShell";
import { checkAccessAction } from "@/actions/account";
import { SubmitButton } from "@/components/client";
import { Callout } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { ViewAsBar } from "@/components/view-as-bar";
import { Companion, GuideButton } from "@/components/companion";
import { companionSnapshot } from "@/server/companion";
import {
  GUIDE_COOKIE,
  GUIDE_HELLO_COOKIE,
  GUIDE_SKIP_COOKIE,
  isGuideMode,
} from "@/lib/guides";

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
  const growth = hasFeature(workspace.plan, "inbox");
  const base = `/app/w/${wid}`;

  // In the order a beginner needs them (the course's order): connect your AI, build the shop,
  // get members, keep them. The guide points at the next one. A paused account only shows what
  // still opens, so nothing in the menu bounces you back.
  const paused = ctx.effectiveStatus === "paused";
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
  const fullGroups: NavGroup[] = [
    {
      items: [
        { href: base, label: "Dashboard", icon: "dashboard", exact: true },
        { href: `${base}/path`, label: "Your path", icon: "route" },
      ],
    },
    {
      title: "Start here",
      items: [
        { href: `${base}/ai`, label: "Your AI", icon: "bot" },
        { href: `${base}/launch`, label: "AI launch kit", icon: "sparkles" },
        { href: `${base}/sites`, label: "Funnels & pages", icon: "globe" },
      ],
    },
    {
      title: "Get members",
      items: [
        { href: `${base}/ads/research`, label: "Ad research", icon: "search" },
        { href: `${base}/ads`, label: "Ad review", icon: "megaphone" },
        { href: `${base}/growth`, label: "Growth ladder", icon: "ladder" },
        { href: `${base}/leads`, label: "Leads", icon: "users" },
      ],
    },
    {
      title: "Keep members",
      items: [
        { href: `${base}/skool`, label: "Skool members", icon: "skool" },
        {
          href: `${base}/automations`,
          label: "Automations",
          icon: "workflow",
          locked: !growth,
        },
        { href: `${base}/unlocks`, label: "Unlocks", icon: "gift" },
        { href: `${base}/emails`, label: "Emails", icon: "mail" },
      ],
    },
    {
      title: "Talk",
      items: [
        {
          href: `${base}/inbox`,
          label: "Inbox",
          icon: "inbox",
          badge: unread || undefined,
          locked: !growth,
        },
        {
          href: `${base}/social`,
          label: "Social planner",
          icon: "calendar",
          locked: !growth,
        },
      ],
    },
    {
      title: "Account",
      items: [
        { href: `${base}/billing`, label: "Plan & wallet", icon: "billing" },
        { href: `${base}/settings`, label: "Settings", icon: "settings" },
      ],
    },
  ];
  const groups = paused ? pausedGroups : fullGroups;

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

  let banner: React.ReactNode = null;
  const canBuy = memberCheckoutConfigured();
  if (ctx.effectiveStatus === "grace" && workspace.accessSource === "member") {
    // Only the free welcome days so far: they never joined, so "rejoin" would be wrong.
    const past = await pastChannels(
      (await workspaceOwnerEmail(wid)) ?? user.email,
    );
    const join = past.every((c) => c === "welcome") ? "Join" : "Rejoin";
    banner = (
      <Callout
        tone="warn"
        title={`We can't see an active membership for ${user.email}`}
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
        Your pages stay live until{" "}
        {workspace.graceEndsAt?.toDateString() ?? "soon"}.{" "}
        {canBuy ? (
          <>
            {join}, or{" "}
            <Link href={`/join?email=${encodeURIComponent(user.email)}`}>
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
    // Say what keeps it on for how this owner got in: a card renews by itself, the free welcome
    // days need a membership, a Skool member is confirmed by the next sync.
    const ownerEmail = (await workspaceOwnerEmail(wid)) ?? user.email;
    const channels = (await membershipFor(ownerEmail)).channels;
    const until = workspace.accessVerifiedUntil.toDateString();
    const welcomeOnly =
      channels.length > 0 && channels.every((c) => c === "welcome");
    banner = channels.includes("stripe") ? (
      <Callout tone="info">Renews with your card on {until}.</Callout>
    ) : (
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
        {welcomeOnly ? (
          <>
            Your free days end on {until}.{" "}
            {env.skoolGroupUrl ? (
              <a href={env.skoolGroupUrl} target="_blank" rel="noreferrer">
                Join the Skool community
              </a>
            ) : (
              "Join the Skool community"
            )}
            {canBuy ? " or buy access" : ""} with {ownerEmail} to keep going.
            {canBuy ? (
              <>
                {" "}
                <Link href={`/join?email=${encodeURIComponent(ownerEmail)}`}>
                  Buy access
                </Link>
              </>
            ) : null}
          </>
        ) : (
          <>
            You&apos;re in until {until}. Use the same email as your Skool
            account ({ownerEmail}) and we confirm you automatically. Nothing to
            type.
          </>
        )}
      </Callout>
    );
  } else if (ctx.effectiveStatus === "grace") {
    banner = (
      <Callout tone="warn">
        Your account pauses on {workspace.graceEndsAt?.toDateString() ?? "soon"}
        . Contact support to keep it on.
      </Callout>
    );
  }

  // Penny, the step-by-step guide: on for everyone until they turn it off.
  const jar = await cookies();
  const savedMode = jar.get(GUIDE_COOKIE)?.value;
  const guideMode = isGuideMode(savedMode) ? savedMode : "open";
  const showGuide = ctx.effectiveStatus !== "paused";
  const guide =
    showGuide && guideMode !== "off"
      ? await companionSnapshot(workspace, user.id).catch(() => null)
      : null;
  const companion = showGuide ? (
    <Companion
      wid={wid}
      initialMode={guideMode}
      firstVisit={!jar.get(GUIDE_HELLO_COOKIE)}
      initialSkipped={decodeURIComponent(
        jar.get(GUIDE_SKIP_COOKIE)?.value ?? "",
      )
        .split(",")
        .filter(Boolean)
        .slice(0, 40)}
      initial={guide ?? { steps: [], done: 0, total: 0, level: 1 }}
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
    >
      {children}
    </AppShell>
  );
}
