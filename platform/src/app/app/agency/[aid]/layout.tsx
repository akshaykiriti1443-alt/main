import Link from "next/link";
import { requireAgency, listUserWorkspaces } from "@/server/tenancy";
import { AppShell, UserFooter } from "@/components/AppShell";

export default async function AgencyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ aid: string }> }) {
  const { aid } = await params;
  const { agency, user } = await requireAgency(aid);
  const mine = await listUserWorkspaces(user.id);
  const base = `/app/agency/${aid}`;
  return (
    <AppShell
      brand={{ ...agency.brand, name: agency.brand.name || agency.name }}
      groups={[
        {
          title: "Agency",
          items: [
            { href: base, label: "Client accounts", exact: true },
            { href: `${base}/templates`, label: "Templates" },
            { href: `${base}/settings`, label: "Branding & pricing" },
            { href: `${base}/billing`, label: "Plan & wallet" },
          ],
        },
      ]}
      banner={
        agency.plan !== "agency" ? (
          <div className="alert alert-warn">Your Agency plan isn't active yet. <Link href={`${base}/billing`}>Activate it</Link> to add client accounts.</div>
        ) : agency.status === "paused" ? (
          <div className="alert alert-err">Your agency is paused. Client pages are offline until billing is fixed.</div>
        ) : null
      }
      footer={
        <UserFooter
          email={user.email}
          extra={
            <>
              {mine.slice(0, 3).map((m) => (
                <Link key={m.workspace.id} href={`/app/w/${m.workspace.id}`} className="small">{m.workspace.name}</Link>
              ))}
              {user.isPlatformAdmin ? <Link href="/app/admin" className="small">Platform admin</Link> : null}
            </>
          }
        />
      }
    >
      {children}
    </AppShell>
  );
}
