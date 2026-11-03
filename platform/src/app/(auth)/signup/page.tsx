import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/server/auth";
import { getEntryTicket } from "@/server/unlocks";
import { AuthShell } from "../AuthShell";
import { SignupForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ email?: string; paid?: string; setup?: string }> }) {
  if (await getCurrentUser()) redirect("/app");
  const { email, paid, setup } = await searchParams;
  const db = await getDb();
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  const intro = count > 0 && !paid && Boolean((await getEntryTicket())?.on);
  return (
    <AuthShell
      title={count === 0 ? "Set up your platform" : "Claim your funnel account"}
      sub={
        count > 0
          ? paid
            ? "Payment received. Create your login with the same email, then click the link we email you and you're in."
            : `Included with your Skool membership. Sign up with your Skool email, click the link we send you${intro ? ", then say hi in the community" : ""}, and you're in.`
          : env.setupToken && !setup
            ? "Use the setup link from your server settings to claim this platform."
            : "You're the first user, so you become the platform owner."
      }
    >
      <SignupForm member={count > 0} defaultEmail={email} setup={count === 0 ? setup : undefined} />
    </AuthShell>
  );
}
