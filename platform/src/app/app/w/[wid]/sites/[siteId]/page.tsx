import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/server/tenancy";
import { getSite, listPages, siteBaseUrl } from "@/server/sites";
import { dnsInstructions } from "@/server/domains";
import { hasFeature } from "@/server/plans";
import {
  addPageAction,
  connectDomainAction,
  deletePageAction,
  deleteSiteAction,
  publishSiteAction,
  removeDomainAction,
  unpublishSiteAction,
  updateSiteAction,
} from "@/actions/sites";
import { Flash, PageHead } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";

const KIND_LABEL = { optin: "Opt-in", thankyou: "Thank-you", sales: "Sales", custom: "Page" } as const;

export default async function SitePage({ params, searchParams }: { params: Promise<{ wid: string; siteId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid, siteId } = await params;
  const { workspace } = await requireWorkspace(wid);
  const site = await getSite(wid, siteId);
  if (!site) notFound();
  const pages = await listPages(siteId);
  const base = siteBaseUrl(site);
  const dns = site.customDomain ? dnsInstructions(site.customDomain) : null;
  const changed = pages.some((p) => !p.publishedAt || p.updatedAt > p.publishedAt);

  return (
    <>
      <PageHead
        eyebrow="Funnel"
        title={site.name}
        sub={
          site.published ? (
            <>
              Live at{" "}
              <a href={base} target="_blank" rel="noreferrer">
                {base}
              </a>
            </>
          ) : (
            "Draft. Publish to put your pages online."
          )
        }
        actions={
          <>
            {site.published ? <CopyButton text={base} label="Copy link" /> : null}
            <form action={publishSiteAction.bind(null, wid, siteId)}>
              <SubmitButton>{site.published ? (changed ? "Publish changes" : "Republish") : "Publish"}</SubmitButton>
            </form>
            {site.published ? (
              <form action={unpublishSiteAction.bind(null, wid, siteId)}>
                <SubmitButton className="btn">Unpublish</SubmitButton>
              </form>
            ) : null}
          </>
        }
      />
      <Flash searchParams={await searchParams} />
      {site.published && changed ? <div className="alert alert-info">You have unpublished edits. Click "Publish changes" to make them live.</div> : null}

      <div className="card">
        <div className="card-head">
          <h2>Pages</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Page</th>
                <th>Type</th>
                <th>Address</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/app/w/${wid}/sites/${siteId}/pages/${p.id}`}>
                      <strong>{p.title}</strong>
                    </Link>
                  </td>
                  <td>
                    <span className="badge">{KIND_LABEL[p.kind]}</span>
                  </td>
                  <td className="small mono">/{p.slug}</td>
                  <td>
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      <Link className="btn btn-sm" href={`/app/w/${wid}/sites/${siteId}/pages/${p.id}`}>
                        Edit
                      </Link>
                      {site.published && p.publishedAt ? (
                        <a className="btn btn-sm" href={`${base}${p.slug ? `/${p.slug}` : ""}`} target="_blank" rel="noreferrer">
                          View ↗
                        </a>
                      ) : null}
                      {p.kind !== "optin" ? (
                        <form action={deletePageAction.bind(null, wid, siteId, p.id)}>
                          <SubmitButton className="btn btn-sm btn-danger" confirm="Confirm delete">
                            Delete
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={addPageAction.bind(null, wid, siteId)} className="row" style={{ marginTop: 14, alignItems: "flex-end" }}>
          <div className="field">
            <label htmlFor="title">New page title</label>
            <input id="title" name="title" placeholder="Free training" required />
          </div>
          <div className="field">
            <label htmlFor="slug">Address</label>
            <input id="slug" name="slug" placeholder="training" required />
          </div>
          <div className="field">
            <label htmlFor="kind">Type</label>
            <select id="kind" name="kind" defaultValue="custom">
              <option value="custom">Page</option>
              <option value="sales">Sales page</option>
              <option value="thankyou">Thank-you</option>
            </select>
          </div>
          <SubmitButton className="btn">Add page</SubmitButton>
        </form>
      </div>

      <form action={updateSiteAction.bind(null, wid, siteId)} className="card stack">
        <div className="card-head">
          <h2>Funnel settings</h2>
          <SubmitButton>Save settings</SubmitButton>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="name">Funnel name</label>
            <input id="name" name="name" defaultValue={site.name} />
          </div>
          <div className="field">
            <label htmlFor="skoolUrl">Skool group link</label>
            <input id="skoolUrl" name="skoolUrl" type="url" defaultValue={site.skoolUrl} placeholder="https://www.skool.com/your-group/about" />
            <span className="help">Every "Join" button on this funnel uses this link.</span>
          </div>
          <div className="field">
            <label htmlFor="leadMagnetName">Lead magnet name</label>
            <input id="leadMagnetName" name="leadMagnetName" defaultValue={site.leadMagnetName} />
          </div>
          <div className="field">
            <label htmlFor="leadMagnetUrl">Lead magnet link</label>
            <input id="leadMagnetUrl" name="leadMagnetUrl" defaultValue={site.leadMagnetUrl} placeholder="/guide or https://..." />
            <span className="help">Use /guide for the hosted page, or paste a Google Drive or Notion link.</span>
          </div>
          <div className="field">
            <label htmlFor="style">Style</label>
            <select id="style" name="style" defaultValue={site.theme.style}>
              <option value="bold">Bold (color hero)</option>
              <option value="clean">Clean (light)</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div className="row" style={{ gap: 16, alignItems: "flex-end" }}>
            <div className="field">
              <label htmlFor="font">Font</label>
              <select id="font" name="font" defaultValue={site.theme.font}>
                <option value="sans">Modern sans</option>
                <option value="serif">Classic serif</option>
                <option value="rounded">Rounded</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="brandColor">Brand color</label>
              <input id="brandColor" name="brandColor" type="color" defaultValue={site.theme.brandColor} />
            </div>
          </div>
        </div>
      </form>

      <div className="card stack" id="domain">
        <h2>Custom domain</h2>
        {!hasFeature(workspace.plan, "custom_domains") ? (
          <p className="muted">
            Use your own domain like join.yourbrand.com on the <Link href={`/app/w/${wid}/billing`}>Growth plan</Link>.
          </p>
        ) : site.customDomain && dns ? (
          <div className="stack">
            <div className="row-between">
              <span>
                <strong>{site.customDomain}</strong>{" "}
                <span className={`badge ${site.domainStatus === "verified" ? "badge-good" : site.domainStatus === "error" ? "badge-bad" : "badge-warm"}`}>{site.domainStatus}</span>
              </span>
              <form action={removeDomainAction.bind(null, wid, siteId)}>
                <SubmitButton className="btn btn-sm btn-danger" confirm="Confirm remove">
                  Remove
                </SubmitButton>
              </form>
            </div>
            {site.domainStatus !== "verified" ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Name</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="mono">{dns.type}</td>
                      <td className="mono">{dns.name}</td>
                      <td className="mono">{dns.value}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
            <p className="small muted">{dns.note} DNS changes can take up to 24 hours. We check every few minutes.</p>
          </div>
        ) : (
          <form action={connectDomainAction.bind(null, wid, siteId)} className="row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor="domain">Domain</label>
              <input id="domain" name="domain" placeholder="join.yourbrand.com" required />
            </div>
            <SubmitButton className="btn">Connect domain</SubmitButton>
          </form>
        )}
      </div>

      <div className="card row-between">
        <div>
          <h3>Delete this funnel</h3>
          <p className="small muted">Pages go offline. Leads you collected stay in your Leads list.</p>
        </div>
        <form action={deleteSiteAction.bind(null, wid, siteId)}>
          <SubmitButton className="btn btn-danger" confirm="Yes, delete it">
            Delete funnel
          </SubmitButton>
        </form>
      </div>
    </>
  );
}
