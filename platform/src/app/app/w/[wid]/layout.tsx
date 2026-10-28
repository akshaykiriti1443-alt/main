import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { getWorkspaceContext, listUserAgencies, listUserWorkspaces } from "@/server/tenancy";
import { hasFeature, PLANS } from "@/server/plans";
import { AppShell, UserFooter, type NavGroup } from "@/components/AppShell";
import { redeemCodeAction } from "@/actions/account";
import { SubmitButton } from "@/components/client";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ wid: string }> }) {
  const { wid } = await params;
  const ctx = await getWorkspaceContext(wid);
  const { workspace, agency, user } = ctx;
  const [mine, agencies] = await Promise.all([listUserWorkspaces(user.id), listUserAgencies(user.id)]);
  const db = await getDb();
  const [{ unread }] = await db
    .select({ unread: sql<number>`coalesce(sum(${conversations.unread}), 0)::int` })
    .from(conversations)
    .where(eq(conversations.workspaceId, wid));
  const growth = hasFeature(workspace.plan, "inbox");
  const base = `/app/w/${wid}`;

  const groups: NavGroup[] = [
    {
      items: [
        { href: base, label: "Dashboard", exact: true },
        { href: `${base}/launch`, label: "AI launch kit" },
      ],
    },
    {
      title: "Grow",
      items: [
        { href: `${base}/sites`, label: "Funnels & pages" },
        { href: `${base}/leads`, label: "Leads" },
        { href: `${base}/inbox`, label: "Inbox", badge: unread || undefined, locked: !growth },
        { href: `${base}/emails`, label: "Emails" },
        { href: `${base}/automations`, label: "Automations", locked: !growth },
        { href: `${base}/social`, label: "Social planner", locked: !growth },
        { href: `${base}/ads`, label: "Ad review" },
      ],
    },
    {
      title: "Account",
      items: [
        { href: `${base}/billing`, label: "Plan & wallet" },
        { href: `${base}/settings`, label: "Settings" },
      ],
    },
  ];

  const switcher =
    mine.length > 1 ? (
      <details className="ws-switch">
        <summary className="btn btn-sm" style={{ width: "100%", justifyContent: "space-between" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{workspace.name}</span> ▾
        </summary>
        <div className="stack" style={{ gap: 2, marginTop: 6 }}>
          {mine.map((m) => (
            <Link key={m.workspace.id} className="nav-link" href={`/app/w/${m.workspace.id}`}>
              {m.workspace.name}
            </Link>
          ))}
        </div>
      </details>
    ) : (
      <div className="ws-switch small muted" style={{ padding: "0 8px" }}>
        {workspace.name} · {PLANS[workspace.plan].label}
      </div>
    );

  const footerExtra = (
    <>
      {agencies.map((a) => (
        <Link key={a.agency.id} href={`/app/agency/${a.agency.id}`} className="small">
          Agency: {a.agency.name}
        </Link>
      ))}
      {user.isPlatformAdmin ? (
        <Link href="/app/admin" className="small">
          Platform admin
        </Link>
      ) : null}
    </>
  );

  let banner: React.ReactNode = null;
  const viaSkool = workspace.accessSource === "skool_code" || workspace.accessSource === "skool_zapier";
  if (ctx.effectiveStatus === "grace") {
    banner = (
      <div className="alert alert-warn">
        <div className="row-between">
          <span>
            <strong>Your member access needs this month's code.</strong> Your pages stay live until{" "}
            {workspace.graceEndsAt?.toDateString() ?? "soon"}.
          </span>
          <form action={redeemCodeAction.bind(null, wid)} className="row">
            <input name="code" placeholder="Member code" aria-label="Member code" style={{ width: 160 }} required />
            <SubmitButton className="btn btn-sm btn-primary">Confirm</SubmitButton>
          </form>
        </div>
      </div>
    );
  } else if (viaSkool && workspace.accessVerifiedUntil && workspace.accessVerifiedUntil.getTime() - Date.now() < 5 * 86_400_000) {
    banner = (
      <div className="alert alert-info">
        Your member code renews on {workspace.accessVerifiedUntil.toDateString()}. Grab next month's code from the Skool classroom and enter it in Settings.
      </div>
    );
  }

  return (
    <AppShell
      brand={agency.isPlatform ? null : agency.brand}
      switcher={switcher}
      groups={groups}
      banner={banner}
      footer={<UserFooter email={user.email} extra={footerExtra} />}
    >
      {children}
    </AppShell>
  );
}
