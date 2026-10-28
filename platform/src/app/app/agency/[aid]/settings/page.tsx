import { requireAgency } from "@/server/tenancy";
import { saveAgencySettingsAction } from "@/actions/agency";
import { UNIT_PRICES, resalePrice, type UsageUnit } from "@/server/pricing";
import { dnsInstructions } from "@/server/domains";
import { formatMoney } from "@/lib/util";
import { Flash, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function AgencySettings({ params, searchParams }: { params: Promise<{ aid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { aid } = await params;
  const { agency } = await requireAgency(aid);
  const b = agency.brand;
  const dns = agency.appDomain ? dnsInstructions(agency.appDomain) : null;
  const status = agency.appDomainStatus;
  return (
    <>
      <PageHead title="Branding & pricing" sub="Your clients see your name, logo and colors. Point your own domain at the platform for a fully white-label login." />
      <Flash searchParams={await searchParams} />
      <form action={saveAgencySettingsAction.bind(null, aid)} className="stack">
        <div className="card stack">
          <h2>Brand</h2>
          <div className="form-grid">
            <div className="field"><label htmlFor="brandName">Brand name</label><input id="brandName" name="brandName" defaultValue={b.name ?? agency.name} /></div>
            <div className="field"><label htmlFor="supportEmail">Support email</label><input id="supportEmail" name="supportEmail" type="email" defaultValue={b.supportEmail ?? ""} /></div>
            <div className="field"><label htmlFor="logoUrl">Logo link (square)</label><input id="logoUrl" name="logoUrl" type="url" defaultValue={b.logoUrl ?? ""} placeholder="https://…/logo.png" /></div>
            <div className="field"><label htmlFor="color">Brand color</label><input id="color" name="color" type="color" defaultValue={b.color ?? "#2A44EE"} /></div>
          </div>
        </div>
        <div className="card stack">
          <h2>Your app domain</h2>
          {agency.plan !== "agency" ? <p className="muted">Your own app domain unlocks with the Agency plan.</p> : null}
          <div className="field" style={{ maxWidth: 420 }}>
            <label htmlFor="appDomain">Domain</label>
            <input id="appDomain" name="appDomain" defaultValue={agency.appDomain ?? ""} placeholder="app.youragency.com" />
            <span className="help">Clients log in at https://{agency.appDomain || "app.youragency.com"}/login and see only your brand.</span>
          </div>
          {agency.appDomain && dns ? (
            <div className="stack">
              <span>
                <strong>{agency.appDomain}</strong>{" "}
                <span className={`badge ${status === "verified" ? "badge-good" : status === "error" ? "badge-bad" : "badge-warm"}`}>{status}</span>
              </span>
              {status !== "verified" ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead>
                    <tbody><tr><td className="mono">{dns.type}</td><td className="mono">{dns.name}</td><td className="mono">{dns.value}</td></tr></tbody>
                  </table>
                </div>
              ) : null}
              <p className="small muted">
                {status === "verified"
                  ? "Your login page is live."
                  : status === "error"
                    ? "We couldn't verify this domain. Check the record above, then save the domain again. Still stuck? Email platform support."
                    : `${dns.note} DNS changes can take up to 24 hours. We check every few minutes.`}
              </p>
            </div>
          ) : null}
        </div>
        <div className="card stack">
          <h2>Resale pricing</h2>
          <div className="field" style={{ maxWidth: 200 }}>
            <label htmlFor="markupPercent">Your markup on usage (%)</label>
            <input id="markupPercent" name="markupPercent" type="number" min={0} max={500} defaultValue={agency.markupPercent} />
          </div>
          <p className="small muted">Usage comes out of your agency wallet at platform prices. Use these suggested prices when you bill your clients.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>You pay</th><th>Suggested client price</th></tr></thead>
              <tbody>
                {(Object.keys(UNIT_PRICES) as UsageUnit[]).map((u) => (
                  <tr key={u}>
                    <td className="small">{UNIT_PRICES[u].label}</td>
                    <td className="num">{formatMoney(UNIT_PRICES[u].priceMicros)}</td>
                    <td className="num">{formatMoney(resalePrice(UNIT_PRICES[u].priceMicros, agency.markupPercent))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <SubmitButton>Save</SubmitButton>
      </form>
    </>
  );
}
