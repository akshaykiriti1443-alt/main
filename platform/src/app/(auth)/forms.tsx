"use client";

import { useActionState, type ReactNode } from "react";
import Link from "next/link";
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { forgotAction, joinAction, loginAction, resetAction, signupAction, type FormState } from "./actions";

function Msg({ state }: { state: FormState }) {
  if (state.error)
    return (
      <Alert role="alert" className="border-destructive/25 bg-destructive/10 text-destructive">
        <CircleAlertIcon />
        <AlertDescription className="text-destructive">{state.error}</AlertDescription>
      </Alert>
    );
  if (state.ok)
    return (
      <Alert role="status" className="border-success/25 bg-success-soft text-success">
        <CircleCheckIcon />
        <AlertDescription className="text-success">{state.ok}</AlertDescription>
      </Alert>
    );
  return null;
}

function Submit({ pending, children, pendingText }: { pending: boolean; children: ReactNode; pendingText: string }) {
  return (
    <Button type="submit" size="lg" className="h-10 w-full" disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? pendingText : children}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <form action={action}>
      <FieldGroup className="gap-5">
        <Msg state={state} />
        <input type="hidden" name="next" value={next ?? ""} />
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus defaultValue={state.values?.email} />
        </Field>
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link href="/forgot" className="text-sm">
              Forgot password?
            </Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Submit pending={pending} pendingText="Logging in…">
          Log in
        </Submit>
        <p className="text-center text-sm text-muted-foreground">
          New here? <Link href="/signup">Create an account</Link>
        </p>
      </FieldGroup>
    </form>
  );
}

export function SignupForm({ member, defaultEmail, setup }: { member: boolean; defaultEmail?: string; setup?: string }) {
  const [state, action, pending] = useActionState(signupAction, {});
  return (
    <form action={action}>
      <FieldGroup className="gap-5">
        <Msg state={state} />
        {setup ? <input type="hidden" name="setup" value={setup} /> : null}
        <Field>
          <FieldLabel htmlFor="name">Your name</FieldLabel>
          <Input id="name" name="name" autoComplete="name" required autoFocus defaultValue={state.values?.name} />
        </Field>
        <Field>
          <FieldLabel htmlFor="businessName">Community or business name</FieldLabel>
          <Input id="businessName" name="businessName" placeholder="Fit Dads Club" defaultValue={state.values?.businessName} />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email ?? defaultEmail} />
          {member ? (
            <FieldDescription>Use the same email as your Skool account (or the one you bought with). That&apos;s how we know you&apos;re a member.</FieldDescription>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          <FieldDescription>At least 8 characters.</FieldDescription>
        </Field>
        <Submit pending={pending} pendingText="Creating your account…">
          Create my account
        </Submit>
        <p className="text-center text-sm text-muted-foreground">
          Have an account? <Link href="/login">Log in</Link>
        </p>
      </FieldGroup>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotAction, {});
  return (
    <form action={action}>
      <FieldGroup className="gap-5">
        <Msg state={state} />
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </Field>
        <Submit pending={pending} pendingText="Sending…">
          Email me a reset link
        </Submit>
        <p className="text-center text-sm">
          <Link href="/login">Back to log in</Link>
        </p>
      </FieldGroup>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetAction, {});
  return (
    <form action={action}>
      <FieldGroup className="gap-5">
        <Msg state={state} />
        <input type="hidden" name="token" value={token} />
        <Field>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required autoFocus />
          <FieldDescription>At least 8 characters.</FieldDescription>
        </Field>
        <Submit pending={pending} pendingText="Saving…">
          Save password
        </Submit>
      </FieldGroup>
    </form>
  );
}

export function JoinForm({ defaultEmail, priceLabel }: { defaultEmail?: string; priceLabel?: string }) {
  const [state, action, pending] = useActionState(joinAction, {});
  return (
    <form action={action}>
      <FieldGroup className="gap-5">
        <Msg state={state} />
        <Field>
          <FieldLabel htmlFor="name">Your name</FieldLabel>
          <Input id="name" name="name" autoComplete="name" defaultValue={state.values?.name} />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email ?? defaultEmail} />
          <FieldDescription>Your account is tied to this email. Use the same one when you create your login.</FieldDescription>
        </Field>
        <Submit pending={pending} pendingText="Opening secure checkout…">
          {priceLabel ? `Continue to payment · ${priceLabel}` : "Continue to payment"}
        </Submit>
        <p className="text-center text-sm text-muted-foreground">
          Already a member? <Link href="/signup">Create your login</Link>
        </p>
      </FieldGroup>
    </form>
  );
}
