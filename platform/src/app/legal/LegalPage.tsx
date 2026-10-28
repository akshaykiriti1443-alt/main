import type { ReactNode } from "react";
import Link from "next/link";
import { env } from "@/lib/env";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mk" style={{ maxWidth: 760, gap: 24 }}>
      <Link href="/" className="brand" style={{ padding: 0, color: "inherit" }}>
        <span className="brand-mark">{env.platformName.slice(0, 2).toUpperCase()}</span>
        {env.platformName}
      </Link>
      <div className="stack">
        <h1>{title}</h1>
        <p className="muted small">Last updated {updated}</p>
      </div>
      <div className="stack legal">{children}</div>
    </main>
  );
}
