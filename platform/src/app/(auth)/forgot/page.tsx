import { AuthShell, type AuthAside } from "../AuthShell";
import { ForgotForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset password" };

const ASIDE: AuthAside = {
  eyebrow: "Happens to everyone",
  title: "Back in two minutes, promise.",
  points: ["The link works once, and only for you", "Your funnels, leads and emails stay exactly as they are", "Choosing a new password confirms your email too"],
};

export default function ForgotPage() {
  return (
    <AuthShell title="Reset your password" sub="Pop in your email and we'll send you a link to choose a new one." aside={ASIDE}>
      <ForgotForm />
    </AuthShell>
  );
}
