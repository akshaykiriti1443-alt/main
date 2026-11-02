import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getWorkspaceContext, listUserAgencies, listUserWorkspaces } from "@/server/tenancy";
import { hasFeature, PLANS } from "@/server/plans";
import { AppShell, type NavGroup, type Place } from "@/components/AppShell";
import { checkAccessAction } from "@/actions/account";
import { SubmitButton } from "@/components/client";
import { Callout } from "@/components/ui";
import { Button } from "@/components/ui/button";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ wid: string }> }) {
  const { wid } = await params;
  const ctx = await getWorkspaceContext(wid);
  const { workspace, agency, user } = ctx;
  const [mine, agencies] = await Promise.all([listUserWorkspaces(user.id), listUserAgencies(user.id)]);
  const db = await getDb();
  const [{ unread }] = await db
    .select({ unread: sql<number>`coalesce(sum(${conversations.unread}), 0)::int` })
    .from(conversations)
    .where(eq(conversations.workspaceId, wid));
  const growth = hasFeature(workspace.plan, "inbox");
  const base = `/app/w/${wid}`;

  const groups: NavGroup[] = [
    {
      items: [
        { href: base, label: "Dashboard", icon: "dashboard", exact: true },
        { href: `${base}/launch`, label: "AI launch kit", icon: "sparkles" },
      ],
    },
    {
      title: "Grow",
      items: [
        { href: `${base}/sites`, label: "Funnels & pages", icon: "globe" },
        { href: `${base}/leads`, label: "Leads", icon: "users" },
        { href: `${base}/skool`, label: "Skool members", icon: "skool" },
        { href: `${base}/growth`, label: "Growth ladder", icon: "ladder" },
        { href: `${base}/inbox`, label: "Inbox", icon: "inbox", badge: unread || undefined, locked: !growth },
        { href: `${base}/emails`, label: "Emails", icon: "mail" },
        { href: `${base}/automations`, label: "Automations", icon: "workflow", locked: !growth },
        { href: `${base}/social`, label: "Social planner", icon: "calendar", locked: !growth },
        { href: `${base}/ads/research`, label: "Ad research", icon: "search" },
        { href: `${base}/ads`, label: "Ad review", icon: "megaphone" },
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

  const places: Place[] = [
    ...mine
      .filter((m) => m.workspace.id !== wid)
      .map((m) => ({ href: `/app/w/${m.workspace.id}`, label: m.workspace.name, sub: PLANS[m.workspace.plan].label, icon: "boxes" as const })),
    ...agencies.map((a) => ({ href: `/app/agency/${a.agency.id}`, label: a.agency.name, sub: "Agency", icon: "clients" as const })),
    ...(user.isPlatformAdmin ? [{ href: "/app/admin", label: "Platform admin", icon: "shield" as const }] : []),
  ];

  let banner: React.ReactNode = null;
  if (ctx.effectiveStatus === "grace" && workspace.accessSource === "member") {
    banner = (
      <Callout
        tone="warn"
        title={`We can't see an active membership for ${user.email}`}
        action={
          <div className="flex flex-wrap gap-2">
            {env.skoolGroupUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={env.skoolGroupUrl} target="_blank" rel="noreferrer">Rejoin on Skool</a>
              </Button>
            ) : null}
            <form action={checkAccessAction.bind(null, wid)}>
              <SubmitButton size="sm" pendingText="Checking…">Check again</SubmitButton>
            </form>
          </div>
        }
      >
        Your pages stay live until {workspace.graceEndsAt?.toDateString() ?? "soon"}. Rejoin, or <Link href={`/join?email=${encodeURIComponent(user.email)}`}>buy access directly</Link>, and everything stays on.
      </Callout>
    );
  } else if (ctx.effectiveStatus === "grace") {
    banner = <Callout tone="warn">Your account pauses on {workspace.graceEndsAt?.toDateString() ?? "soon"}. Contact support to keep it on.</Callout>;
  }

  const brand = agency.isPlatform ? null : agency.brand;
  return (
    <AppShell
      brand={{ name: workspace.name, sub: `${PLANS[workspace.plan].label} plan · ${brand?.name || env.platformName}`, logoUrl: brand?.logoUrl, color: brand?.color }}
      groups={groups}
      places={places}
      user={{ email: user.email, name: user.name }}
      banner={banner}
    >
      {children}
    </AppShell>
  );
}
