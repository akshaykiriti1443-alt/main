import Link from "next/link";
import { requirePlatformAdmin } from "@/server/auth";
import { listUserWorkspaces } from "@/server/tenancy";
import { AppShell, UserFooter } from "@/components/AppShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  const mine = await listUserWorkspaces(user.id);
  return (
    <AppShell
      groups={[
        {
          title: "Platform admin",
          items: [
            { href: "/app/admin", label: "Overview", exact: true },
            { href: "/app/admin/codes", label: "Member codes" },
            { href: "/app/admin/workspaces", label: "Workspaces" },
            { href: "/app/admin/agencies", label: "Agencies" },
            { href: "/app/admin/templates", label: "Platform templates" },
            { href: "/app/admin/jobs", label: "Jobs & webhooks" },
          ],
        },
      ]}
      footer={<UserFooter email={user.email} extra={mine.slice(0, 3).map((m) => <Link key={m.workspace.id} href={`/app/w/${m.workspace.id}`} className="small">{m.workspace.name}</Link>)} />}
    >
      {children}
    </AppShell>
  );
}
