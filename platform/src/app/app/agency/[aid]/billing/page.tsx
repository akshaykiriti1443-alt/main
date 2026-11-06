import { desc, eq } from "drizzle-orm";
import { PercentIcon, PlusIcon, ReceiptIcon, SparklesIcon, WalletIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { walletTransactions } from "@/lib/db/schema";
import { requireAgency } from "@/server/tenancy";
import { getOrCreateWallet } from "@/server/wallet";
import { stripeConfigured } from "@/server/billing/stripe";
import { TOPUP_OPTIONS_USD } from "@/server/pricing";
import { agencyCheckoutAction, agencyTopupAction } from "@/actions/agency";
import { formatMoney, relativeTime } from "@/lib/util";
import { cn } from "@/lib/utils";
import { Callout, Flash, PageHead, Panel, Stat } from "@/components/ui";
import { EdgeTable, QuietEmpty } from "@/components/crm-ui";
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
      <PageHead eyebrow="Agency" title="Plan & wallet" sub="Your Agency plan, and the wallet that pays for your clients' usage." />
      <Flash searchParams={sp} />
      {sp.checkout === "success" ? <Callout tone="ok">Payment received. It can take a few seconds to show up.</Callout> : null}
      <div className="grid gap-4 @2xl/main:grid-cols-3">
        <Stat icon={SparklesIcon} label="Plan" value={agency.plan === "agency" ? "Agency" : "Not active"} hint={agency.status === "paused" ? "Paused" : undefined} />
        <Stat icon={WalletIcon} label="Agency wallet" value={formatMoney(wallet.balanceMicros)} hint="Pays for client usage" />
        <Stat icon={PercentIcon} label="Markup" value={`${agency.markupPercent}%`} hint="Suggested resale margin" />
      </div>
      <div className="grid items-start gap-6 @4xl/main:grid-cols-2">
        {agency.plan !== "agency" ? (
          <Panel icon={SparklesIcon} className="min-w-0 ring-violet-200/90 dark:ring-violet-400/20" title="Activate the Agency plan" sub="Unlimited client accounts, white-label branding, your own app domain and templates.">
            <form action={agencyCheckoutAction.bind(null, aid)} className="flex flex-col items-start gap-3">
              <SubmitButton variant="cta" size="lg" pendingText="Opening checkout…">Activate</SubmitButton>
              {!stripeConfigured() ? <p className="text-xs text-muted-foreground">Payments aren&apos;t connected yet. The platform owner can activate your plan.</p> : null}
            </form>
          </Panel>
        ) : null}
        <Panel icon={WalletIcon} tone="gold" className="min-w-0" title="Add funds" sub="Pick an amount. It goes straight into your agency wallet.">
          <form action={agencyTopupAction.bind(null, aid)} className="flex flex-col items-start gap-4">
            <div className="flex flex-wrap gap-2">
              {TOPUP_OPTIONS_USD.map((v) => (
                <Label
                  key={v}
                  className={cn(
                    "h-10 cursor-pointer gap-2 rounded-full border border-border-strong bg-card px-4 font-semibold tabular-nums shadow-xs transition-colors duration-150 hover:border-violet-200 hover:bg-accent/50 dark:bg-white/[0.03]",
                    "has-checked:border-violet-300 has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-[3px] has-focus-visible:ring-ring/20 dark:has-checked:border-violet-400/40 dark:has-checked:bg-accent",
                  )}
                >
                  <input type="radio" name="amount" value={v} defaultChecked={v === 50} className="accent-primary" /> ${v}
                </Label>
              ))}
            </div>
            <SubmitButton variant={agency.plan === "agency" ? "default" : "outline"}>
              <PlusIcon data-icon="inline-start" />
              Add funds
            </SubmitButton>
          </form>
        </Panel>
      </div>
      <Panel icon={ReceiptIcon} tone="muted" title="Wallet history" sub="The last 25 top-ups and charges.">
        {tx.length === 0 ? (
          <QuietEmpty icon={ReceiptIcon} title="No transactions yet" body="Top-ups and client usage show up here." />
        ) : (
          <EdgeTable>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
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
                  <TableCell className="text-right text-[13px] text-subtle-foreground">{relativeTime(t.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </EdgeTable>
        )}
      </Panel>
    </>
  );
}
