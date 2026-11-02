import Link from "next/link";
import { requireUser } from "@/server/auth";
import { createAgencyAction } from "@/actions/agency";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/app/(auth)/AuthShell";

export default async function NewAgencyPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser();
  return (
    <AuthShell title="Start your agency" sub="Resell this platform under your own brand. Add client accounts, load your templates and set your own prices.">
      <FieldGroup className="gap-5">
        <Flash searchParams={await searchParams} />
        <form action={createAgencyAction} className="flex flex-col gap-5">
          <Field>
            <FieldLabel htmlFor="name">Agency name</FieldLabel>
            <Input id="name" name="name" required placeholder="Growth Lab Agency" />
          </Field>
          <SubmitButton size="lg" className="h-10 w-full" pendingText="Creating…">
            Create agency
          </SubmitButton>
        </form>
        <p className="text-center text-sm">
          <Link href="/app">Back</Link>
        </p>
      </FieldGroup>
    </AuthShell>
  );
}
