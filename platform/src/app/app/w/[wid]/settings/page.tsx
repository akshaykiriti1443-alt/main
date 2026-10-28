import { requireWorkspace } from "@/server/tenancy";
import { listConnections } from "@/server/inbox";
import { hasFeature } from "@/server/plans";
import { metaConfigured } from "@/server/meta/graph";
import { smsConfigured } from "@/server/sms";
import { listUserAgencies } from "@/server/tenancy";
import { env } from "@/lib/env";
import {
  buyNumberAction,
  disconnectChannelAction,
  listNumbers,
  redeemCodeAction,
  saveBusinessAction,
  saveTrackingAction,
  searchNumbersAction,
} from "@/actions/account";
import { saveTemplateFromWorkspaceAction } from "@/actions/agency";
import { Flash, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { WhatsAppConnect } from "@/components/WhatsAppConnect";

const KIND: Record<string, string> = { facebook_page: "Facebook Page", instagram: "Instagram", whatsapp: "WhatsApp", sms: "SMS number" };

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace, user, agency } = await requireWorkspace(wid);
  const s = workspace.settings;
  const connections = await listConnections(wid);
  const growth = hasFeature(workspace.plan, "inbox");
  const numbers = sp.numbers ? await listNumbers(wid, sp.numbers) : null;
  const agencies = await listUserAgencies(user.id);
  const myAgency = agencies.find((a) => a.agency.id === agency.id);
  const viaSkool = workspace.accessSource === "skool_code" || workspace.accessSource === "skool_zapier";

  return (
    <>
      <PageHead title="Settings" />
      <Flash searchParams={sp} />

      <form action={saveBusinessAction.bind(null, wid)} className="card stack">
        <div className="card-head"><h2>Business details</h2><SubmitButton className="btn btn-sm">Save</SubmitButton></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="businessName">Business or community name</label><input id="businessName" name="businessName" defaultValue={s.businessName ?? workspace.name} /></div>
          <div className="field"><label htmlFor="skoolUrl">Skool group link</label><input id="skoolUrl" name="skoolUrl" type="url" defaultValue={s.skoolUrl ?? ""} placeholder="https://www.skool.com/your-group/about" /></div>
          <div className="field"><label htmlFor="niche">What you help with</label><input id="niche" name="niche" defaultValue={s.niche ?? ""} /></div>
          <div className="field"><label htmlFor="offer">Your offer</label><input id="offer" name="offer" defaultValue={s.offer ?? ""} /></div>
          <div className="field"><label htmlFor="replyToEmail">Reply-to email</label><input id="replyToEmail" name="replyToEmail" type="email" defaultValue={s.replyToEmail ?? ""} placeholder={user.email} /><span className="help">Replies to your emails go here.</span></div>
          <div className="field"><label htmlFor="mailingAddress">Mailing address</label><input id="mailingAddress" name="mailingAddress" defaultValue={s.mailingAddress ?? ""} placeholder="123 Main St, Austin, TX 78701, USA" /><span className="help">Shown in email footers. Required for broadcasts.</span></div>
        </div>
      </form>

      {viaSkool ? (
        <form action={redeemCodeAction.bind(null, wid)} className="card stack">
          <h2>Member access</h2>
          <p className="muted small">
            Access confirmed until <strong>{workspace.accessVerifiedUntil?.toDateString() ?? "—"}</strong>. Each month, enter the new code from the Skool classroom to keep your pages live.
          </p>
          <input type="hidden" name="back" value={`/app/w/${wid}/settings`} />
          <div className="row"><input name="code" placeholder="This month's code" required style={{ maxWidth: 220 }} aria-label="Member code" /><SubmitButton className="btn">Confirm code</SubmitButton></div>
        </form>
      ) : null}

      <form action={saveTrackingAction.bind(null, wid)} className="card stack" id="tracking">
        <div className="card-head"><h2>Meta Pixel & Conversions API</h2><SubmitButton className="btn btn-sm">Save</SubmitButton></div>
        <p className="muted small">Your pages fire PageView and Lead in the browser and send the same Lead from our server. Meta matches them, so you get better tracking even with ad blockers. This works on Skool's $9 plan.</p>
        <div className="form-grid">
          <div className="field"><label htmlFor="metaPixelId">Pixel (dataset) ID</label><input id="metaPixelId" name="metaPixelId" defaultValue={s.metaPixelId ?? ""} placeholder="123456789012345" inputMode="numeric" /></div>
          <div className="field"><label htmlFor="metaTestEventCode">Test event code (optional)</label><input id="metaTestEventCode" name="metaTestEventCode" defaultValue={s.metaTestEventCode ?? ""} placeholder="TEST12345" /><span className="help">Remove it when you finish testing.</span></div>
          <div className="field full">
            <label htmlFor="metaCapiToken">Conversions API access token</label>
            <input id="metaCapiToken" name="metaCapiToken" type="password" placeholder={s.metaCapiTokenEnc ? "Saved. Paste a new one to replace it." : "From Events Manager › Settings › Generate access token"} autoComplete="off" />
            {s.metaCapiTokenEnc ? <label className="check small"><input type="checkbox" name="clearToken" /> Remove saved token</label> : null}
          </div>
        </div>
      </form>

      <div className="card stack" id="channels">
        <h2>Inbox channels</h2>
        {!growth ? (
          <p className="muted">Connect Instagram, Facebook, WhatsApp and SMS on the <a href={`/app/w/${wid}/billing`}>Growth plan</a>.</p>
        ) : (
          <>
            {connections.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Account</th><th>Type</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {connections.map((c) => (
                      <tr key={c.id}>
                        <td><strong>{c.name}</strong></td>
                        <td className="small">{KIND[c.kind]}</td>
                        <td><span className={`badge ${c.status === "active" ? "badge-good" : "badge-bad"}`}>{c.status}</span></td>
                        <td>{c.status === "active" ? <form action={disconnectChannelAction.bind(null, wid, c.id)}><SubmitButton className="btn btn-sm btn-danger" confirm="Confirm">Disconnect</SubmitButton></form> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted small">No channels yet. Connect one below and new messages land in your inbox.</p>
            )}
            <div className="row">
              <a className="btn btn-primary" href={`/api/integrations/meta/start?w=${wid}`}>Connect Instagram & Facebook</a>
              {metaConfigured() && env.metaWaConfigId ? (
                <WhatsAppConnect appId={env.metaAppId} configId={env.metaWaConfigId} graphVersion={env.metaGraphVersion} workspaceId={wid} />
              ) : (
                <span className="small muted">WhatsApp: the platform owner needs to finish Meta Tech Provider setup.</span>
              )}
            </div>
            <div className="stack" id="sms" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              <h3>SMS number</h3>
              {!smsConfigured() ? (
                <p className="small muted">SMS isn't switched on for this platform yet.</p>
              ) : (
                <>
                  <form action={searchNumbersAction.bind(null, wid)} className="row">
                    <select name="country" defaultValue="US" aria-label="Country"><option value="US">United States</option><option value="CA">Canada</option><option value="GB">United Kingdom</option><option value="AU">Australia</option></select>
                    <input name="areaCode" placeholder="Area code" style={{ width: 120 }} aria-label="Area code" />
                    <SubmitButton className="btn">Find numbers</SubmitButton>
                  </form>
                  {numbers && !numbers.ok ? <p className="alert alert-err">{numbers.error}</p> : null}
                  {numbers && numbers.ok ? (
                    numbers.numbers.length === 0 ? <p className="small muted">No numbers found. Try another area code.</p> : (
                      <div className="stack" style={{ gap: 6 }}>
                        {numbers.numbers.map((n) => (
                          <form key={n.phone_number} action={buyNumberAction.bind(null, wid)} className="row-between">
                            <span>{n.friendly_name} <span className="tiny muted">{[n.locality, n.region].filter(Boolean).join(", ")}</span></span>
                            <input type="hidden" name="phoneNumber" value={n.phone_number} />
                            <SubmitButton className="btn btn-sm" confirm="Buy (charged monthly)">Buy</SubmitButton>
                          </form>
                        ))}
                      </div>
                    )
                  ) : null}
                  <p className="tiny muted">US numbers need A2P 10DLC registration before carriers deliver texts at volume.</p>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {user.isPlatformAdmin || (myAgency && agency.plan === "agency") ? (
        <form action={saveTemplateFromWorkspaceAction.bind(null, user.isPlatformAdmin && agency.isPlatform ? null : agency.id)} className="card stack">
          <h2>Save as a template</h2>
          <p className="muted small">Copies this account's funnels, email sequences and automations (never contacts) so you can load them into new accounts.</p>
          <input type="hidden" name="workspaceId" value={wid} />
          <div className="form-grid">
            <div className="field"><label htmlFor="tname">Template name</label><input id="tname" name="name" defaultValue={`${workspace.name} funnel`} /></div>
            <div className="field"><label htmlFor="tdesc">Description</label><input id="tdesc" name="description" placeholder="Lead magnet funnel + 3 emails" /></div>
          </div>
          <SubmitButton className="btn">Save template</SubmitButton>
        </form>
      ) : null}
    </>
  );
}
