import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { ArrowRightIcon, Building2Icon, BuildingIcon, CheckIcon, CircleDollarSignIcon, GaugeIcon, LayersIcon, LightbulbIcon, ReceiptIcon, RocketIcon } from "lucide-react";
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
import { Callout, Empty, Flash, IconTile, MoreOptions, PageHead, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const GROWTH_FEATURES = ["One inbox for Instagram, Facebook, WhatsApp and SMS", "AI lead scoring and reply drafts", "Automations and email broadcasts", "Social planner and custom domains", "More included AI and emails each month"];

/** The Owner plan stores "no limit" as a huge number. Say it in words. */
const UNLIMITED = 1e8;
function amount(n: number) {
  return n >= UNLIMITED ? "Unlimited" : n.toLocaleString();
}

function Meter({ unit, used, included }: { unit: UsageUnit; used: number; included: number }) {
  const unlimited = included >= UNLIMITED;
  const pct = included > 0 && !unlimited ? Math.min(100, (used / included) * 100) : 0;
  const price = formatMoney(UNIT_PRICES[unit].priceMicros);
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{UNIT_PRICES[unit].label}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          <b className="font-semibold text-foreground">{used.toLocaleString()}</b>
          {included > 0 && !unlimited ? ` of ${included.toLocaleString()}` : " used"}
        </span>
      </div>
      {/* No limit: an open, dashed track instead of a full bar (a full bar reads as "used up"). */}
      <div
        className={cn("h-2 overflow-hidden rounded-full", unlimited ? "border border-dashed border-success/40" : "bg-muted ring-1 ring-foreground/[0.04] ring-inset")}
        aria-hidden
      >
        {unlimited ? null : (
          <div className={cn("h-full rounded-full transition-all", pct >= 90 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.max(pct, used > 0 ? 3 : 0)}%` }} />
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {unlimited ? "Included, no limit." : included > 0 ? `Included each month. After that, ${price} each from your wallet.` : `Not included. ${price} each from your wallet.`}
      </span>
    </li>
  );
}

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
  const status =
    workspace.status === "active"
      ? { label: "Active", cls: "bg-success-soft text-success" }
      : workspace.status === "grace"
        ? { label: "Membership ending", cls: "bg-gold-soft text-gold-foreground" }
        : { label: "Paused", cls: "bg-warning-soft text-warning" };
  const accessLine = workspace.accessVerifiedUntil
    ? workspace.accessVerifiedUntil.getFullYear() < 2900
      ? `Access confirmed to ${workspace.accessVerifiedUntil.toDateString()}`
      : "Lifetime access"
    : workspace.accessSource === "admin"
      ? "Lifetime access"
      : undefined;
  // Show the units this plan includes first, then the pay-as-you-go ones.
  const units = (Object.keys(UNIT_PRICES) as UsageUnit[]).sort((a, b) => Number((p.included[b] ?? 0) > 0) - Number((p.included[a] ?? 0) > 0));

  const planCard = (key: keyof typeof PLANS) => {
    const tier = PLANS[key];
    const current = key === plan;
    return (
      <div key={key} className={cn("flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card ring-1 ring-foreground/[0.07]", current && "ring-2 ring-primary")}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-0.5">
            <span className="font-heading text-lg font-bold">{tier.label}</span>
            <span className="text-sm text-muted-foreground">{tier.priceNote}</span>
          </div>
          {current ? <Badge>Your plan</Badge> : null}
        </div>
        {key === "growth" ? (
          <ul className="flex flex-col gap-2">
            {GROWTH_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2.5} />
                {f}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-col gap-1.5 border-t pt-3">
          <span className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">Included each month</span>
          <ul className="flex flex-col gap-1">
            {(Object.keys(tier.included) as UsageUnit[]).map((u) => (
              <li key={u} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{UNIT_PRICES[u]?.label ?? u}</span>
                <span className="font-semibold tabular-nums">{amount(tier.included[u])}</span>
              </li>
            ))}
          </ul>
        </div>
        {key === "growth" && canUpgrade ? (
          <form action={upgradeAction.bind(null, wid)} className="mt-auto">
            <SubmitButton size="lg" className="w-full">
              <RocketIcon data-icon="inline-start" />
              Upgrade to Growth
            </SubmitButton>
          </form>
        ) : null}
      </div>
    );
  };
  const tiers = (Object.keys(PLANS) as (keyof typeof PLANS)[]).filter((key) => key !== "owner" || plan === "owner");

  return (
    <>
      <PageHead
        title="Plan & wallet"
        sub="What your plan includes each month, plus a wallet for anything extra. You only pay for what you use."
        first={canUpgrade ? "Nothing, honestly. Your Member plan covers the launch kit and your first emails. Upgrade when you want the inbox and automations." : undefined}
      />
      <Flash searchParams={sp} />
      {sp.checkout === "success" ? <Callout tone="ok">Payment received. It can take a few seconds to show up.</Callout> : null}

      {/* The whole story in one card: your plan on the left, your wallet (and the one button) on the right. */}
      <Card className="py-0">
        <CardContent className="grid gap-0 px-0 @2xl/main:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3 p-5 md:p-6">
            <span className="flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              <ReceiptIcon className="size-3.5" aria-hidden /> Your plan
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-heading text-[34px] leading-none font-bold tracking-tight">{p.label}</span>
              <Badge variant="secondary" className={status.cls}>
                {status.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{p.priceNote}</p>
            {accessLine ? <p className="text-xs text-muted-foreground">{accessLine}</p> : null}
          </div>

          <div className="flex flex-col gap-4 border-t bg-muted/40 p-5 md:p-6 @2xl/main:border-t-0 @2xl/main:border-l">
            {agencyPays ? (
              <div className="flex items-start gap-3">
                <IconTile icon={BuildingIcon} tone="muted" />
                <div className="grid gap-0.5">
                  <span className="font-heading text-lg font-bold">Billing is managed</span>
                  <span className="text-sm text-muted-foreground">By {agency.brand.name || agency.name}. Your usage is listed below.</span>
                </div>
              </div>
            ) : (
              <form id="funds" action={topupAction.bind(null, wid)} className="flex scroll-mt-20 flex-col gap-3">
                <div className="flex items-end justify-between gap-3">
                  <div className="grid gap-1">
                    <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Wallet balance</span>
                    <span className="font-heading text-[34px] leading-none font-bold tracking-tight tabular-nums">{formatMoney(wallet.balanceMicros)}</span>
                  </div>
                  <span className="pb-1 text-xs text-muted-foreground">For pay-as-you-go</span>
                </div>
                <fieldset className="grid grid-cols-4 gap-2">
                  <legend className="sr-only">Amount to add</legend>
                  {TOPUP_OPTIONS_USD.map((v) => (
                    <Label
                      key={v}
                      className="h-10 cursor-pointer justify-center rounded-xl border bg-card font-semibold tabular-nums transition-colors hover:bg-muted has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                    >
                      <input type="radio" name="amount" value={v} defaultChecked={v === 25} className="sr-only" />${v}
                    </Label>
                  ))}
                </fieldset>
                <SubmitButton variant={canUpgrade ? "outline" : "default"} size={canUpgrade ? "default" : "lg"}>
                  <CircleDollarSignIcon data-icon="inline-start" />
                  Add funds
                </SubmitButton>
                {!stripeConfigured() ? <p className="text-xs text-muted-foreground">Payments aren&apos;t connected on this server yet.</p> : null}
              </form>
            )}
          </div>
        </CardContent>
      </Card>

      {canUpgrade ? (
        <div className="grid gap-4 @2xl/main:grid-cols-2">
          {planCard("growth")}
          <div className="flex flex-col justify-center gap-3 rounded-2xl border border-dashed border-foreground/15 p-5">
            <IconTile icon={LightbulbIcon} tone="gold" />
            <span className="font-heading text-lg font-bold">When is Growth worth it?</span>
            <p className="text-sm text-muted-foreground">
              When DMs pile up in three apps and you&apos;re copy-pasting the same reply at midnight. Until then, Member is plenty. Your funnels and leads stay exactly as they are either way.
            </p>
          </div>
        </div>
      ) : null}

      <Panel icon={GaugeIcon} title="This month so far" sub="What you've used since the 1st. Anything past your plan comes out of the wallet.">
        <ul className="grid gap-x-8 gap-y-5 @2xl/main:grid-cols-2">
          {units.map((u) => (
            <Meter key={u} unit={u} used={usage[u] ?? 0} included={p.included[u] ?? 0} />
          ))}
        </ul>
      </Panel>

      <Panel icon={ReceiptIcon} tone="muted" title={agencyPays ? "Your usage" : "Wallet history"}>
        {tx.length === 0 ? (
          <Empty
            icon={ReceiptIcon}
            tone="gold"
            title="Nothing here yet"
            body={agencyPays ? "Anything you use beyond the plan shows up here, line by line." : "Top-ups and anything beyond your plan show up here, line by line. No surprise charges."}
          />
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

      {!agencyPays ? (
        <>
          <MoreOptions icon={LayersIcon} title="Compare plans" sub="What each plan includes every month.">
            <div className="grid gap-4 @2xl/main:grid-cols-2">{tiers.filter((k) => !(canUpgrade && k === "growth")).map((k) => planCard(k))}</div>
          </MoreOptions>
          <Card size="sm">
            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <IconTile icon={Building2Icon} tone="gold" />
              <div className="grid min-w-0 flex-1 basis-60 gap-0.5">
                <span className="font-heading text-[15px] font-semibold">Run an agency?</span>
                <span className="text-sm text-muted-foreground">Give each client their own account under your brand. Set your own prices.</span>
              </div>
              <Button variant="outline" asChild>
                <Link href="/app/agency/new">
                  Start an agency <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}
    </>
  );
}
