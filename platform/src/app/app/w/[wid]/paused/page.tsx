import Link from "next/link";
import { LockKeyholeIcon, PauseCircleIcon } from "lucide-react";
import { requireWorkspace } from "@/server/tenancy";
import { checkAccessAction } from "@/actions/account";
import { memberCheckoutConfigured } from "@/server/billing/stripe";
import { env } from "@/lib/env";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PausedPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace, agency, user } = await requireWorkspace(wid, "user", { allowPaused: true });
  const viaAgency = !agency.isPlatform;
  // A brand-new account that hasn't been matched to a membership yet, vs one whose membership lapsed.
  const neverActive = workspace.pauseReason === "access" && !workspace.accessVerifiedUntil;
  const memberGate = !viaAgency && workspace.pauseReason === "access";
  const canBuy = memberCheckoutConfigured();

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader className="gap-3">
        <span className={`grid size-10 place-items-center rounded-xl ${neverActive ? "bg-accent text-primary" : "bg-warning-soft text-warning"}`}>
          {neverActive ? <LockKeyholeIcon className="size-5" /> : <PauseCircleIcon className="size-5" />}
        </span>
        <CardTitle>
          <h1 className="text-xl font-semibold tracking-tight">{neverActive ? "Unlock your account" : `${workspace.name} is paused`}</h1>
        </CardTitle>
        <CardDescription>
          {neverActive
            ? "Your account is ready. It turns on by itself as soon as we see you as an active member. No code needed."
            : "Your pages are offline and automations are stopped. Your funnels, leads and emails are saved and come back the moment access returns."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Flash searchParams={await searchParams} />
        {viaAgency ? (
          <p className="text-sm">Contact {agency.brand.name || agency.name} to turn your account back on.</p>
        ) : !memberGate ? (
          <p className="text-sm">The platform team paused this account. Reply to any email from us to turn it back on.</p>
        ) : (
          <>
            <p className="text-sm">
              We look for <strong>{user.email}</strong> among active members. Two ways in:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <span className="font-medium">Member of the Skool community</span>
                <span className="text-sm text-muted-foreground">Join with this same email. Paid members are picked up within about 15 minutes. Trials show up at the next member sync.</span>
                {env.skoolGroupUrl ? (
                  <Button asChild variant="outline" size="sm" className="mt-auto self-start">
                    <a href={env.skoolGroupUrl} target="_blank" rel="noreferrer">Join on Skool</a>
                  </Button>
                ) : null}
              </div>
              {canBuy ? (
                <div className="flex flex-col gap-2 rounded-lg border p-3">
                  <span className="font-medium">Buy the app directly</span>
                  <span className="text-sm text-muted-foreground">Pay by card and your account turns on in seconds.{env.memberPriceLabel ? ` ${env.memberPriceLabel}.` : ""}</span>
                  <Button asChild size="sm" className="mt-auto self-start">
                    <Link href={`/join?email=${encodeURIComponent(user.email)}`}>Buy access</Link>
                  </Button>
                </div>
              ) : null}
            </div>
            <form action={checkAccessAction.bind(null, wid)} className="flex flex-col gap-2">
              <input type="hidden" name="back" value={`/app/w/${wid}/paused`} />
              <SubmitButton variant="outline" className="w-full sm:w-auto sm:self-start" pendingText="Checking…">
                I&apos;m a member, check again
              </SubmitButton>
              <p className="text-xs text-muted-foreground">
                Used a different email on Skool? Put this email in the community&apos;s membership question, or reply to any email from us.
              </p>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
