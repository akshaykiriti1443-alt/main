import { requireWorkspace } from "@/server/tenancy";
import { redeemCodeAction } from "@/actions/account";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function PausedPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const { workspace, agency } = await requireWorkspace(wid, "user", { allowPaused: true });
  const viaAgency = !agency.isPlatform;
  return (
    <div className="card stack" style={{ maxWidth: 560 }}>
      <Flash searchParams={await searchParams} />
      <h1>{workspace.name} is paused</h1>
      <p className="muted">
        Your pages are offline and automations are stopped. Your funnels, leads and emails are saved and come back the moment access returns.
      </p>
      {viaAgency ? (
        <p>Contact {agency.brand.name || agency.name} to turn your account back on.</p>
      ) : workspace.pauseReason === "admin" ? (
        <p>The platform team paused this account. Reply to any email from us to turn it back on.</p>
      ) : (
        <form action={redeemCodeAction.bind(null, wid)} className="stack">
          <input type="hidden" name="back" value={`/app/w/${wid}/paused`} />
          <div className="field">
            <label htmlFor="code">This month's member code</label>
            <input id="code" name="code" required placeholder="From the Skool classroom" />
            <span className="help">Rejoined Skool? Your code is in the Start Here lesson.</span>
          </div>
          <SubmitButton>Turn my account back on</SubmitButton>
        </form>
      )}
    </div>
  );
}
