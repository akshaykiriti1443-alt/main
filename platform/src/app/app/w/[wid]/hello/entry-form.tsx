"use client";

import { useActionState } from "react";
import { ArrowRightIcon } from "lucide-react";
import type { ClaimState } from "@/actions/unlocks";
import { Callout } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function EntryForm({ action, kind = "post" }: { action: (prev: ClaimState, fd: FormData) => Promise<ClaimState>; kind?: "post" | "comment" }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? <Callout tone="error">{state.error}</Callout> : null}
      <Field>
        <FieldLabel htmlFor="postUrl">{kind === "comment" ? "Link to your comment" : "Link to your intro post"}</FieldLabel>
        <Input id="postUrl" name="postUrl" type="url" required placeholder="https://www.skool.com/…" defaultValue={state.values?.postUrl} className="h-12 rounded-xl text-base" />
      </Field>
      <Button type="submit" variant="cta" size="lg" disabled={pending} className="w-full sm:w-auto sm:self-start">
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {pending ? "Opening your account…" : "Open my account"}
        {pending ? null : <ArrowRightIcon data-icon="inline-end" />}
      </Button>
    </form>
  );
}
