import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { AuthShell } from "../AuthShell";
import { LoginForm } from "../forms";
import { Callout } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in" };

// ?error= carries a code, never text: the login page only ever shows its own words, so a link
// can't put a made-up message on it.
const ERRORS: Record<string, string> = {
  "link-expired": "That link has expired. Log in and we'll help you get a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  if (await getCurrentUser()) redirect("/app");
  const { next, error } = await searchParams;
  const message = error && Object.hasOwn(ERRORS, error) ? ERRORS[error] : null;
  return (
    <AuthShell title="Welcome back" sub="Log in to your funnels, leads and inbox.">
      {message ? (
        <Callout tone="error" className="mb-4">
          {message}
        </Callout>
      ) : null}
      <LoginForm next={next} />
    </AuthShell>
  );
}
