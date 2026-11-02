import Link from "next/link";
import { requireAgency, listUserWorkspaces } from "@/server/tenancy";
import { PLANS } from "@/server/plans";
import { AppShell, type Place } from "@/components/AppShell";
import { Callout } from "@/components/ui";

export default async function AgencyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ aid: string }> }) {
  const { aid } = await params;
  const { agency, user } = await requireAgency(aid);
  const mine = await listUserWorkspaces(user.id);
  const base = `/app/agency/${aid}`;
  const places: Place[] = [
    ...mine.map((m) => ({ href: `/app/w/${m.workspace.id}`, label: m.workspace.name, sub: PLANS[m.workspace.plan].label, icon: "boxes" as const })),
    ...(user.isPlatformAdmin ? [{ href: "/app/admin", label: "Platform admin", icon: "shield" as const }] : []),
  ];
  return (
    <AppShell
      brand={{ name: agency.brand.name || agency.name, sub: "Agency", logoUrl: agency.brand.logoUrl, color: agency.brand.color }}
      groups={[
        {
          title: "Agency",
          items: [
            { href: base, label: "Client accounts", icon: "clients", exact: true },
            { href: `${base}/templates`, label: "Templates", icon: "templates" },
            { href: `${base}/settings`, label: "Branding & pricing", icon: "palette" },
            { href: `${base}/billing`, label: "Plan & wallet", icon: "billing" },
          ],
        },
      ]}
      places={places}
      user={{ email: user.email, name: user.name }}
      banner={
        agency.plan !== "agency" ? (
          <Callout tone="warn">
            Your Agency plan isn't active yet. <Link href={`${base}/billing`}>Activate it</Link> to add client accounts.
          </Callout>
        ) : agency.status === "paused" ? (
          <Callout tone="error">Your agency is paused. Client pages are offline until billing is fixed.</Callout>
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
