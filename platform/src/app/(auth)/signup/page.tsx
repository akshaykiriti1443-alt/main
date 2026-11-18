import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/server/auth";
import { getEntryTicket } from "@/server/unlocks";
import { AuthShell, type AuthAside } from "../AuthShell";
import { SignupForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your account" };

// What Day 1 of the course does here, in its words. No promises, no numbers we can't stand behind.
const ASIDE: AuthAside = {
  eyebrow: "For Skool community owners",
  title: "Day 1 of the course happens in here.",
  points: [
    "Your first post, from a reel that already works in your niche",
    "Your Skool About page and cover, written and made by AI",
    "Your AI runs on your own key. A free Gemini key works",
    "One next step at a time, in the same order as the course",
  ],
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ email?: string; paid?: string; setup?: string }> }) {
  if (await getCurrentUser()) redirect("/app");
  const { email, paid, setup } = await searchParams;
  const db = await getDb();
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  const intro = count > 0 && !paid && Boolean((await getEntryTicket())?.on);
  return (
    <AuthShell
      title={count === 0 ? "Set up your platform" : "Create your account"}
      sub={
        count > 0
          ? paid
            ? "Payment received. Use the email you paid with. Next, you click the link we email you and you're in."
            : `Use the same email as your Skool account, so the app knows you're a member. Next, you click the link we email you${intro ? " and say hi in the community" : ""}, and you're in.`
          : env.setupToken && !setup
            ? "Use the setup link from your server settings to claim this platform."
            : "You're the first one here, so this account becomes the platform owner."
      }
      aside={count > 0 ? ASIDE : undefined}
    >
      <SignupForm member={count > 0} defaultEmail={email} setup={count === 0 ? setup : undefined} />
    </AuthShell>
  );
}
