import type { Metadata } from "next";
import Link from "next/link";
import { CookieSettingsLink } from "./client";
import { CONTACT_EMAIL, SITE_NAME, SKOOL_PAGE_URL } from "./config";

/** Per-page metadata: absolute titles (no app suffix), canonical URL and Open Graph / X cards. */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const images = [{ url: "/scaleitads/og.png", width: 1200, height: 630, alt: "ScaleitAds: Same ad spend. More revenue." }];
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE_NAME, url: path, title, description, images },
    twitter: { card: "summary_large_image", title, description, images: images.map((i) => i.url) },
  };
}

/** The ScaleitAds mark: a lime tile with the up-and-right arrow, plus the wordmark. */
export function Logo({ tone = "dark", size = 30 }: { tone?: "dark" | "light"; size?: 28 | 30 }) {
  const big = size === 30;
  return (
    <>
      <span style={{ flex: "0 0 auto", width: `${size}px`, height: `${size}px`, borderRadius: big ? "9px" : "8px", background: "#D4FF3A", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={big ? 17 : 16} height={big ? 17 : 16} viewBox="0 0 24 24" fill="none" stroke="#0D0F0E" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 21H8v-5h5v-5" />
          <path d="M11.5 12.5L21 3" />
          <path d="M14 3h7v7" />
        </svg>
      </span>
      <span style={{ fontWeight: 700, letterSpacing: "-0.035em", color: tone === "dark" ? "#fafafa" : "#09090b" }}>
        ScaleitAds<span style={{ opacity: 0.5 }}>.com</span>
      </span>
    </>
  );
}

/**
 * Footer links shared by every agency page. "For Skool owners" is the one new link: it makes the
 * Skool Growth Program (/skool) discoverable from the agency site.
 */
export function FooterLinks({ light = false, home = false }: { light?: boolean; home?: boolean }) {
  const cls = light ? "fl fl-l" : "fl";
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
      {home ? (
        <Link className={cls} href="/">
          Home
        </Link>
      ) : null}
      <Link className={cls} href={SKOOL_PAGE_URL}>
        For Skool owners
      </Link>
      <Link className={cls} href="/privacy">
        Privacy Policy
      </Link>
      <Link className={cls} href="/terms">
        Terms of Service
      </Link>
      <CookieSettingsLink className={cls} />
      <a className={cls} href={`mailto:${CONTACT_EMAIL}`}>
        {CONTACT_EMAIL}
      </a>
    </div>
  );
}
