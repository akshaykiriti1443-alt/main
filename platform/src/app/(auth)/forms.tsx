"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotAction, loginAction, resetAction, signupAction, type FormState } from "./actions";

function Msg({ state }: { state: FormState }) {
  if (state.error) return <p className="alert alert-err" role="alert">{state.error}</p>;
  if (state.ok) return <p className="alert alert-ok" role="status">{state.ok}</p>;
  return null;
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <form action={action} className="stack">
      <Msg state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Logging in…" : "Log in"}</button>
      <div className="row-between small">
        <Link href="/forgot">Forgot password?</Link>
        <Link href="/signup">Create an account</Link>
      </div>
    </form>
  );
}

export function SignupForm({ needsCode, defaultCode, setup }: { needsCode: boolean; defaultCode?: string; setup?: string }) {
  const [state, action, pending] = useActionState(signupAction, {});
  return (
    <form action={action} className="stack">
      <Msg state={state} />
      {setup ? <input type="hidden" name="setup" value={setup} /> : null}
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" autoComplete="name" required defaultValue={state.values?.name} />
      </div>
      <div className="field">
        <label htmlFor="businessName">Community or business name</label>
        <input id="businessName" name="businessName" placeholder="Fit Dads Club" defaultValue={state.values?.businessName} />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
        <span className="help">Use the email from your Skool account.</span>
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {needsCode ? (
        <div className="field">
          <label htmlFor="code">Member code</label>
          <input id="code" name="code" defaultValue={state.values?.code ?? defaultCode} placeholder="From the Start Here lesson" style={{ textTransform: "uppercase" }} />
          <span className="help">Find this month's code in the Skool classroom. Paid members added through Zapier can leave it blank.</span>
        </div>
      ) : null}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Creating your account…" : "Create my account"}</button>
      <p className="small muted">
        Have an account? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotAction, {});
  return (
    <form action={action} className="stack">
      <Msg state={state} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Sending…" : "Email me a reset link"}</button>
      <Link href="/login" className="small">Back to log in</Link>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetAction, {});
  return (
    <form action={action} className="stack">
      <Msg state={state} />
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label htmlFor="password">New password</label>
        <input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required />
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save password"}</button>
    </form>
  );
}
