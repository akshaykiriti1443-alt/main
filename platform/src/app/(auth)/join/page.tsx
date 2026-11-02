import { env } from "@/lib/env";
import { memberCheckoutConfigured } from "@/server/billing/stripe";
import { Button } from "@/components/ui/button";
import { AuthShell } from "../AuthShell";
import { JoinForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get access" };

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
          : "Landing pages, CRM, automations and the Skool growth ladder. Included with the Skool community, or buy it on its own."
      }
    >
      <div className="flex flex-col gap-6">
        {canBuy ? <JoinForm defaultEmail={email} priceLabel={env.memberPriceLabel || undefined} /> : null}
        {env.skoolGroupUrl ? (
          <div className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
            <span className="font-medium">Prefer the community?</span>
            <span className="text-muted-foreground">Join on Skool, then sign up here with the same email. Your account turns on by itself.</span>
            <Button asChild variant="outline" size="sm" className="self-start">
              <a href={env.skoolGroupUrl} target="_blank" rel="noreferrer">Join on Skool</a>
            </Button>
          </div>
        ) : null}
        {!canBuy && !env.skoolGroupUrl ? <p className="text-sm text-muted-foreground">Sign-ups open soon.</p> : null}
      </div>
    </AuthShell>
  );
}
