import Image from "next/image";
import Link from "next/link";
import { WatchPlayer } from "../_site/client";
import { BOOKING_URL, WATCH_VIDEO } from "../_site/config";
import { FooterLinks, Logo, pageMetadata } from "../_site/parts";

// /watch: the 5-minute video every "Watch the video" button on the home page points to.
// The old GoHighLevel site linked here but never published the page (it returned 404), so it is
// assembled from the old site's own parts: the /not-yet hero and video player, the home page's
// closing line and the /apply page's "what happens on the call". Booking goes to BOOKING_URL.
export const metadata = pageMetadata({
  title: "Watch before you book | ScaleitAds",
  description: "5 minutes on the 3 numbers behind every ad account. If it makes sense, book a call.",
  path: "/watch",
});

const CALL_STEPS = [
  "You share your screen. I check your 3 numbers with you: cost per click, conversion rate and order value.",
  "We find the one holding your revenue back, and what fixing it is worth.",
  "You get an honest yes or no on whether we can help.",
];

const CALENDAR_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4.5" width="18" height="16" rx="3" />
    <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
  </svg>
);

export default function WatchPage() {
  return (
    <div className="sia-root">
      <div className="sia" id="sia-watch">
        <section className="c-hero">
          <div aria-hidden="true" className="c-grid" />
          <div aria-hidden="true" className="c-glow" />
          <header className="w" style={{ position: "relative", maxWidth: "1000px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", height: "72px" }}>
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", color: "#fafafa", fontWeight: 600, fontSize: "17px", letterSpacing: "-0.01em" }}>
              <Logo />
            </Link>
            <span className="badge badge-d hide-sm">
              <span className="dot" />
              Meta ads optimization
            </span>
          </header>
          <div className="w fade-up" style={{ position: "relative", maxWidth: "1000px", paddingTop: "28px", paddingBottom: "96px" }}>
            <p className="n-hi">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
              <span>The 5-minute video</span>
            </p>
            <h1 className="n-h1">
              See it in <span className="serif grad">5 minutes.</span>
            </h1>
            <p className="n-sub">5 minutes on the 3 numbers behind every ad account. If it makes sense, book a call.</p>
            <WatchPlayer src={WATCH_VIDEO.src} poster={WATCH_VIDEO.poster} embedUrl={WATCH_VIDEO.embedUrl} label="ScaleitAds: the 3 numbers behind every ad account (5 minutes)" />
            <div style={{ marginTop: "28px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px 20px" }}>
              <Link className="btn btn-w" href={BOOKING_URL} style={{ height: "54px", padding: "0 26px", fontSize: "16px" }}>
                {CALENDAR_ICON}
                Book a call
              </Link>
              <span style={{ fontSize: "14px", color: "#a1a1aa" }}>Free · 45 minutes · No ad account access needed</span>
            </div>
          </div>
        </section>

        <section className="w" style={{ maxWidth: "1000px", paddingTop: "96px", paddingBottom: "112px" }}>
          <p className="eb">What happens on the call</p>
          <h2 className="h2">
            45 minutes with me.{" "}
            <span className="serif gradd" style={{ fontSize: "1.1em" }}>
              Not a sales rep.
            </span>
          </h2>
          <ol style={{ marginTop: "36px", display: "flex", flexDirection: "column", gap: "18px" }}>
            {CALL_STEPS.map((s, i) => (
              <li key={s} style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                <span className="mono" style={{ flex: "0 0 28px", width: "28px", height: "28px", borderRadius: "50%", background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#047857", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 600 }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: "18px", lineHeight: 1.55, color: "#3f3f46" }}>{s}</span>
              </li>
            ))}
          </ol>
          <div style={{ marginTop: "40px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "24px", padding: "24px", borderRadius: "20px", background: "#fafafa", border: "1px solid #e4e4e7" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <span style={{ position: "relative", width: "48px", height: "48px", borderRadius: "50%", overflow: "hidden", flex: "0 0 48px", background: "#e9e7e3" }}>
                <Image src="/scaleitads/akshay-kolluru.jpg" alt="" fill sizes="48px" style={{ objectFit: "cover", objectPosition: "50% 0%", maxWidth: "none" }} />
              </span>
              <span>
                <span style={{ display: "block", fontSize: "16px", fontWeight: 600 }}>Akshay Kolluru</span>
                <span style={{ display: "block", fontSize: "14px", color: "#52525b" }}>Growth manager, ScaleitAds · I do every call myself</span>
              </span>
            </div>
            <Link className="btn btn-k" href={BOOKING_URL}>
              {CALENDAR_ICON}
              Book a call
            </Link>
          </div>
        </section>

        <footer style={{ borderTop: "1px solid #f4f4f5" }}>
          <div className="w" style={{ paddingTop: "28px", paddingBottom: "36px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "16px", fontSize: "13px", color: "#71717a" }}>
            <span>© {new Date().getFullYear()} ScaleitAds. Every account is different. Results vary.</span>
            <FooterLinks light home />
            <p style={{ margin: 0, flexBasis: "100%", fontSize: "12px", color: "#a1a1aa" }}>Not affiliated with or endorsed by Meta Platforms, Inc.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
