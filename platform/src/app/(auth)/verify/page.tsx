import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { VERIFY_EXPIRED, isEmailVerified, readVerifyToken } from "@/server/emailVerify";
import { Callout } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { AuthShell } from "../AuthShell";
import { LoginForm, VerifyForm } from "../forms";

// The link in the "Confirm your email" message. Opening it changes nothing (mail scanners open
// links too): the account's owner, logged in, presses Confirm. That proves the address, turns
// access on if the email is a member (or starts the welcome window) and keeps them signed in.
export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm your email" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const data = readVerifyToken(token);
  if (!data) {
    return (
      <AuthShell title="Confirm your email">
        <Callout tone="error" className="mb-4">
          {VERIFY_EXPIRED}
        </Callout>
        <Button asChild className="w-full">
          <Link href="/login">Log in</Link>
        </Button>
      </AuthShell>
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return (
      <AuthShell title="Confirm your email" sub={`Log in with the password you chose for ${data.email}, then confirm.`}>
        <LoginForm next={`/verify?token=${encodeURIComponent(token)}`} />
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Didn&apos;t create this account, or forgot the password? <Link href="/forgot">Reset the password</Link>. That confirms the email too.
        </p>
      </AuthShell>
    );
  }

  if (user.id !== data.uid) {
    return (
      <AuthShell title="Confirm your email">
        <Callout tone="error" className="mb-4">
          This link is for {data.email}, but you&apos;re logged in as {user.email}. Log out, then open the link again.
        </Callout>
        <form action="/logout" method="post">
          <Button type="submit" variant="outline" className="w-full">
            Log out
          </Button>
        </form>
      </AuthShell>
    );
  }

  // Already confirmed: nothing to do (and never a fresh sign-in from an old link).
  if (await isEmailVerified(user.id)) redirect("/app");

  return (
    <AuthShell title="Confirm your email" sub={`Press the button to confirm ${data.email} is yours. Your account opens right after.`}>
      <VerifyForm token={token} />
    </AuthShell>
  );
}
