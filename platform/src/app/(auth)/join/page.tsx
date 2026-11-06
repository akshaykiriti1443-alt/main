import { env } from "@/lib/env";
import { memberCheckoutConfigured } from "@/server/billing/stripe";
import Link from "next/link";
import { GraduationCapIcon } from "lucide-react";
import { IconTile } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { AuthShell, type AuthAside } from "../AuthShell";
import { JoinForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get access" };

const ASIDE = (canBuy: boolean): AuthAside => ({
  eyebrow: canBuy ? "Two ways in" : "Included with the community",
  title: "Everything you need to fill your Skool group.",
  points: [
    "Ad research, then 5 static ads in your voice from Ad studio",
    "An AI launch kit: landing page, free guide and follow-up emails",
    "A leads CRM with automations that follow up for you",
    "Your Skool link and the Growth ladder, with Penny guiding each step",
  ],
});

// Two doors, one rule: active members get the app. Join the Skool community, or buy the app here.
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ email?: string; checkout?: string }> }) {
  const { email, checkout } = await searchParams;
  const canBuy = memberCheckoutConfigured();
  return (
    <AuthShell
      title="Get your funnel account"
      sub={
        checkout === "cancelled"
          ? "No charge was made. Pick up where you left off."
          : canBuy
            ? "Included with the Skool community, or buy it on its own. Same app either way."
            : "Included with the Skool community. Join, then sign up here with the same email."
      }
      aside={ASIDE(canBuy)}
    >
      <div className="flex flex-col gap-6">
        {canBuy ? <JoinForm defaultEmail={email} priceLabel={env.memberPriceLabel || undefined} /> : null}
        {env.skoolGroupUrl ? (
          <div className="flex flex-col gap-4 rounded-3xl bg-card p-6 shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
            <div className="flex items-start gap-3.5">
              <IconTile icon={GraduationCapIcon} />
              <div className="grid gap-1">
                <span className="text-[16px] font-semibold tracking-[-0.01em]">{canBuy ? "Prefer the community?" : "Join the Skool community"}</span>
                <span className="text-sm leading-relaxed text-muted-foreground">Join on Skool, then sign up here with the same email. Your account turns on by itself.</span>
              </div>
            </div>
            <Button asChild variant={canBuy ? "outline" : "cta"} size={canBuy ? "default" : "lg"} className={canBuy ? "self-start" : "w-full"}>
              <a href={env.skoolGroupUrl} target="_blank" rel="noreferrer">Join on Skool</a>
            </Button>
          </div>
        ) : null}
        {!canBuy && !env.skoolGroupUrl ? <p className="text-sm text-muted-foreground">Sign-ups open soon.</p> : null}
        {!canBuy ? (
          <p className="text-center text-sm text-muted-foreground">
            Already a member?{" "}
            <Link href="/signup" className="font-semibold">
              Create your login
            </Link>
          </p>
        ) : null}
      </div>
    </AuthShell>
  );
}
