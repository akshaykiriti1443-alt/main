import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRoundXIcon } from "lucide-react";
import { requireUser } from "@/server/auth";
import { listUserAgencies, listUserWorkspaces } from "@/server/tenancy";
import { Empty } from "@/components/ui";
import { Button } from "@/components/ui/button";

export default async function AppIndex() {
  const user = await requireUser();
  const workspaces = await listUserWorkspaces(user.id);
  if (workspaces.length) redirect(`/app/w/${workspaces[0].workspace.id}`);
  const agencies = await listUserAgencies(user.id);
  if (agencies.length) redirect(`/app/agency/${agencies[0].agency.id}`);
  if (user.isPlatformAdmin) redirect("/app/admin");
  return (
    <main className="grid min-h-svh place-items-center px-4">
      <div className="w-full max-w-md">
        <Empty
          icon={UserRoundXIcon}
          title="No account yet"
          body="Your login works, but no workspace is linked to it. Ask the person who invited you, or start an agency."
          action={
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/app/agency/new">Start an agency</Link>
              </Button>
              <form action="/logout" method="post">
                <Button variant="outline" type="submit">
                  Log out
                </Button>
              </form>
            </div>
          }
        />
      </div>
    </main>
  );
}
