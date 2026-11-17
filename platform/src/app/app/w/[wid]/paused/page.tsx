import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRightIcon, CreditCardIcon, GraduationCapIcon, LockKeyholeIcon, MailIcon, MailOpenIcon, PauseCircleIcon, RefreshCwIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { requestHost } from "@/server/auth";
import { agencyForHost } from "@/server/agency";
import { accessGap } from "@/server/access";
import { VERIFY_HOURS, VERIFY_SUBJECT, verifyWaitTicket } from "@/server/emailVerify";
import { emailSendingOn, isLiveSite } from "@/server/email/providers";
import { checkAccessAction, resendVerifyAction } from "@/actions/account";
import { memberCheckoutConfigured } from "@/server/billing/stripe";
import { env } from "@/lib/env";
import { Callout, EmptyArt, Flash, IconTile, StepDot } from "@/components/ui";
import { VerifyWatch } from "./verify-watch";
import { SubmitButton } from "@/components/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** The calm top of the page: a little picture, what happened, and whose email we're looking for. */
function Head({ art, title, sub, email }: { art: ReactNode; title: string; sub: ReactNode; email?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {art}
      <span className="eyebrow">Your account</span>
      <h1 className="text-[36px] leading-[1.02] tracking-[-0.012em] md:text-[46px]">{title}</h1>
      <p className="max-w-[52ch] text-[15.5px] leading-relaxed text-muted-foreground md:text-[17px]">{sub}</p>
      {email ? (
        <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-card px-3.5 py-1.5 text-sm shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
          <MailIcon className="size-4 shrink-0 text-primary dark:text-violet-300" aria-hidden />
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
    const brand = await agencyForHost(await requestHost());
    const fromName = brand?.brand.name || env.platformName;
    // Only claim "we sent it" when it really went out: sending switched on, and the first send worked.
    const sendingOn = emailSendingOn();
    const unsent = sp.unsent === "1" && !sp.ok;
    const resend = (
      <form action={resendVerifyAction.bind(null, wid)}>
        <SubmitButton variant={unsent ? "cta" : "outline"} pendingText="Sending…" className="w-full sm:w-auto">
          Send the link again
        </SubmitButton>
      </form>
    );
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 md:py-6">
        <Head
          art={<EmptyArt icon={MailOpenIcon} />}
          title="Confirm your email"
          sub={
            sendingOn && !unsent ? (
              <>
                We sent a link to <strong className="text-foreground">{user.email}</strong>. Click it, press Confirm, and you&apos;re in. It proves the email is yours, because your access follows it.
              </>
            ) : (
              <>
                Your account is made. Next we email a link to <strong className="text-foreground">{user.email}</strong> to prove it&apos;s yours.
              </>
            )
          }
        />
        <Flash searchParams={sp} />
        {!sendingOn ? (
          <Callout tone="warn">
            {isLiveSite()
              ? "Our emails aren't going out right now, so the link can't reach you yet. Nothing is wrong with your account. Come back a little later and press Send the link again."
              : "This copy of the app only writes emails to its log, so the confirm link is there, not in your inbox."}
          </Callout>
        ) : unsent ? (
          <Callout tone="warn" title="The email didn't go out">
            Something got in the way just now. Press Send the link again to try once more.
          </Callout>
        ) : null}
        <VerifyWatch ticket={verifyWaitTicket(user.id)} wid={wid} email={user.email}>
          <Card>
            <CardContent className="flex flex-col gap-5">
              <ol className="flex flex-col gap-4">
                <li className="flex items-start gap-3">
                  <StepDot n={1} active />
                  <span className="grid gap-1.5 pt-0.5">
                    <span>
                      <b className="font-semibold">Open your inbox.</b> <span className="text-muted-foreground">Look for &ldquo;{VERIFY_SUBJECT}&rdquo; from:</span>
                    </span>
                    <span className="inline-flex w-fit max-w-full items-center gap-2 rounded-lg bg-muted px-2.5 py-1 text-sm">
                      <MailIcon className="size-3.5 shrink-0 text-primary dark:text-violet-300" aria-hidden />
                      <span className="min-w-0 truncate">
                        <b className="font-semibold">{fromName}</b> <span className="text-muted-foreground">{env.emailFrom}</span>
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground">Not there in a minute? Check Promotions and Spam. Gmail often files it under Promotions.</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <StepDot n={2} />
                  <span className="pt-0.5">
                    <b className="font-semibold">Click the link, then press Confirm.</b>{" "}
                    <span className="text-muted-foreground">If it asks you to log in, use this email and the password you just chose.</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <StepDot n={3} />
                  <span className="pt-0.5">
                    <b className="font-semibold">Opened it on your phone?</b>{" "}
                    <span className="text-muted-foreground">That&apos;s fine. Confirm there, then come back to this screen. It notices and asks you to log in once more here.</span>
                  </span>
                </li>
              </ol>
              <div className="flex flex-col gap-3 border-t border-dashed border-border-strong pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">Still nothing? Ask for a fresh one. Each link works for {VERIFY_HOURS / 24} days.</p>
                {resend}
              </div>
            </CardContent>
          </Card>
        </VerifyWatch>
        <form action="/logout" method="post" className="text-center text-sm text-muted-foreground">
          Typed the wrong email?{" "}
          <button type="submit" className="font-semibold text-primary underline-offset-4 hover:underline dark:text-violet-300">
            Log out
          </button>{" "}
          and sign up again with the right one.
        </form>
      </div>
    );
  }

  // Their list is theirs, whatever happened to the membership.
  const takeLeads = (
    <p className="text-center text-sm text-muted-foreground">
      Want your leads?{" "}
      <a href={`/app/w/${wid}/leads/export`} download>
        Download them as a CSV
      </a>
      .
    </p>
  );

  // Someone who only ever had the free welcome days never lost a membership: we just haven't
  // matched them to one yet. They get the calm "unlock" wording, never "paused".
  const matching = memberGate && !neverActive && (await accessGap(user.email)) === "matching";
  const fresh = neverActive || matching;
  const head = (
    <Head
      art={<EmptyArt icon={fresh ? LockKeyholeIcon : PauseCircleIcon} tone={fresh ? "primary" : "warning"} />}
      title={fresh ? "Unlock your account" : `${workspace.name} is paused`}
      sub={
        neverActive
          ? "Your account is ready and waiting. It switches on by itself the moment we see you as an active member. No code needed."
          : matching
            ? "We haven't matched your email to a membership yet. Until we do, your website is offline and automatic emails are paused, so pause any ads that point to it. Everything you made is saved and switches back on by itself once we see you as a member."
            : "Your website is offline and automatic emails are stopped, so pause any ads that point to it. Your website, leads and emails are all saved, and come back the moment access returns."
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
                : <>We paused this account. Email us at <a href={`mailto:${env.emailReplyTo}`}>{env.emailReplyTo}</a> and we&apos;ll sort it out.</>}
            </p>
          </CardContent>
        </Card>
        {takeLeads}
      </div>
    );
  }

  // Two doors in. The community is the main one; buying directly is the shortcut, when it's on.
  const skoolTiming = env.skoolWebhookSecret
    ? "Paid members show up here within about 15 minutes. Trials appear at the next member update."
    : "We update the member list every few days when new members are joining. Joined recently? You switch on at the next update.";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 md:py-6">
      {head}
      <Flash searchParams={sp} />

      {env.skoolGroupUrl ? (
        <Card className="ring-violet-200/90 dark:ring-violet-400/20">
          <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3.5">
              <IconTile icon={GraduationCapIcon} className="size-11 rounded-2xl" />
              <div className="grid min-w-0 gap-1">
                <h2 className="text-lg">{fresh ? "Join the Skool community" : "Rejoin the Skool community"}</h2>
                <p className="text-sm text-muted-foreground">Use this same email. Your account turns on by itself, no forms.</p>
              </div>
            </div>
            <Button asChild variant="cta" size="lg" className="w-full shrink-0 sm:w-auto">
              <a href={env.skoolGroupUrl} target="_blank" rel="noreferrer">
                Join on Skool
                <ArrowUpRightIcon data-icon="inline-end" />
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
                <span className="text-[15px] font-semibold tracking-[-0.01em]">Or buy the app directly</span>
                <span className="text-sm text-muted-foreground">Pay by card and it turns on in seconds.{env.memberPriceLabel ? ` ${env.memberPriceLabel}.` : ""}</span>
              </div>
            </div>
            <Button asChild variant={env.skoolGroupUrl ? "outline" : "cta"} className="w-full shrink-0 sm:w-auto">
              <Link href={`/join?email=${encodeURIComponent(user.email)}`}>Buy access</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-border-strong bg-muted/30 p-5">
        <div className="grid gap-1">
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Already a member?</span>
          <span className="text-sm text-muted-foreground">{skoolTiming}</span>
        </div>
        <form action={checkAccessAction.bind(null, wid)} className="flex flex-col gap-3">
          <input type="hidden" name="back" value={`/app/w/${wid}/paused`} />
          <SubmitButton variant={env.skoolGroupUrl || canBuy ? "outline" : "default"} className="w-full sm:w-auto sm:self-start" pendingText="Checking…">
            <RefreshCwIcon data-icon="inline-start" />
            I&apos;m a member, check again
          </SubmitButton>
          <p className="text-xs text-muted-foreground">
            Used a different email on Skool? Put this email in the community&apos;s membership question, or email us at{" "}
            <a href={`mailto:${env.emailReplyTo}`}>{env.emailReplyTo}</a>.
          </p>
        </form>
      </div>
      {takeLeads}
    </div>
  );
}
