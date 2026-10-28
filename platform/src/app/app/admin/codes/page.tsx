import { requirePlatformAdmin } from "@/server/auth";
import { listCodes } from "@/server/access";
import { createCodeAction } from "@/actions/admin";
import { env } from "@/lib/env";
import { Flash, PageHead } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";

function monthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 7, 23, 59)); // 7 extra days of overlap
  return { start: start.toISOString().slice(0, 16), end: end.toISOString().slice(0, 16) };
}

export default async function CodesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePlatformAdmin();
  const codes = await listCodes();
  const r = monthRange();
  const now = Date.now();
  return (
    <>
      <PageHead title="Member codes" sub="Post one code a month in your paid Skool classroom. Members enter it to sign up and to stay active. Only paying members can see it." />
      <Flash searchParams={await searchParams} />
      <form action={createCodeAction} className="card stack">
        <h2>New code</h2>
        <div className="form-grid">
          <div className="field"><label htmlFor="code">Code</label><input id="code" name="code" required placeholder="NOV-ROCKET-27" style={{ textTransform: "uppercase" }} /></div>
          <div className="field"><label htmlFor="label">Label</label><input id="label" name="label" placeholder="November 2026" /></div>
          <div className="field"><label htmlFor="validFrom">Valid from (UTC)</label><input id="validFrom" name="validFrom" type="datetime-local" defaultValue={r.start} /></div>
          <div className="field"><label htmlFor="validUntil">Valid until (UTC)</label><input id="validUntil" name="validUntil" type="datetime-local" defaultValue={r.end} required /><span className="help">Overlap the next month by a week so nobody gets locked out on the 1st.</span></div>
        </div>
        <SubmitButton>Create code</SubmitButton>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Label</th><th>Valid</th><th>Status</th><th>Signup link</th></tr></thead>
          <tbody>
            {codes.map((c) => {
              const live = c.validFrom.getTime() <= now && c.validUntil.getTime() >= now;
              const link = `${env.appUrl}/signup?code=${encodeURIComponent(c.code)}`;
              return (
                <tr key={c.id}>
                  <td className="mono"><strong>{c.code}</strong></td>
                  <td className="small">{c.label}</td>
                  <td className="small">{c.validFrom.toDateString()} → {c.validUntil.toDateString()}</td>
                  <td>{live ? <span className="badge badge-good">Live</span> : c.validUntil.getTime() < now ? <span className="badge">Expired</span> : <span className="badge badge-warm">Upcoming</span>}</td>
                  <td><CopyButton text={link} label="Copy link" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
