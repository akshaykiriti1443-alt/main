import { requirePlatformAdmin } from "@/server/auth";
import Link from "next/link";
import { listAllAgencies } from "@/server/admin";
import { adjustWalletAction, setAgencyAction } from "@/actions/admin";
import { formatMoney } from "@/lib/util";
import { Empty, Flash, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function AdminAgencies({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePlatformAdmin();
  const rows = await listAllAgencies();
  return (
    <>
      <PageHead title="Agencies" sub="Resellers on the Agency tier." />
      <Flash searchParams={await searchParams} />
      {rows.length === 0 ? <Empty title="No agencies yet" body="Members start one from /app/agency/new." /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Agency</th><th>Clients</th><th>Plan / status</th><th>Wallet</th></tr></thead>
            <tbody>
              {rows.map(({ agency: a, workspaces, balance }) => (
                <tr key={a.id}>
                  <td><Link href={`/app/agency/${a.id}`}><strong>{a.brand.name || a.name}</strong></Link><div className="tiny muted">{a.appDomain ?? "no app domain"}</div></td>
                  <td className="num">{workspaces}</td>
                  <td>
                    <form action={setAgencyAction.bind(null, a.id)} className="row" style={{ gap: 6 }}>
                      <select name="plan" defaultValue={a.plan} aria-label="Plan"><option value="none">none</option><option value="agency">agency</option></select>
                      <select name="status" defaultValue={a.status} aria-label="Status"><option value="active">active</option><option value="paused">paused</option></select>
                      <SubmitButton className="btn btn-sm">Save</SubmitButton>
                    </form>
                  </td>
                  <td>
                    <form action={adjustWalletAction.bind(null, "agency", a.id)} className="row" style={{ gap: 6 }}>
                      <span className="num small">{formatMoney(balance ?? 0)}</span>
                      <input name="amount" type="number" step="0.01" placeholder="±$" style={{ width: 80 }} aria-label="Amount" />
                      <SubmitButton className="btn btn-sm">Apply</SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
