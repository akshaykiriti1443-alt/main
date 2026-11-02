import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { ActivityIcon, BuildingIcon, CheckIcon, CircleDollarSignIcon, ReceiptIcon, WalletIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { walletTransactions } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { billingWalletFor, usageThisMonth } from "@/server/wallet";
import { PLANS } from "@/server/plans";
import { TOPUP_OPTIONS_USD, UNIT_PRICES, type UsageUnit } from "@/server/pricing";
import { stripeConfigured } from "@/server/billing/stripe";
import { topupAction, upgradeAction } from "@/actions/account";
import { formatMoney, relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Callout, Empty, Flash, PageHead, Panel, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const GROWTH_FEATURES = ["One inbox for Instagram, Facebook, WhatsApp and SMS", "AI lead scoring and reply drafts", "Automations and email broadcasts", "Social planner and custom domains", "More included AI and emails each month"];

export default async function BillingPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace, agency } = await requireWorkspace(wid, "user", { allowPaused: true });
  const { wallet, plan } = await billingWalletFor(wid);
  const usage = await usageThisMonth(wid);
  const db = await getDb();
  const agencyPays = !agency.isPlatform;
  // Clients of an agency share its wallet: show only their own usage, never the balance.
  const tx = await db
    .select()
    .from(walletTransactions)
    .where(agencyPays ? and(eq(walletTransactions.walletId, wallet.id), eq(walletTransactions.workspaceId, wid)) : eq(walletTransactions.walletId, wallet.id))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(25);
  const p = PLANS[plan];
  const canUpgrade = plan === "starter" && !agencyPays;
  return (
    <>
      <PageHead title="Plan & wallet" sub="Your plan covers the basics each month. Extra usage comes out of your wallet, so you only pay for what you use." />
      <Flash searchParams={sp} />
      {sp.checkout === "success" ? <Callout tone="ok">Payment received. It can take a few seconds to show up.</Callout> : null}
      <div className="grid gap-3 sm:grid-cols-3 md:gap-4">
        <Stat icon={ReceiptIcon} label="Plan" value={p.label} hint={p.priceNote} />
        {agencyPays ? (
          <Stat icon={BuildingIcon} label="Billing" value="Managed" hint={`By ${agency.brand.name || agency.name}`} />
        ) : (
          <Stat icon={WalletIcon} label="Wallet balance" value={formatMoney(wallet.balanceMicros)} hint="Used for pay-as-you-go" />
        )}
        <Stat
          icon={ActivityIcon}
          label="Status"
          value={workspace.status === "active" ? "Active" : workspace.status === "grace" ? "Needs code" : "Paused"}
          hint={workspace.accessVerifiedUntil ? `Access confirmed to ${workspace.accessVerifiedUntil.toDateString()}` : workspace.accessSource === "admin" ? "Lifetime access" : undefined}
        />
      </div>

      {!agencyPays ? (
        <div className="grid gap-4 md:grid-cols-2">
          {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((key) => {
            const tier = PLANS[key];
            const current = key === plan;
            return (
              <Card key={key} className={cn(current && "ring-2 ring-primary")}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">{tier.label}</CardTitle>
                    {current ? <Badge>Current plan</Badge> : null}
                  </div>
                  <CardDescription>{tier.priceNote}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  {key === "growth" ? (
                    <ul className="flex flex-col gap-2">
                      {GROWTH_FEATURES.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Included each month</span>
                    <ul className="flex flex-col gap-1">
                      {(Object.keys(tier.included) as UsageUnit[]).map((u) => (
                        <li key={u} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">{UNIT_PRICES[u]?.label ?? u}</span>
                          <span className="font-medium tabular-nums">{tier.included[u]}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
                {key === "growth" && canUpgrade ? (
                  <CardFooter>
                    <form action={upgradeAction.bind(null, wid)} className="w-full">
                      <SubmitButton className="w-full">Upgrade</SubmitButton>
                    </form>
                  </CardFooter>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className={cn(agencyPays ? "lg:col-span-5" : "lg:col-span-3")} title="This month's usage">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Included</TableHead>
                <TableHead className="text-right">Then</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(Object.keys(UNIT_PRICES) as UsageUnit[]).map((u) => (
                <TableRow key={u}>
                  <TableCell>{UNIT_PRICES[u].label}</TableCell>
                  <TableCell className="text-right tabular-nums">{usage[u] ?? 0}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{p.included[u] ?? 0}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{formatMoney(UNIT_PRICES[u].priceMicros)} each</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
        {!agencyPays ? (
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Panel title="Add funds">
              <form action={topupAction.bind(null, wid)} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                  {TOPUP_OPTIONS_USD.map((v) => (
                    <Label
                      key={v}
                      className="cursor-pointer justify-center rounded-lg border px-3 py-2.5 tabular-nums transition-colors hover:bg-muted has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                    >
                      <input type="radio" name="amount" value={v} defaultChecked={v === 25} className="sr-only" />${v}
                    </Label>
                  ))}
                </div>
                <SubmitButton variant={canUpgrade ? "outline" : "default"}>
                  <CircleDollarSignIcon data-icon="inline-start" />
                  Add funds
                </SubmitButton>
                {!stripeConfigured() ? <p className="text-xs text-muted-foreground">Payments aren&apos;t connected on this server yet.</p> : null}
              </form>
            </Panel>
            <Panel title="Run an agency?" sub="Give each client their own account under your brand. Set your own prices.">
              <Button variant="outline" className="self-start" asChild>
                <Link href="/app/agency/new">Start an agency</Link>
              </Button>
            </Panel>
          </div>
        ) : null}
      </div>

      <Panel title={agencyPays ? "Your usage" : "Wallet history"}>
        {tx.length === 0 ? (
          <Empty icon={ReceiptIcon} title="No transactions yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>What</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tx.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    {t.description}
                    {t.quantity > 1 ? ` × ${t.quantity}` : ""}
                  </TableCell>
                  <TableCell className={cn("text-right font-medium tabular-nums", t.amountMicros >= 0 && "text-success")}>
                    {t.amountMicros >= 0 ? "+" : ""}
                    {formatMoney(t.amountMicros)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{relativeTime(t.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
