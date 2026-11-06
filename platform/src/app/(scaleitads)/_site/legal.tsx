import type { ReactNode } from "react";
import Link from "next/link";
import { FooterLinks, Logo } from "./parts";

/** The shared frame of /privacy and /terms: header, grey title band, sticky contents, footer. */
export function LegalShell({
  id,
  title,
  sub,
  effective,
  toc,
  other,
  children,
}: {
  id: string;
  title: ReactNode;
  sub: string;
  effective: string;
  toc: [string, string][];
  other: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="sia-root">
      <div className="sia sia-legal" id={id}>
        <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(255,255,255,.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid #f4f4f5" }}>
          <div className="w" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", height: "64px" }}>
            <Link href="/" aria-label="ScaleitAds home" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", color: "#09090b", fontWeight: 600, fontSize: "16px" }}>
              <Logo tone="light" size={28} />
            </Link>
            <Link href={other.href} style={{ fontSize: "14px", color: "#52525b", textDecoration: "none" }}>
              {other.label} &#8594;
            </Link>
          </div>
        </header>
        <section style={{ background: "#fafafa", borderBottom: "1px solid #f4f4f5" }}>
          <div className="w" style={{ paddingTop: "72px", paddingBottom: "56px" }}>
            <p style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 500, color: "#047857" }}>Legal</p>
            <h1 style={{ margin: 0, fontWeight: 600, fontSize: "clamp(40px, 5vw, 64px)", lineHeight: 1, letterSpacing: "-0.045em" }}>{title}</h1>
            <p style={{ margin: "18px 0 0", maxWidth: "640px", fontSize: "18px", lineHeight: 1.6, color: "#52525b" }}>{sub}</p>
            <p className="mono" style={{ margin: "20px 0 0", fontSize: "13px", color: "#71717a" }}>
              {effective}
            </p>
          </div>
        </section>
        <div className="w" style={{ paddingTop: "56px", paddingBottom: "96px", display: "flex", gap: "56px", alignItems: "flex-start" }}>
          <aside className="toc-wrap" style={{ flex: "0 0 240px", position: "sticky", top: "88px" }}>
            <p style={{ margin: "0 0 8px 12px", fontSize: "12px", fontWeight: 600, color: "#71717a" }}>On this page</p>
            <nav className="toc" aria-label="Sections">
              {toc.map(([href, label]) => (
                <a key={href} href={href}>
                  {label}
                </a>
              ))}
            </nav>
          </aside>
          {children}
        </div>
        <footer style={{ borderTop: "1px solid #f4f4f5" }}>
          <div className="w" style={{ paddingTop: "28px", paddingBottom: "36px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "16px", fontSize: "13px", color: "#71717a" }}>
            <span>&#169; {new Date().getFullYear()} ScaleitAds</span>
            <FooterLinks light home />
          </div>
        </footer>
      </div>
    </div>
  );
}
