import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { listUserAgencies, listUserWorkspaces } from "@/server/tenancy";

export default async function AppIndex() {
  const user = await requireUser();
  const workspaces = await listUserWorkspaces(user.id);
  if (workspaces.length) redirect(`/app/w/${workspaces[0].workspace.id}`);
  const agencies = await listUserAgencies(user.id);
  if (agencies.length) redirect(`/app/agency/${agencies[0].agency.id}`);
  if (user.isPlatformAdmin) redirect("/app/admin");
  return (
    <main className="auth">
      <div className="auth-card">
        <h1 style={{ fontSize: 22 }}>No account yet</h1>
        <p className="muted">Your login works, but no workspace is linked to it. Ask the person who invited you, or start an agency.</p>
        <div className="row">
          <Link className="btn btn-primary" href="/app/agency/new">Start an agency</Link>
          <form action="/logout" method="post"><button className="btn">Log out</button></form>
        </div>
      </div>
    </main>
  );
}
