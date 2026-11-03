import Link from "next/link";
import type { ReactNode } from "react";
import { CreditCardIcon, GraduationCapIcon, LockKeyholeIcon, MailIcon, MailOpenIcon, PauseCircleIcon, RefreshCwIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { checkAccessAction, resendVerifyAction } from "@/actions/account";
import { memberCheckoutConfigured } from "@/server/billing/stripe";
import { env } from "@/lib/env";
import { EmptyArt, Flash, IconTile, StepDot } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** The calm top of the page: a little picture, what happened, and whose email we're looking for. */
function Head({ art, title, sub, email }: { art: ReactNode; title: string; sub: ReactNode; email?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {art}
      <h1 className="text-[30px] leading-[1.1] font-bold md:text-[36px]">{title}</h1>
      <p className="max-w-[52ch] text-base text-muted-foreground md:text-[17px]">{sub}</p>
      {email ? (
        <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-card px-3.5 py-1.5 text-sm shadow-card ring-1 ring-foreground/[0.07]">
          <MailIcon className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 truncate">
            We look for <b className="font-semibold">{email}</b>
          </span>
        </span>
      ) : null}
    </div>
  );
}

export default async function PausedPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace, agency, user } = await requireWorkspace(wid, "user", { allowPaused: true, allowEntry: true });
  const viaAgency = !agency.isPlatform;
  // A brand-new account that hasn't been matched to a membership yet, vs one whose membership lapsed.
  const neverActive = workspace.pauseReason === "access" && !workspace.accessVerifiedUntil;
  const memberGate = !viaAgency && workspace.pauseReason === "access";
  const canBuy = memberCheckoutConfigured();
  const sp = await searchParams;

  // Just signed up: the email has to be confirmed before any membership can turn the account on.
  if (workspace.pauseReason === "verify") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 md:py-6">
        <Head
          art={<EmptyArt icon={MailOpenIcon} />}
          title="Confirm your email"
          sub={
            <>
              We sent a link to <strong className="text-foreground">{user.email}</strong>. Click it and your account opens. Your access follows your email, so this proves it&apos;s yours.
            </>
          }
        />
        <Flash searchParams={sp} />
        <Card>
          <CardContent className="flex flex-col gap-5">
            <ol className="flex flex-col gap-4">
              <li className="flex items-start gap-3">
                <StepDot n={1} active />
                <span className="pt-0.5">
                  <b className="font-semibold">Open your inbox.</b> <span className="text-muted-foreground">Look for an email from us called &ldquo;Confirm your email&rdquo;.</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <StepDot n={2} />
                <span className="pt-0.5">
                  <b className="font-semibold">Click the link, then press Confirm.</b> <span className="text-muted-foreground">You land straight back in your account.</span>
                </span>
              </li>
            </ol>
            <div className="flex flex-col gap-2 border-t border-dashed pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">Not there? Check spam or promotions. The link works for 3 days.</p>
              <form action={resendVerifyAction.bind(null, wid)}>
                <SubmitButton variant="outline" pendingText="Sending…" className="w-full sm:w-auto">
                  Send the link again
                </SubmitButton>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const head = (
    <Head
      art={<EmptyArt icon={neverActive ? LockKeyholeIcon : PauseCircleIcon} tone={neverActive ? "primary" : "warning"} />}
      title={neverActive ? "Unlock your account" : `${workspace.name} is paused`}
      sub={
        neverActive
          ? "Your account is ready and waiting. It switches on by itself the moment we see you as an active member. No code needed."
          : "Your pages are offline and automations are stopped. Your funnels, leads and emails are all saved, and come back the moment access returns."
      }
      email={memberGate ? user.email : undefined}
    />
  );

  if (!memberGate) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 md:py-6">
        {head}
        <Flash searchParams={sp} />
        <Card>
          <CardContent className="flex items-start gap-3">
            <IconTile icon={MailIcon} tone="muted" />
            <p className="pt-1.5 text-[15px]">
              {viaAgency
                ? `Contact ${agency.brand.name || agency.name} to turn your account back on.`
                : "The platform team paused this account. Reply to any email from us and we'll sort it out."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Two doors in. The community is the main one; buying directly is the shortcut, when it's on.
  const skoolTiming = env.skoolWebhookSecret
    ? "Paid members show up here within about 15 minutes. Trials appear at the next weekly member update."
    : "We update the member list about once a week. Joined in the last few days? You switch on at the next update.";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 md:py-6">
      {head}
      <Flash searchParams={sp} />

      {env.skoolGroupUrl ? (
        <Card className="ring-primary/20">
          <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3.5">
              <IconTile icon={GraduationCapIcon} className="size-11 rounded-2xl" />
              <div className="grid min-w-0 gap-1">
                <h2 className="text-lg">{neverActive ? "Join the Skool community" : "Rejoin the Skool community"}</h2>
                <p className="text-sm text-muted-foreground">Use this same email. Your account turns on by itself, no forms.</p>
              </div>
            </div>
            <Button asChild size="lg" className="w-full shrink-0 sm:w-auto">
              <a href={env.skoolGroupUrl} target="_blank" rel="noreferrer">
                Join on Skool
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {canBuy ? (
        <Card size="sm">
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3.5">
              <IconTile icon={CreditCardIcon} tone="gold" />
              <div className="grid min-w-0 gap-0.5">
                <span className="font-heading text-[15px] font-semibold">Or buy the app directly</span>
                <span className="text-sm text-muted-foreground">Pay by card and it turns on in seconds.{env.memberPriceLabel ? ` ${env.memberPriceLabel}.` : ""}</span>
              </div>
            </div>
            <Button asChild variant={env.skoolGroupUrl ? "outline" : "default"} className="w-full shrink-0 sm:w-auto">
              <Link href={`/join?email=${encodeURIComponent(user.email)}`}>Buy access</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-foreground/15 bg-muted/35 p-5">
        <div className="grid gap-1">
          <span className="font-heading text-[15px] font-semibold">Already a member?</span>
          <span className="text-sm text-muted-foreground">{skoolTiming}</span>
        </div>
        <form action={checkAccessAction.bind(null, wid)} className="flex flex-col gap-3">
          <input type="hidden" name="back" value={`/app/w/${wid}/paused`} />
          <SubmitButton variant="outline" className="w-full bg-card sm:w-auto sm:self-start" pendingText="Checking…">
            <RefreshCwIcon data-icon="inline-start" />
            I&apos;m a member, check again
          </SubmitButton>
          <p className="text-xs text-muted-foreground">
            Used a different email on Skool? Put this email in the community&apos;s membership question, or reply to any email from us.
          </p>
        </form>
      </div>
    </div>
  );
}
