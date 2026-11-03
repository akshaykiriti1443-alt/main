"use client";

import { useActionState } from "react";
import { CheckCircle2Icon, ExternalLinkIcon, MailIcon } from "lucide-react";
import type { ClaimState } from "@/actions/unlocks";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ClaimForm({ action, postLabel }: { action: (prev: ClaimState, fd: FormData) => Promise<ClaimState>; postLabel: string }) {
  const [state, formAction, pending] = useActionState(action, {});

  if (state.done) {
    const d = state.done;
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-success-soft text-success">
          <CheckCircle2Icon className="size-6" />
        </span>
        <h2 className="text-lg font-semibold">{d.already ? "You already unlocked this" : "Unlocked! 🎉"}</h2>
        {d.reward ? <p className="text-sm text-muted-foreground">{d.reward}</p> : null}
        {d.rewardUrl ? (
          <Button asChild size="lg">
            <a href={d.rewardUrl} target="_blank" rel="noreferrer">
              Open {d.title} <ExternalLinkIcon data-icon="inline-end" />
            </a>
          </Button>
        ) : null}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MailIcon className="size-3.5" /> {d.already ? "It's in your inbox from last time too." : "We've emailed it to you as well."}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Field>
        <FieldLabel htmlFor="postUrl">{postLabel}</FieldLabel>
        <Input id="postUrl" name="postUrl" type="url" required placeholder="https://www.skool.com/…" defaultValue={state.values?.postUrl} />
        <FieldDescription>In Skool, open the ⋯ menu on your post and choose Copy link.</FieldDescription>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="name">Your name</FieldLabel>
          <Input id="name" name="name" autoComplete="name" defaultValue={state.values?.name} />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" required autoComplete="email" defaultValue={state.values?.email} />
        </Field>
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Unlocking…" : "Unlock it"}
      </Button>
    </form>
  );
}
