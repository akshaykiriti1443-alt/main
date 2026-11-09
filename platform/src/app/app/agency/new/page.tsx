import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireUser } from "@/server/auth";
import { createAgencyAction } from "@/actions/agency";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthShell, type AuthAside } from "@/app/(auth)/AuthShell";

const ASIDE: AuthAside = {
  eyebrow: "Optional · Agency or software",
  title: "Your brand. Your prices. Your clients.",
  points: ["Your logo and colours on every screen", "Your own domain for logins and funnels", "Every client account in one place", "Set your own markup on top"],
  scene: "agency",
};

export default async function NewAgencyPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser();
  return (
    <AuthShell
      lesson="B.1"
      stage="Bonus"
      title="Start your agency"
      sub="Grow into an agency or software of your own on this stack. One name to start; logo, domain and prices come after."
      aside={ASIDE}
    >
      <FieldGroup className="gap-5">
        <Flash searchParams={await searchParams} />
        <form action={createAgencyAction} className="flex flex-col gap-5" data-guide="agency-new">
          <Field>
            <FieldLabel htmlFor="name">Agency name</FieldLabel>
            <Input id="name" name="name" required placeholder="Growth Lab Agency" />
            <FieldDescription>Your clients see this name. You can change it later.</FieldDescription>
          </Field>
          <SubmitButton variant="cta" size="lg" className="mt-1 w-full" pendingText="Creating…">
            Create my agency
          </SubmitButton>
        </form>
        <p className="text-center text-sm">
          <Link href="/app" className="inline-flex items-center gap-1.5 font-medium text-muted-foreground no-underline hover:text-foreground hover:no-underline">
            <ArrowLeftIcon className="size-3.5" aria-hidden />
            Not now, take me back
          </Link>
        </p>
      </FieldGroup>
    </AuthShell>
  );
}
