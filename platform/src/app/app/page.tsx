import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRoundSearchIcon } from "lucide-react";
import { requireUser } from "@/server/auth";
import { listUserAgencies, listUserWorkspaces } from "@/server/tenancy";
import { EmptyArt } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/app/(auth)/AuthShell";

export default async function AppIndex() {
  const user = await requireUser();
  const workspaces = await listUserWorkspaces(user.id);
  if (workspaces.length) redirect(`/app/w/${workspaces[0].workspace.id}`);
  const agencies = await listUserAgencies(user.id);
  if (agencies.length) redirect(`/app/agency/${agencies[0].agency.id}`);
  if (user.isPlatformAdmin) redirect("/app/admin");
  return (
    <AuthShell
      title="No account linked yet"
      sub={
        <>
          Your login works, but no workspace is attached to <b className="font-semibold text-foreground">{user.email}</b>. Ask the person who invited you to add this email, or start your own agency.
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <EmptyArt icon={UserRoundSearchIcon} className="mx-0" />
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button asChild size="lg" className="sm:flex-1">
            <Link href="/app/agency/new">Start an agency</Link>
          </Button>
          <form action="/logout" method="post" className="sm:flex-1">
            <Button variant="outline" size="lg" type="submit" className="w-full">
              Log out
            </Button>
          </form>
        </div>
      </div>
    </AuthShell>
  );
}
