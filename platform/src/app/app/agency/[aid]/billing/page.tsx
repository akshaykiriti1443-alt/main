import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { walletTransactions } from "@/lib/db/schema";
import { requireAgency } from "@/server/tenancy";
import { getOrCreateWallet } from "@/server/wallet";
import { stripeConfigured } from "@/server/billing/stripe";
import { TOPUP_OPTIONS_USD } from "@/server/pricing";
import { agencyCheckoutAction, agencyTopupAction } from "@/actions/agency";
import { formatMoney, relativeTime } from "@/lib/util";
import { Flash, PageHead, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/client";

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
      {sp.checkout === "success" ? <div className="alert alert-ok">Payment received. It can take a few seconds to show up.</div> : null}
      <div className="grid-3">
        <Stat label="Plan" value={agency.plan === "agency" ? "Agency" : "Not active"} hint={agency.status === "paused" ? "Paused" : undefined} />
        <Stat label="Agency wallet" value={formatMoney(wallet.balanceMicros)} hint="Pays for client usage" />
        <Stat label="Markup" value={`${agency.markupPercent}%`} hint="Suggested resale margin" />
      </div>
      <div className="grid-2">
        {agency.plan !== "agency" ? (
          <form action={agencyCheckoutAction.bind(null, aid)} className="card stack" style={{ borderColor: "var(--accent)" }}>
            <h2>Activate the Agency plan</h2>
            <p className="muted small">Unlimited client accounts, white-label branding, your own app domain and templates.</p>
            <SubmitButton>Activate</SubmitButton>
            {!stripeConfigured() ? <p className="tiny muted">Payments aren't connected yet. The platform owner can activate your plan.</p> : null}
          </form>
        ) : null}
        <form action={agencyTopupAction.bind(null, aid)} className="card stack">
          <h2>Add funds</h2>
          <div className="row">{TOPUP_OPTIONS_USD.map((v) => <label key={v} className="check"><input type="radio" name="amount" value={v} defaultChecked={v === 50} /> ${v}</label>)}</div>
          <SubmitButton className="btn">Add funds</SubmitButton>
        </form>
      </div>
      <div className="card">
        <div className="card-head"><h2>Wallet history</h2></div>
        {tx.length === 0 ? <p className="muted small">No transactions yet.</p> : (
          <div className="table-wrap"><table><thead><tr><th>What</th><th>Amount</th><th>When</th></tr></thead><tbody>
            {tx.map((t) => (
              <tr key={t.id}><td className="small">{t.description}</td><td className="num">{t.amountMicros >= 0 ? "+" : ""}{formatMoney(t.amountMicros)}</td><td className="small muted">{relativeTime(t.createdAt)}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </div>
    </>
  );
}
