"use client";

import { useActionState } from "react";
import type { ClaimState } from "@/actions/unlocks";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function EntryForm({ action, kind = "post" }: { action: (prev: ClaimState, fd: FormData) => Promise<ClaimState>; kind?: "post" | "comment" }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}
      <Field>
        <FieldLabel htmlFor="postUrl">{kind === "comment" ? "Link to your comment" : "Link to your intro post"}</FieldLabel>
        <Input id="postUrl" name="postUrl" type="url" required placeholder="https://www.skool.com/…" defaultValue={state.values?.postUrl} />
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Opening your account…" : "Open my account"}
      </Button>
    </form>
  );
}
