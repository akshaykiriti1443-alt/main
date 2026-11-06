import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { ArrowRightIcon, Building2Icon, BuildingIcon, CheckIcon, CircleDollarSignIcon, GaugeIcon, LayersIcon, LightbulbIcon, ReceiptIcon, RocketIcon, WalletIcon } from "lucide-react";
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
        className={cn("h-2 overflow-hidden rounded-full", unlimited ? "border border-dashed border-success/40" : "bg-muted ring-1 ring-ink/[0.04] ring-inset dark:ring-white/[0.05]")}
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
      ? { label: "Active", variant: "success" as const }
      : workspace.status === "grace"
        ? { label: "Membership ending", variant: "gold" as const }
        : { label: "Paused", variant: "warning" as const };
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
    // The Growth pitch carries this screen's one pink button (Member plan only).
    const pitch = key === "growth" && canUpgrade;
    return (
      <div
        key={key}
        className={cn(
          "relative flex flex-col gap-5 overflow-hidden rounded-2xl bg-card p-6 shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]",
          current && "ring-2 ring-primary/40 dark:ring-primary/50",
          pitch && "shadow-lift",
        )}
      >
        {pitch ? <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(80%_100%_at_100%_0%,var(--cta-soft),transparent_70%)]" /> : null}
        <div className="relative flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1.5">
            <span className="font-display text-[30px] leading-none tracking-[-0.01em]">{tier.label}</span>
            <span className="text-sm text-muted-foreground">{tier.priceNote}</span>
          </div>
          {current ? <Badge>Your plan</Badge> : pitch ? <Badge variant="pink">Recommended</Badge> : null}
        </div>
        {key === "growth" ? (
          <ul className="relative flex flex-col gap-2.5">
            {GROWTH_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full bg-accent text-primary dark:text-violet-300">
                  <CheckIcon className="size-3" strokeWidth={3} aria-hidden />
                </span>
                {f}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="relative flex flex-col gap-2 border-t border-border/80 pt-4">
          <span className="text-[11.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Included each month</span>
          <ul className="flex flex-col gap-1.5">
            {(Object.keys(tier.included) as UsageUnit[]).map((u) => (
              <li key={u} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{UNIT_PRICES[u]?.label ?? u}</span>
                <span className="font-semibold tabular-nums">{amount(tier.included[u])}</span>
              </li>
            ))}
          </ul>
        </div>
        {pitch ? (
          <form action={upgradeAction.bind(null, wid)} className="relative mt-auto">
            <SubmitButton variant="cta" size="lg" className="w-full">
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
        eyebrow="Account"
        title="Plan & wallet"
        sub="What your plan includes each month, plus a wallet for anything extra. You only pay for what you use."
        first={canUpgrade ? "Nothing, honestly. Your Member plan covers the launch kit and your first emails. Upgrade when you want the inbox and automations." : undefined}
      />
      <Flash searchParams={sp} />
      {sp.checkout === "success" ? <Callout tone="ok">Payment received. It can take a few seconds to show up.</Callout> : null}

      {/* The whole story in one card: your plan on the left, your wallet (and its button) on the right. */}
      <Card className="py-0">
        <CardContent className="grid gap-0 px-0 @2xl/main:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4 p-6 md:p-7">
            <span className="flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              <ReceiptIcon className="size-3.5" aria-hidden /> Your plan
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-[44px] leading-none tracking-[-0.015em]">{p.label}</span>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <div className="grid gap-1">
              <p className="text-sm text-muted-foreground">{p.priceNote}</p>
              {accessLine ? <p className="text-xs text-subtle-foreground">{accessLine}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-border/80 bg-background/60 p-6 md:p-7 @2xl/main:border-t-0 @2xl/main:border-l dark:bg-white/[0.02]">
            {agencyPays ? (
              <div className="flex items-start gap-3">
                <IconTile icon={BuildingIcon} tone="muted" />
                <div className="grid gap-0.5">
                  <span className="text-[16px] font-semibold">Billing is managed</span>
                  <span className="text-sm text-muted-foreground">By {agency.brand.name || agency.name}. Your usage is listed below.</span>
                </div>
              </div>
            ) : (
              <form id="funds" action={topupAction.bind(null, wid)} className="flex scroll-mt-20 flex-col gap-4">
                <div className="flex items-end justify-between gap-3">
                  <div className="grid gap-4">
                    <span className="flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                      <WalletIcon className="size-3.5" aria-hidden /> Wallet balance
                    </span>
                    <span className="font-display text-[44px] leading-none tracking-[-0.015em] tabular-nums">{formatMoney(wallet.balanceMicros)}</span>
                  </div>
                  <span className="pb-1 text-xs text-subtle-foreground">For pay-as-you-go</span>
                </div>
                <fieldset className="grid grid-cols-4 gap-2">
                  <legend className="sr-only">Amount to add</legend>
                  {TOPUP_OPTIONS_USD.map((v) => (
                    <Label
                      key={v}
                      className="h-10 cursor-pointer justify-center rounded-full border border-border-strong bg-card font-semibold tabular-nums shadow-xs transition-colors duration-150 hover:border-violet-200 hover:bg-accent has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-checked:ring-1 has-checked:ring-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/40 dark:bg-white/[0.03] dark:hover:border-white/20"
                    >
                      <input type="radio" name="amount" value={v} defaultChecked={v === 25} className="sr-only" />${v}
                    </Label>
                  ))}
                </fieldset>
                <SubmitButton variant={canUpgrade ? "outline" : "cta"} size={canUpgrade ? "default" : "lg"}>
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
          <div className="flex flex-col justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-card/40 p-6">
            <IconTile icon={LightbulbIcon} tone="gold" />
            <span className="text-[16px] font-semibold tracking-[-0.011em]">When is Growth worth it?</span>
            <p className="text-sm leading-relaxed text-muted-foreground">
              When DMs pile up in three apps and you&apos;re copy-pasting the same reply at midnight. Until then, Member is plenty. Your funnels and leads stay exactly as they are either way.
            </p>
          </div>
        </div>
      ) : null}

      <Panel icon={GaugeIcon} title="This month so far" sub="What you've used since the 1st. Anything past your plan comes out of the wallet.">
        <ul className="grid gap-x-10 gap-y-6 @2xl/main:grid-cols-2">
          {units.map((u) => (
            <Meter key={u} unit={u} used={usage[u] ?? 0} included={p.included[u] ?? 0} />
          ))}
        </ul>
      </Panel>

      <Panel icon={ReceiptIcon} tone="muted" title={agencyPays ? "Your usage" : "Wallet history"} sub={tx.length ? "The latest lines, newest first." : undefined}>
        {tx.length === 0 ? (
          <Empty
            icon={ReceiptIcon}
            tone="gold"
            title="Nothing here yet"
            body={agencyPays ? "Anything you use beyond the plan shows up here, line by line." : "Top-ups and anything beyond your plan show up here, line by line. No surprise charges."}
          />
        ) : (
          <div className="-mx-6 -mb-6 border-t border-border/80 [&_tr>*:first-child]:pl-6 [&_tr>*:last-child]:pr-6">
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
                    <TableCell className="whitespace-normal">
                      {t.description}
                      {t.quantity > 1 ? ` × ${t.quantity}` : ""}
                    </TableCell>
                    <TableCell className={cn("text-right font-medium tabular-nums", t.amountMicros >= 0 && "text-success")}>
                      {t.amountMicros >= 0 ? "+" : ""}
                      {formatMoney(t.amountMicros)}
                    </TableCell>
                    <TableCell className="text-right text-subtle-foreground">{relativeTime(t.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
                <span className="text-[15px] font-semibold">Run an agency?</span>
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
