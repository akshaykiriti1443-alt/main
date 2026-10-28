import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { walletTransactions } from "@/lib/db/schema";
import { requireWorkspace } from "@/server/tenancy";
import { billingWalletFor, usageThisMonth } from "@/server/wallet";
import { PLANS } from "@/server/plans";
import { TOPUP_OPTIONS_USD, UNIT_PRICES, type UsageUnit } from "@/server/pricing";
import { stripeConfigured } from "@/server/billing/stripe";
import { topupAction, upgradeAction } from "@/actions/account";
import { formatMoney, relativeTime } from "@/lib/util";
import { Flash, PageHead, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function BillingPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace, agency } = await requireWorkspace(wid, "user", { allowPaused: true });
  const { wallet, plan } = await billingWalletFor(wid);
  const usage = await usageThisMonth(wid);
  const db = await getDb();
  const tx = await db.select().from(walletTransactions).where(eq(walletTransactions.walletId, wallet.id)).orderBy(desc(walletTransactions.createdAt)).limit(25);
  const p = PLANS[plan];
  const agencyPays = !agency.isPlatform;
  return (
    <>
      <PageHead title="Plan & wallet" sub="Your plan covers the basics each month. Extra usage comes out of your wallet, so you only pay for what you use." />
      <Flash searchParams={sp} />
      {sp.checkout === "success" ? <div className="alert alert-ok">Payment received. It can take a few seconds to show up.</div> : null}
      <div className="grid-3">
        <Stat label="Plan" value={p.label} hint={p.priceNote} />
        <Stat label={agencyPays ? "Agency wallet" : "Wallet balance"} value={formatMoney(wallet.balanceMicros)} hint={agencyPays ? `Managed by ${agency.brand.name || agency.name}` : "Used for pay-as-you-go"} />
        <Stat label="Status" value={workspace.status === "active" ? "Active" : workspace.status === "grace" ? "Needs code" : "Paused"} hint={workspace.accessVerifiedUntil ? `Access confirmed to ${workspace.accessVerifiedUntil.toDateString()}` : workspace.accessSource === "admin" ? "Lifetime access" : undefined} />
      </div>

      <div className="grid-2">
        <div className="card stack">
          <h2>This month's usage</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>Used</th><th>Included</th><th>Then</th></tr></thead>
              <tbody>
                {(Object.keys(UNIT_PRICES) as UsageUnit[]).map((u) => (
                  <tr key={u}>
                    <td className="small">{UNIT_PRICES[u].label}</td>
                    <td className="num">{usage[u] ?? 0}</td>
                    <td className="num">{p.included[u] ?? 0}</td>
                    <td className="num small">{formatMoney(UNIT_PRICES[u].priceMicros)} each</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="stack">
          {!agencyPays ? (
            <form action={topupAction.bind(null, wid)} className="card stack">
              <h2>Add funds</h2>
              <div className="row">
                {TOPUP_OPTIONS_USD.map((v) => (
                  <label key={v} className="check"><input type="radio" name="amount" value={v} defaultChecked={v === 25} /> ${v}</label>
                ))}
              </div>
              <SubmitButton className="btn btn-primary">Add funds</SubmitButton>
              {!stripeConfigured() ? <p className="tiny muted">Payments aren't connected on this server yet.</p> : null}
            </form>
          ) : null}
          {plan === "starter" && !agencyPays ? (
            <form action={upgradeAction.bind(null, wid)} className="card stack" style={{ borderColor: "var(--accent)" }}>
              <h2>Upgrade to Growth</h2>
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                {["One inbox for Instagram, Facebook, WhatsApp and SMS", "AI lead scoring and reply drafts", "Automations and email broadcasts", "Social planner and custom domains", "More included AI and emails each month"].map((f) => (
                  <li key={f} className="small">{f}</li>
                ))}
              </ul>
              <SubmitButton>Upgrade</SubmitButton>
            </form>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Wallet history</h2></div>
        {tx.length === 0 ? (
          <p className="muted small">No transactions yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>What</th><th>Amount</th><th>When</th></tr></thead>
              <tbody>
                {tx.map((t) => (
                  <tr key={t.id}>
                    <td className="small">{t.description}{t.quantity > 1 ? ` × ${t.quantity}` : ""}</td>
                    <td className="num" style={{ color: t.amountMicros >= 0 ? "var(--good)" : undefined }}>{t.amountMicros >= 0 ? "+" : ""}{formatMoney(t.amountMicros)}</td>
                    <td className="small muted">{relativeTime(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
