import { requirePlatformAdmin } from "@/server/auth";
import Link from "next/link";
import { listAllWorkspaces } from "@/server/admin";
import { adjustWalletAction, setWorkspaceAction } from "@/actions/admin";
import { formatMoney } from "@/lib/util";
import { Flash, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function AdminWorkspaces({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePlatformAdmin();
  const rows = await listAllWorkspaces();
  return (
    <>
      <PageHead title="Workspaces" sub="Every member and client account." />
      <Flash searchParams={await searchParams} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Workspace</th><th>Owner</th><th>Access</th><th>Plan / status</th><th>Wallet</th></tr></thead>
          <tbody>
            {rows.map(({ workspace: w, owner, agencyName, isPlatformAgency, balance }) => (
              <tr key={w.id}>
                <td><Link href={`/app/w/${w.id}`}><strong>{w.name}</strong></Link><div className="tiny muted">{isPlatformAgency ? "Member" : `Agency: ${agencyName}`}</div></td>
                <td className="small">{owner ?? "—"}</td>
                <td className="small">{w.accessSource}{w.accessVerifiedUntil ? <div className="tiny muted">to {w.accessVerifiedUntil.toDateString()}</div> : null}</td>
                <td>
                  <form action={setWorkspaceAction.bind(null, w.id)} className="row" style={{ gap: 6 }}>
                    <select name="plan" defaultValue={w.plan} aria-label="Plan"><option value="starter">Member</option><option value="growth">Growth</option></select>
                    <select name="status" defaultValue={w.status} aria-label="Status"><option value="active">active</option><option value="grace">grace</option><option value="paused">paused</option></select>
                    <label className="check tiny"><input type="checkbox" name="lifetime" /> lifetime</label>
                    <SubmitButton className="btn btn-sm">Save</SubmitButton>
                  </form>
                </td>
                <td>
                  {isPlatformAgency ? (
                    <form action={adjustWalletAction.bind(null, "workspace", w.id)} className="row" style={{ gap: 6 }}>
                      <span className="num small">{formatMoney(balance ?? 0)}</span>
                      <input name="amount" type="number" step="0.01" placeholder="±$" style={{ width: 80 }} aria-label="Amount" />
                      <input name="note" placeholder="note" style={{ width: 90 }} aria-label="Note" />
                      <SubmitButton className="btn btn-sm">Apply</SubmitButton>
                    </form>
                  ) : <span className="tiny muted">agency wallet</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
