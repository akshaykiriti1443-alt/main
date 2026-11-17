import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { isEmail } from "@/lib/util";
import { AuthShell, type AuthAside } from "../AuthShell";
import { LoginForm } from "../forms";
import { Callout } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in" };

// ?error= and ?note= carry a code, never text: the login page only ever shows its own words, so a
// link can't put a made-up message on it.
const ERRORS: Record<string, string> = {
  "link-expired": "That link has expired. Log in and we'll help you get a new one.",
};
const NOTES: Record<string, string> = {
  // From the confirm-email wait screen, after the member confirmed on another device.
  confirmed: "Your email is confirmed. Log in once more on this device to carry on.",
  "signed-out": "You were logged out on this device. Log in to carry on.",
};

const ASIDE: AuthAside = {
  eyebrow: "Welcome back",
  title: "Your next step is right where you left it.",
  points: ["Your path remembers where you stopped", "New leads, sorted hot to cold", "One next step at a time, in the same order as the course"],
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; note?: string; email?: string }> }) {
  if (await getCurrentUser()) redirect("/app");
  const { next, error, note, email } = await searchParams;
  const message = error && Object.hasOwn(ERRORS, error) ? ERRORS[error] : null;
  const notice = !message && note && Object.hasOwn(NOTES, note) ? NOTES[note] : null;
  return (
    <AuthShell title="Welcome back" sub="Log in with the same email as your Skool account." aside={ASIDE}>
      {message ? (
        <Callout tone="error" className="mb-5">
          {message}
        </Callout>
      ) : null}
      {notice ? (
        <Callout tone={note === "confirmed" ? "ok" : "info"} className="mb-5">
          {notice}
        </Callout>
      ) : null}
      <LoginForm next={next} defaultEmail={email && isEmail(email) ? email : undefined} />
    </AuthShell>
  );
}
