"use client";

import { useActionState } from "react";
import { ArrowRightIcon, CheckIcon, ExternalLinkIcon, MailIcon } from "lucide-react";
import type { ClaimState } from "@/actions/unlocks";
import { Callout } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function ClaimForm({ action, kind }: { action: (prev: ClaimState, fd: FormData) => Promise<ClaimState>; kind: "post" | "comment" }) {
  const [state, formAction, pending] = useActionState(action, {});

  if (state.done) {
    const d = state.done;
    return (
      <div role="status" className="flex flex-col items-center gap-4 py-2 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-success-soft text-success ring-8 ring-success/[0.07]">
          <CheckIcon className="size-7" strokeWidth={2.5} aria-hidden />
        </span>
        <h2 className="font-display text-[30px] leading-tight font-normal tracking-[-0.01em]">{d.already ? "You already unlocked this" : "Unlocked! 🎉"}</h2>
        {d.reward ? <p className="max-w-[40ch] text-sm leading-relaxed text-muted-foreground">{d.reward}</p> : null}
        {d.rewardUrl ? (
          <Button asChild variant="cta" size="lg">
            <a href={d.rewardUrl} target="_blank" rel="noreferrer">
              Open {d.title} <ExternalLinkIcon data-icon="inline-end" />
            </a>
          </Button>
        ) : null}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MailIcon className="size-3.5" aria-hidden /> {d.already ? "It's in your inbox from last time too." : "We've emailed it to you as well."}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? <Callout tone="error">{state.error}</Callout> : null}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Field>
        <FieldLabel htmlFor="postUrl">Link to your {kind}</FieldLabel>
        <Input id="postUrl" name="postUrl" type="url" required placeholder="https://www.skool.com/…" defaultValue={state.values?.postUrl} className="h-11" />
        <FieldDescription>In Skool, open the ⋯ menu on your {kind} and choose Copy link.</FieldDescription>
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
      <Button type="submit" variant="cta" size="lg" disabled={pending} className="mt-1 w-full">
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {pending ? "Unlocking…" : "Unlock it"}
        {pending ? null : <ArrowRightIcon data-icon="inline-end" />}
      </Button>
    </form>
  );
}
