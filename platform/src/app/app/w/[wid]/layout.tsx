import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getWorkspaceContext, listUserAgencies, listUserWorkspaces } from "@/server/tenancy";
import { hasFeature, PLANS } from "@/server/plans";
import { AppShell, type NavGroup, type Place } from "@/components/AppShell";
import { redeemCodeAction } from "@/actions/account";
import { SubmitButton } from "@/components/client";
import { Callout } from "@/components/ui";
import { Input } from "@/components/ui/input";

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
        { href: `${base}/inbox`, label: "Inbox", icon: "inbox", badge: unread || undefined, locked: !growth },
        { href: `${base}/emails`, label: "Emails", icon: "mail" },
        { href: `${base}/automations`, label: "Automations", icon: "workflow", locked: !growth },
        { href: `${base}/social`, label: "Social planner", icon: "calendar", locked: !growth },
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
  const viaSkool = workspace.accessSource === "skool_code" || workspace.accessSource === "skool_zapier";
  if (ctx.effectiveStatus === "grace") {
    banner = (
      <Callout
        tone="warn"
        title="Your member access needs this month's code"
        action={
          <form action={redeemCodeAction.bind(null, wid)} className="flex gap-2">
            <Input name="code" placeholder="Member code" aria-label="Member code" className="w-40 uppercase" required />
            <SubmitButton>Confirm</SubmitButton>
          </form>
        }
      >
        Your pages stay live until {workspace.graceEndsAt?.toDateString() ?? "soon"}.
      </Callout>
    );
  } else if (viaSkool && workspace.accessVerifiedUntil && workspace.accessVerifiedUntil.getTime() - Date.now() < 5 * 86_400_000) {
    banner = (
      <Callout tone="info">
        Your member code renews on {workspace.accessVerifiedUntil.toDateString()}. Grab next month's code from the Skool classroom and enter it in{" "}
        <Link href={`${base}/settings`}>Settings</Link>.
      </Callout>
    );
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
