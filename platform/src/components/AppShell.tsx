import type { ReactNode } from "react";
import Link from "next/link";
import { env } from "@/lib/env";
import type { BrandSettings } from "@/lib/db/types";
import { NavLink } from "./client";

export type NavItem = { href: string; label: string; exact?: boolean; badge?: number; locked?: boolean };
export type NavGroup = { title?: string; items: NavItem[] };

export function AppShell({
  brand,
  switcher,
  groups,
  footer,
  children,
  banner,
}: {
  brand?: BrandSettings | null;
  switcher?: ReactNode;
  groups: NavGroup[];
  footer?: ReactNode;
  children: ReactNode;
  banner?: ReactNode;
}) {
  const name = brand?.name || env.platformName;
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/app" className="brand" style={{ color: "inherit", textDecoration: "none" }}>
          <span className="brand-mark" style={brand?.color ? { background: brand.color } : undefined}>
            {brand?.logoUrl ? <img src={brand.logoUrl} alt="" /> : name.slice(0, 2).toUpperCase()}
          </span>
          {name}
        </Link>
        {switcher}
        {groups.map((g, i) => (
          <nav key={i} aria-label={g.title ?? "Main"} style={{ display: "contents" }}>
            {g.title ? <div className="nav-group">{g.title}</div> : null}
            {g.items.map((it) => (
              <NavLink key={it.href} href={it.href} exact={it.exact} badge={it.badge} locked={it.locked}>
                {it.label}
              </NavLink>
            ))}
          </nav>
        ))}
        <div className="sidebar-foot">{footer}</div>
      </aside>
      <main className="main">
        <div className="content">
          {banner}
          {children}
        </div>
      </main>
    </div>
  );
}

export function UserFooter({ email, extra }: { email: string; extra?: ReactNode }) {
  return (
    <>
      {extra}
      <span className="tiny">{email}</span>
      <form action="/logout" method="post">
        <button className="link-btn small" type="submit">
          Log out
        </button>
      </form>
    </>
  );
}
