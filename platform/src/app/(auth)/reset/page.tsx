import { AuthShell } from "../AuthShell";
import { ResetForm } from "../forms";
import Link from "next/link";
import { Callout } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Choose a new password" sub="Pick one you'll remember this time. You go straight back in after.">
      {token ? <ResetForm token={token} /> : <Callout tone="error">This link is missing its token. <Link href="/forgot">Ask for a new one</Link>.</Callout>}
    </AuthShell>
  );
}
