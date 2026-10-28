import type { ReactNode } from "react";
import { env } from "@/lib/env";
import { requestHost } from "@/server/auth";
import { agencyForHost } from "@/server/agency";

export async function AuthShell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const agency = await agencyForHost(await requestHost());
  const name = agency?.brand.name || env.platformName;
  const logo = agency?.brand.logoUrl;
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark" style={agency?.brand.color ? { background: agency.brand.color } : undefined}>
            {logo ? <img src={logo} alt="" /> : name.slice(0, 2).toUpperCase()}
          </span>
          {name}
        </div>
        <div>
          <h1 style={{ fontSize: 24 }}>{title}</h1>
          {sub ? <p className="muted" style={{ marginTop: 6 }}>{sub}</p> : null}
        </div>
        {children}
      </div>
    </main>
  );
}
