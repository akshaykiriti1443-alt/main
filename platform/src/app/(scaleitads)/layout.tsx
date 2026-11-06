import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./_site/scaleitads.css";
import { consentScript } from "./_site/consent";
import { CLARITY_ID, PIXEL_ID, SITE_NAME, SITE_URL } from "./_site/config";

// The ScaleitAds agency site (scaleitads.com): home, /watch, /privacy, /terms and the booking
// funnel (/apply, /booked, /not-yet). Rebuilt from the GoHighLevel pages with the same look,
// self-hosted, no GoHighLevel scripts. src/middleware.ts serves these on the marketing hosts.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  authors: [{ name: "Akshay Kolluru" }],
  icons: {
    icon: [{ url: "/scaleitads/icon.svg", type: "image/svg+xml" }, { url: "/scaleitads/icon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/scaleitads/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = { themeColor: "#09090b", colorScheme: "light" };

export default function ScaleitAdsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Script id="sia-consent" strategy="afterInteractive">
        {consentScript(PIXEL_ID, CLARITY_ID)}
      </Script>
    </>
  );
}
