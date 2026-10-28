import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { AuthShell } from "../AuthShell";
import { LoginForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/app");
  const { next } = await searchParams;
  return (
    <AuthShell title="Welcome back" sub="Log in to your funnels, leads and inbox.">
      <LoginForm next={next} />
    </AuthShell>
  );
}
