import Link from "next/link";
import { requireUser } from "@/server/auth";
import { createAgencyAction } from "@/actions/agency";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function NewAgencyPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser();
  return (
    <main className="auth">
      <div className="auth-card">
        <h1 style={{ fontSize: 24 }}>Start your agency</h1>
        <p className="muted">Resell this platform under your own brand. Add client accounts, load your templates and set your own prices.</p>
        <Flash searchParams={await searchParams} />
        <form action={createAgencyAction} className="stack">
          <div className="field"><label htmlFor="name">Agency name</label><input id="name" name="name" required placeholder="Growth Lab Agency" /></div>
          <SubmitButton>Create agency</SubmitButton>
        </form>
        <Link href="/app" className="small">Back</Link>
      </div>
    </main>
  );
}
