import { requirePlatformAdmin } from "@/server/auth";
import { env } from "@/lib/env";
import { listUserAgencies, listUserWorkspaces } from "@/server/tenancy";
import { PLANS } from "@/server/plans";
import { AppShell, type Place } from "@/components/AppShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  const [mine, agencies] = await Promise.all([listUserWorkspaces(user.id), listUserAgencies(user.id)]);
  const places: Place[] = [
    ...mine.map((m) => ({ href: `/app/w/${m.workspace.id}`, label: m.workspace.name, sub: PLANS[m.workspace.plan].label, icon: "boxes" as const })),
    ...agencies.map((a) => ({ href: `/app/agency/${a.agency.id}`, label: a.agency.name, sub: "Agency", icon: "clients" as const })),
  ];
  return (
    <AppShell
      brand={{ name: env.platformName, sub: "Platform admin" }}
      groups={[
        {
          title: "Platform admin",
          items: [
            { href: "/app/admin", label: "Overview", icon: "dashboard", exact: true },
            { href: "/app/admin/codes", label: "Member codes", icon: "key" },
            { href: "/app/admin/workspaces", label: "Workspaces", icon: "boxes" },
            { href: "/app/admin/agencies", label: "Agencies", icon: "clients" },
            { href: "/app/admin/templates", label: "Platform templates", icon: "templates" },
            { href: "/app/admin/jobs", label: "Jobs & webhooks", icon: "activity" },
          ],
        },
      ]}
      places={places}
      user={{ email: user.email, name: user.name }}
    >
      {children}
    </AppShell>
  );
}
