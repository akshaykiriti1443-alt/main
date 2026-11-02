import { desc, eq } from "drizzle-orm";
import { PercentIcon, ReceiptIcon, SparklesIcon, WalletIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { walletTransactions } from "@/lib/db/schema";
import { requireAgency } from "@/server/tenancy";
import { getOrCreateWallet } from "@/server/wallet";
import { stripeConfigured } from "@/server/billing/stripe";
import { TOPUP_OPTIONS_USD } from "@/server/pricing";
import { agencyCheckoutAction, agencyTopupAction } from "@/actions/agency";
import { formatMoney, relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Callout, Empty, Flash, PageHead, Panel, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AgencyBilling({ params, searchParams }: { params: Promise<{ aid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { aid } = await params;
  const sp = await searchParams;
  const { agency } = await requireAgency(aid);
  const wallet = await getOrCreateWallet("agency", aid);
  const db = await getDb();
  const tx = await db.select().from(walletTransactions).where(eq(walletTransactions.walletId, wallet.id)).orderBy(desc(walletTransactions.createdAt)).limit(25);
  return (
    <>
      <PageHead title="Plan & wallet" />
      <Flash searchParams={sp} />
      {sp.checkout === "success" ? <Callout tone="ok">Payment received. It can take a few seconds to show up.</Callout> : null}
      <div className="grid gap-3 sm:grid-cols-3 md:gap-4">
        <Stat icon={SparklesIcon} label="Plan" value={agency.plan === "agency" ? "Agency" : "Not active"} hint={agency.status === "paused" ? "Paused" : undefined} />
        <Stat icon={WalletIcon} label="Agency wallet" value={formatMoney(wallet.balanceMicros)} hint="Pays for client usage" />
        <Stat icon={PercentIcon} label="Markup" value={`${agency.markupPercent}%`} hint="Suggested resale margin" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {agency.plan !== "agency" ? (
          <Panel className="min-w-0 ring-2 ring-primary/40" title="Activate the Agency plan" sub="Unlimited client accounts, white-label branding, your own app domain and templates.">
            <form action={agencyCheckoutAction.bind(null, aid)} className="flex flex-col items-start gap-3">
              <SubmitButton pendingText="Opening checkout…">Activate</SubmitButton>
              {!stripeConfigured() ? <p className="text-xs text-muted-foreground">Payments aren&apos;t connected yet. The platform owner can activate your plan.</p> : null}
            </form>
          </Panel>
        ) : null}
        <Panel className="min-w-0" title="Add funds">
          <form action={agencyTopupAction.bind(null, aid)} className="flex flex-col items-start gap-4">
            <div className="flex flex-wrap gap-2">
              {TOPUP_OPTIONS_USD.map((v) => (
                <Label
                  key={v}
                  className={cn(
                    "h-9 cursor-pointer rounded-lg border px-3 font-medium tabular-nums transition-colors hover:bg-muted",
                    "has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  )}
                >
                  <input type="radio" name="amount" value={v} defaultChecked={v === 50} className="accent-primary" /> ${v}
                </Label>
              ))}
            </div>
            <SubmitButton variant="outline">Add funds</SubmitButton>
          </form>
        </Panel>
      </div>
      <Panel title="Wallet history">
        {tx.length === 0 ? (
          <Empty icon={ReceiptIcon} title="No transactions yet." />
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
                  <TableCell className="min-w-48 whitespace-normal">{t.description}</TableCell>
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
