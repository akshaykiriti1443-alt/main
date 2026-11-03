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
  points: ["Landing pages and a free guide, written for you", "A CRM that knows who's on trial, paying or leaving", "Automations that DM the right member at the right time", "The Skool growth ladder, lesson by lesson"],
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
          <div className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card ring-1 ring-foreground/[0.07]">
            <div className="flex items-start gap-3">
              <IconTile icon={GraduationCapIcon} />
              <div className="grid gap-1">
                <span className="font-heading text-[17px] font-semibold">{canBuy ? "Prefer the community?" : "Join the Skool community"}</span>
                <span className="text-sm text-muted-foreground">Join on Skool, then sign up here with the same email. Your account turns on by itself.</span>
              </div>
            </div>
            <Button asChild variant={canBuy ? "outline" : "default"} size={canBuy ? "default" : "lg"} className={canBuy ? "self-start" : "w-full"}>
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
