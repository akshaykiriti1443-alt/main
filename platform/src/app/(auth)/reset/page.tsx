import { AuthShell } from "../AuthShell";
import { ResetForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Choose a new password">
      {token ? <ResetForm token={token} /> : <p className="alert alert-err">This link is missing its token. Ask for a new one.</p>}
    </AuthShell>
  );
}
