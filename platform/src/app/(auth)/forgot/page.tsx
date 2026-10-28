import { AuthShell } from "../AuthShell";
import { ForgotForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <AuthShell title="Reset your password" sub="We'll email you a link.">
      <ForgotForm />
    </AuthShell>
  );
}
