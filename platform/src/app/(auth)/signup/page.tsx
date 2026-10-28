import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getCurrentUser } from "@/server/auth";
import { AuthShell } from "../AuthShell";
import { SignupForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  if (await getCurrentUser()) redirect("/app");
  const { code } = await searchParams;
  const db = await getDb();
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  return (
    <AuthShell
      title={count === 0 ? "Set up your platform" : "Claim your funnel account"}
      sub={count === 0 ? "You're the first user, so you become the platform owner." : "Included with your Skool membership. Takes 1 minute."}
    >
      <SignupForm needsCode={count > 0} defaultCode={code} />
    </AuthShell>
  );
}
