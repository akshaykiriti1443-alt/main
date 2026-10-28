import type { ReactNode } from "react";
import type { Temperature } from "@/lib/db/schema";

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function TempBadge({ t }: { t: Temperature }) {
  const label = t === "hot" ? "🔥 Hot" : t === "warm" ? "Warm" : "Cold";
  return <span className={`badge badge-${t}`}>{label}</span>;
}

export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

type SP = Record<string, string | string[] | undefined>;
export function Flash({ searchParams }: { searchParams: SP }) {
  const ok = typeof searchParams.ok === "string" ? searchParams.ok : null;
  const error = typeof searchParams.error === "string" ? searchParams.error : null;
  const warn = typeof searchParams.warn === "string" ? searchParams.warn : null;
  if (!ok && !error && !warn) return null;
  if (warn && !error)
    return (
      <>
        {ok ? <div className="alert alert-ok" role="status">{ok}</div> : null}
        <div className="alert alert-warn" role="status">{warn}</div>
      </>
    );
  return error ? (
    <div className="alert alert-err" role="alert">
      {error}
    </div>
  ) : (
    <div className="alert alert-ok" role="status">
      {ok}
    </div>
  );
}

export function Locked({ feature, wid }: { feature: string; wid: string }) {
  return (
    <div className="empty">
      <h3>{feature} is on the Growth plan</h3>
      <p>Upgrade to unlock it. Your funnels and leads stay exactly as they are.</p>
      <a className="btn btn-primary" href={`/app/w/${wid}/billing`}>
        See plans
      </a>
    </div>
  );
}
