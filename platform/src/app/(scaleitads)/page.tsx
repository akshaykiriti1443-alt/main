import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ResultsTabs, type ResultTab } from "./_site/client";
import { FooterLinks, Logo, pageMetadata } from "./_site/parts";

// scaleitads.com: the agency home page, rebuilt from the GoHighLevel original (same copy, layout
// and scroll effects). Client results are the agency's own, as published on the old site.
export const metadata = pageMetadata({
  title: "ScaleitAds | Same ad spend. More revenue.",
  description: "We optimize your Meta ads to pull more revenue from the budget you already spend. Optimize first, then scale. Month to month, no contract.",
  path: "/",
});

const MARQUEE = ["Same ad spend, more revenue", "Top of funnel stays on", "Revenue over ROAS", "Profit over screenshots", "Optimize first, then scale", "Month to month", "Steady, compounding growth"];

// *word* = the two emphasised words that turn green in the serif as you scroll.
const TRUTH = "Most agencies make your ROAS look good by switching off the top of your funnel. The dashboard goes up. Your *revenue* doesn't. We do the opposite. We *optimize* for revenue and profit, and let ROAS follow.";

const OTHERS = ["Switch off your top of funnel to make ROAS look good", "Send you ROAS screenshots", "Cut your spend so the numbers look efficient", "Launch 50 new ads in week one", "Lock you into a 3 to 6 month contract", "Hand you to a junior account manager"];
const US = ["Keep your top of funnel feeding new buyers", "Report your revenue and profit", "Pull more revenue from the same spend", "Optimize what's already running first", "Month to month. Stay because it works", "You work with me directly"];

type Row = { label: string; delta: string; deltaColor: string; value: string; valueColor: string };
type Stage = {
  top: number;
  badge: string;
  badgeStyle: CSSProperties;
  tag: string;
  title: string;
  body: string;
  date: string;
  rows: Row[];
  note: string;
  dark?: boolean;
  border: string;
  box: { border: string; bg: string };
};

const STAGES: Stage[] = [
  {
    top: 96,
    badge: "Before us",
    badgeStyle: { background: "#fafafa", color: "#3f3f46", border: "1px solid #e4e4e7" },
    tag: "Where most brands are",
    title: "Stuck.",
    body: "Revenue is flat. Costs creep up. Someone keeps telling you the ads look fine, but the bank account says otherwise.",
    date: "Feb 2026",
    border: "#e4e4e7",
    box: { border: "#ececee", bg: "#fafafa" },
    rows: [
      { label: "Ad spend", delta: "", deltaColor: "#71717a", value: "$11,319", valueColor: "#09090b" },
      { label: "Purchase value", delta: "", deltaColor: "#71717a", value: "$4,938", valueColor: "#dc2626" },
      { label: "ROAS", delta: "", deltaColor: "#71717a", value: "0.44", valueColor: "#dc2626" },
    ],
    note: "Spending over $11k a month to get less than $5k back.",
  },
  {
    top: 124,
    badge: "With us",
    badgeStyle: { background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0" },
    tag: "Month 1",
    title: "Optimize.",
    body: "Same budget. Same ads. We restructure what's already running so every dollar pulls more revenue. Your top of funnel stays on.",
    date: "Apr 2026",
    border: "#a7f3d0",
    box: { border: "#d1fae5", bg: "#f0fdf4" },
    rows: [
      { label: "Ad spend", delta: "−1%", deltaColor: "#71717a", value: "$11,177", valueColor: "#09090b" },
      { label: "Purchase value", delta: "+450%", deltaColor: "#047857", value: "$27,163", valueColor: "#047857" },
      { label: "ROAS", delta: "+452%", deltaColor: "#047857", value: "2.43", valueColor: "#047857" },
    ],
    note: "Same ad spend. 5.5x the purchase value.",
  },
  {
    top: 152,
    dark: true,
    badge: "And then",
    badgeStyle: { background: "rgba(52,211,153,.12)", color: "#6ee7b7", border: "1px solid rgba(52,211,153,.35)" },
    tag: "Month 6",
    title: "Scale.",
    body: "Once each dollar works harder, we add new ads and more budget. Growth compounds, steady and profitable.",
    date: "Sep 2026",
    border: "#27272a",
    box: { border: "#27272a", bg: "#111113" },
    rows: [
      { label: "Ad spend", delta: "+174%", deltaColor: "#a1a1aa", value: "$30,681", valueColor: "#fafafa" },
      { label: "Purchase value", delta: "+130%", deltaColor: "#6ee7b7", value: "$62,379", valueColor: "#6ee7b7" },
      { label: "ROAS", delta: "−16%", deltaColor: "#a1a1aa", value: "2.03", valueColor: "#fafafa" },
    ],
    note: "ROAS dipped a little as we scaled. Revenue more than doubled. That's the trade we want.",
  },
];

type Result = { id: string; label: string; ratio: string; aria: string; before: string; now: string; story: string; spend: string; months: string };
const RESULTS: Result[] = [
  { id: "saas", label: "SaaS client", ratio: "1262 / 784", aria: "Meta Ads Manager for a SaaS client: before, month one on the same spend, and after scaling", before: "$4,938", now: "$62,379", story: "Month 1 on the same spend: $27,163. Then scaled with new ads.", spend: "$30,681/mo", months: "6 months" },
  { id: "online-store", label: "Online store", ratio: "1262 / 692", aria: "Meta Ads Manager for an online store client: before, month one and after scaling", before: "$4,962", now: "$34,339", story: "Month 1 on less ad spend: $13,602. Then scaled with new ads.", spend: "$14,819/mo", months: "7 months" },
  { id: "b2b-agency", label: "B2B agency", ratio: "1262 / 646", aria: "Meta Ads Manager for a B2B agency client: before, month one and after scaling", before: "$0", now: "$36,688", story: "From no closed deals from ads to a steady monthly pipeline.", spend: "$8,766/mo", months: "9 months" },
  { id: "ai-agency", label: "AI agency", ratio: "1262 / 646", aria: "Meta Ads Manager for an AI agency client: before, month one and after scaling", before: "$0", now: "$22,418", story: "From zero sales on $2.5k of spend to a profitable channel in 3 months.", spend: "$6,047/mo", months: "3 months" },
];

const ABOUT_TILES = [
  { k: "We chase", v: "Revenue growth", c: "#047857" },
  { k: "We chase", v: "Profit growth", c: "#047857" },
  { k: "We watch", v: "ROAS (a metric)", c: "#71717a" },
];
const ABOUT_RESULTS = [
  { k: "SaaS client", from: "$4.9k/mo →", to: "$62.4k/mo" },
  { k: "Online store", from: "$5.0k/mo →", to: "$34.3k/mo" },
  { k: "B2B agency", from: "$0/mo →", to: "$36.7k/mo" },
];

const PLAY = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

export default function ScaleitAdsHome() {
  return (
    <div className="sia-root">
      <div className="sia" id="sia-landing">
        <Nav />
        <Hero />
        <Marquee />
        <Truth />
        <Different />
        <How />
        <Results />
        <About />
        <Closing />
      </div>
      <div className="sia" aria-hidden="true">
        <div className="prog" />
      </div>
    </div>
  );
}

function Nav() {
  return (
    <nav className="nav" aria-label="Main">
      <div className="w" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", height: "68px" }}>
        <a href="#top" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", color: "#fafafa", fontWeight: 600, fontSize: "17px", letterSpacing: "-0.01em" }}>
          <Logo />
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <a className="nl hide-sm" href="#different">
            Why us
          </a>
          <a className="nl hide-sm" href="#how">
            How it works
          </a>
          <a className="nl hide-sm" href="#results">
            Results
          </a>
          <Link className="btn btn-w" href="/watch" style={{ height: "40px", padding: "0 16px", fontSize: "14px", borderRadius: "10px" }}>
            Watch the video
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Chip({ style, on, children }: { style: CSSProperties; on?: boolean; children: ReactNode }) {
  return (
    <span className="chip" style={style}>
      <span style={on ? { width: "8px", height: "8px", borderRadius: "50%", background: "#34d399", boxShadow: "0 0 10px #34d399" } : { width: "8px", height: "8px", borderRadius: "50%", background: "#a1a1aa" }} />
      {children}
    </span>
  );
}

function Hero() {
  return (
    <section id="top" style={{ position: "relative", overflow: "hidden", background: "#09090b", color: "#fafafa" }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)", backgroundSize: "56px 56px", WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, #000 30%, transparent 75%)", maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, #000 30%, transparent 75%)" }} />
      <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "-200px", width: "1000px", height: "700px", transform: "translateX(-50%)", background: "radial-gradient(closest-side, rgba(16,185,129,.38), rgba(16,185,129,.08) 60%, transparent)", filter: "blur(20px)" }} />
      <div aria-hidden="true" className="spin-slow" style={{ position: "absolute", right: "-180px", top: "120px", width: "520px", height: "520px", borderRadius: "50%", border: "1px dashed rgba(110,231,183,.18)" }} />
      <div aria-hidden="true" className="spin-slow" style={{ position: "absolute", left: "-220px", top: "360px", width: "440px", height: "440px", borderRadius: "50%", border: "1px solid rgba(255,255,255,.06)" }} />
      <div className="w hero-out" style={{ position: "relative", minHeight: "calc(100vh - 68px)", maxHeight: "900px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", paddingTop: "80px", paddingBottom: "110px" }}>
        <div className="hide-sm" aria-hidden="true">
          <Chip style={{ left: "2%", top: "22%" }}>Ad spend: same</Chip>
          <Chip style={{ right: "3%", top: "30%", animationDelay: "-2s" }} on>
            Revenue: up
          </Chip>
          <Chip style={{ left: "6%", bottom: "20%", animationDelay: "-4s" }} on>
            Top of funnel: on
          </Chip>
          <Chip style={{ right: "7%", bottom: "16%", animationDelay: "-3s" }}>Contract: none</Chip>
        </div>
        <span className="badge badge-d">
          <span className="dot" />
          Optimize before you scale
        </span>
        <h1 style={{ margin: "28px auto 0", maxWidth: "1000px", fontWeight: 600, fontSize: "clamp(50px, 8.4vw, 116px)", lineHeight: 0.94, letterSpacing: "-0.05em" }}>
          Same ad spend.
          <br />
          <span className="serif grad" style={{ fontSize: "1.12em", paddingRight: "0.06em" }}>
            More revenue.
          </span>
        </h1>
        <p style={{ margin: "30px auto 0", maxWidth: "640px", fontSize: "clamp(17px, 1.6vw, 20px)", lineHeight: 1.6, color: "#a1a1aa" }}>
          We optimize your Meta ads to pull more revenue out of the budget you already spend. No switching off your top of funnel. Just steady, compounding growth.
        </p>
        <div style={{ marginTop: "38px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "12px" }}>
          <Link className="btn btn-w" href="/watch" style={{ height: "54px", padding: "0 28px", fontSize: "16px" }}>
            {PLAY}
            Watch the 5-min video
          </Link>
          <a className="btn btn-gd" href="#different" style={{ height: "54px", padding: "0 24px", fontSize: "16px" }}>
            See what we do differently
          </a>
        </div>
        <a href="#truth" aria-label="Scroll down" style={{ position: "absolute", bottom: "36px", left: "50%", transform: "translateX(-50%)", width: "26px", height: "42px", borderRadius: "999px", border: "1.5px solid rgba(255,255,255,.25)", display: "flex", justifyContent: "center", paddingTop: "8px" }}>
          <span style={{ width: "4px", height: "8px", borderRadius: "999px", background: "#6ee7b7", animation: "sia-float 1.8s ease-in-out infinite" }} />
        </a>
      </div>
    </section>
  );
}

function Marquee() {
  return (
    <section aria-label="What we stand for" style={{ borderBottom: "1px solid #f4f4f5", overflow: "hidden", padding: "22px 0", background: "#ffffff" }}>
      <div className="mq">
        {[...MARQUEE, ...MARQUEE].map((t, i) => (
          <span key={i} className="mq-i" aria-hidden={i >= MARQUEE.length ? true : undefined}>
            {t}
          </span>
        ))}
      </div>
    </section>
  );
}

function Truth() {
  return (
    <section id="truth" className="w" style={{ paddingTop: "160px", paddingBottom: "140px" }}>
      <p className="eb">What most agencies won&apos;t tell you</p>
      <p style={{ margin: 0, maxWidth: "1060px", fontWeight: 600, fontSize: "clamp(30px, 4.2vw, 56px)", lineHeight: 1.14, letterSpacing: "-0.035em" }}>
        {TRUTH.split(" ").map((w, i) => {
          const em = w.startsWith("*");
          return (
            <span key={i} className={em ? "wd em serif" : "wd"}>
              {`${w.replace(/\*/g, "")} `}
            </span>
          );
        })}
      </p>
    </section>
  );
}

function CompareList({ items, dark }: { items: string[]; dark?: boolean }) {
  return (
    <div className={dark ? "cmp-dark" : undefined} style={{ position: dark ? "relative" : undefined, marginTop: "18px", display: "flex", flexDirection: "column" }}>
      {items.map((t) => (
        <div key={t} className="cmp-row">
          <span className="cmp-ic">
            {dark ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="3.5" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            )}
          </span>
          <span>{t}</span>
        </div>
      ))}
    </div>
  );
}

function Different() {
  return (
    <section id="different" className="w" style={{ paddingTop: "20px", paddingBottom: "140px" }}>
      <div className="rv" style={{ maxWidth: "760px" }}>
        <p className="eb">Why us</p>
        <h2 className="h2">
          What others do.{" "}
          <span className="serif gradd" style={{ fontSize: "1.1em" }}>
            What we do.
          </span>
        </h2>
        <p className="lead">ROAS is just a metric to us. Revenue and profit growth is the goal.</p>
      </div>
      <div style={{ marginTop: "56px", display: "flex", flexWrap: "wrap", gap: "18px", alignItems: "stretch" }}>
        <div className="rl" style={{ flex: "1 1 420px", minWidth: 0, borderRadius: "22px", border: "1px solid #f4f4f5", background: "#fafafa", padding: "30px" }}>
          <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#71717a" }}>Most agencies</p>
          <CompareList items={OTHERS} />
        </div>
        <div className="rr" style={{ flex: "1 1 420px", minWidth: 0, borderRadius: "22px", background: "#09090b", color: "#fafafa", padding: "30px", position: "relative", overflow: "hidden", boxShadow: "0 40px 80px -30px rgba(16,185,129,.45)" }}>
          <div aria-hidden="true" style={{ position: "absolute", right: "-120px", top: "-120px", width: "360px", height: "360px", background: "radial-gradient(closest-side, rgba(16,185,129,.35), transparent)" }} />
          <p style={{ position: "relative", margin: 0, fontSize: "14px", fontWeight: 600, color: "#6ee7b7" }}>ScaleitAds</p>
          <CompareList items={US} dark />
        </div>
      </div>
    </section>
  );
}

function StageCard({ s, z }: { s: Stage; z: number }) {
  const muted = s.dark ? "#a1a1aa" : "#52525b";
  return (
    <div className="stk" style={{ top: `${s.top}px`, marginBottom: "40px", zIndex: z }}>
      <div
        className="card stk-in"
        style={{ padding: "clamp(24px, 4vw, 48px)", minHeight: "420px", display: "flex", flexWrap: "wrap", gap: "40px", alignItems: "center", background: s.dark ? "#09090b" : "#ffffff", color: s.dark ? "#fafafa" : "#09090b", borderColor: s.border, boxShadow: "0 1px 2px rgba(9,9,11,.04), 0 30px 60px -30px rgba(9,9,11,.3)" }}
      >
        <div style={{ flex: "1 1 380px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span className="badge mono" style={{ height: "28px", fontSize: "12px", ...s.badgeStyle }}>
              {s.badge}
            </span>
            <span className="mono" style={{ fontSize: "13px", color: muted }}>
              {s.tag}
            </span>
          </div>
          <h3 style={{ margin: "20px 0 0", fontSize: "clamp(34px, 3.8vw, 52px)", fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>{s.title}</h3>
          <p style={{ margin: "16px 0 0", fontSize: "18px", lineHeight: 1.6, color: muted, maxWidth: "480px" }}>{s.body}</p>
        </div>
        <div style={{ flex: "1 1 380px", minWidth: 0, borderRadius: "18px", border: `1px solid ${s.box.border}`, background: s.box.bg, padding: "24px", ["--st-line" as string]: s.box.border } as CSSProperties}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", paddingBottom: "14px", borderBottom: `1px solid ${s.box.border}` }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: muted }}>SaaS client</span>
            <span className="mono" style={{ fontSize: "12px", color: muted }}>
              {s.date}
            </span>
          </div>
          {s.rows.map((r) => (
            <div key={r.label} className="st-row">
              <span style={{ fontSize: "15px", color: muted }}>{r.label}</span>
              <span style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                <span className="mono" style={{ fontSize: "12px", color: r.deltaColor }}>
                  {r.delta}
                </span>
                <span className="mono st-num" style={{ color: r.valueColor }}>
                  {r.value}
                </span>
              </span>
            </div>
          ))}
          <p style={{ margin: "14px 0 0", fontSize: "14px", lineHeight: 1.5, color: muted }}>{s.note}</p>
        </div>
      </div>
    </div>
  );
}

function How() {
  return (
    <section id="how" style={{ background: "#fafafa", borderTop: "1px solid #f4f4f5", borderBottom: "1px solid #f4f4f5" }}>
      <div className="w" style={{ paddingTop: "128px", paddingBottom: "128px" }}>
        <div className="rv" style={{ maxWidth: "720px" }}>
          <p className="eb">How it works</p>
          <h2 className="h2">
            Before us. With us.{" "}
            <span className="serif gradd" style={{ fontSize: "1.1em" }}>
              And then.
            </span>
          </h2>
          <p className="lead">Optimize first, so every dollar pulls more revenue. Then scale on top of it. Here&apos;s how it went for one SaaS client.</p>
        </div>
        <div style={{ marginTop: "64px" }}>
          {STAGES.map((s, i) => (
            <StageCard key={s.title} s={s} z={i + 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ResultPanel({ r, first }: { r: Result; first: boolean }) {
  return (
    <>
      <div className="tilt" style={{ flex: "3 1 620px", minWidth: 0, transformOrigin: "50% 100%", padding: "8px", borderRadius: "22px", background: "linear-gradient(180deg, #f4f4f5, #fafafa)", border: "1px solid #e4e4e7", boxShadow: "0 40px 90px -40px rgba(16,185,129,.45)" }}>
        <video
          autoPlay={first}
          muted
          loop
          playsInline
          preload={first ? "metadata" : "none"}
          poster={`/scaleitads/results/${r.id}.jpg`}
          src={`/scaleitads/results/${r.id}.mp4`}
          aria-label={r.aria}
          style={{ display: "block", width: "100%", height: "auto", aspectRatio: r.ratio, borderRadius: "15px", background: "#ffffff" }}
        />
      </div>
      <div style={{ flex: "1 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ flex: "1 1 auto", borderRadius: "22px", background: "#09090b", color: "#fafafa", padding: "26px", position: "relative", overflow: "hidden" }}>
          <div aria-hidden="true" style={{ position: "absolute", right: "-100px", bottom: "-100px", width: "280px", height: "280px", background: "radial-gradient(closest-side, rgba(16,185,129,.35), transparent)" }} />
          <p style={{ position: "relative", margin: 0, fontSize: "13px", color: "#a1a1aa" }}>{r.label} · purchase value per month</p>
          <p className="mono" style={{ position: "relative", margin: "14px 0 0", fontSize: "18px", color: "#a1a1aa", textDecoration: "line-through" }}>
            {r.before}
          </p>
          <p className="serif grad" style={{ position: "relative", margin: "2px 0 0", fontSize: "56px", lineHeight: 1 }}>
            {r.now}
          </p>
          <p style={{ position: "relative", margin: "14px 0 0", fontSize: "14px", lineHeight: 1.5, color: "#d4d4d8" }}>{r.story}</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
          {[
            ["Ad spend now", r.spend],
            ["Time with us", r.months],
          ].map(([k, v]) => (
            <div key={k} style={{ borderRadius: "16px", border: "1px solid #e4e4e7", padding: "16px" }}>
              <p style={{ margin: 0, fontSize: "12px", color: "#71717a" }}>{k}</p>
              <p className="mono" style={{ margin: "6px 0 0", fontSize: "20px", fontWeight: 500 }}>
                {v}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Results() {
  const tabs: ResultTab[] = RESULTS.map((r, i) => ({ id: r.id, label: r.label, panel: <ResultPanel r={r} first={i === 0} /> }));
  return (
    <section id="results" className="w" style={{ paddingTop: "140px", paddingBottom: "130px" }}>
      <ResultsTabs
        tabs={tabs}
        intro={
          <div style={{ maxWidth: "680px" }}>
            <p className="eb">Client results</p>
            <h2 className="h2">
              Different businesses.{" "}
              <span className="serif gradd" style={{ fontSize: "1.1em" }}>
                Same playbook.
              </span>
            </h2>
            <p className="lead">Watch each account move from before, to month one, to scaled.</p>
          </div>
        }
      />
      <p style={{ margin: "16px 0 0", fontSize: "13px", color: "#a1a1aa" }}>Client names withheld at their request. Purchase value as reported in Meta Ads Manager. Every account is different. Results vary.</p>
    </section>
  );
}

function About() {
  return (
    <section id="about" style={{ background: "#fafafa", borderTop: "1px solid #f4f4f5" }}>
      <div className="w" style={{ paddingTop: "128px", paddingBottom: "128px", display: "flex", flexWrap: "wrap", gap: "64px", alignItems: "center" }}>
        <div style={{ flex: "0 1 440px", minWidth: "260px", aspectRatio: "4 / 5", borderRadius: "26px", overflow: "hidden", position: "relative", background: "#e9e7e3", boxShadow: "0 40px 80px -40px rgba(9,9,11,.4)" }}>
          <Image src="/scaleitads/akshay-kolluru.jpg" alt="Akshay Kolluru, growth manager at ScaleitAds" fill sizes="(max-width: 860px) 100vw, 440px" style={{ objectFit: "cover", objectPosition: "50% 0%", maxWidth: "none" }} />
          <div style={{ position: "absolute", left: "18px", right: "18px", bottom: "18px", padding: "14px 16px", borderRadius: "14px", background: "rgba(9,9,11,.62)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.12)", color: "#fafafa" }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: "15px" }}>Akshay Kolluru</p>
            <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#d4d4d8" }}>Your growth manager</p>
          </div>
        </div>
        <div className="rv" style={{ flex: "1 1 440px", minWidth: 0 }}>
          <p className="eb">Who runs your account</p>
          <h2 className="h2">
            Marketing{" "}
            <span className="serif gradd" style={{ fontSize: "1.1em" }}>
              plus
            </span>{" "}
            strategy.
          </h2>
          <p className="lead">I&apos;m Akshay, your growth manager. My work isn&apos;t just marketing. It&apos;s marketing plus strategy. I&apos;ve taken companies from 1x to 5x, and from 5x to 10x. Now I bring that to brands on Meta.</p>
          <div style={{ marginTop: "30px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
            {ABOUT_TILES.map((t) => (
              <div key={t.v} style={{ padding: "16px", borderRadius: "14px", background: "#ffffff", border: "1px solid #e4e4e7" }}>
                <p style={{ margin: 0, fontSize: "12px", color: "#71717a" }}>{t.k}</p>
                <p style={{ margin: "6px 0 0", fontSize: "16px", fontWeight: 600, color: t.c }}>{t.v}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
            {ABOUT_RESULTS.map((r) => (
              <a key={r.k} href="#results" style={{ display: "block", padding: "14px", borderRadius: "14px", background: "#09090b", color: "#fafafa", textDecoration: "none" }}>
                <p style={{ margin: 0, fontSize: "12px", color: "#a1a1aa" }}>{r.k}</p>
                <p className="mono" style={{ margin: "6px 0 0", fontSize: "13px", color: "#a1a1aa" }}>
                  {r.from}
                </p>
                <p className="mono" style={{ margin: "2px 0 0", fontSize: "18px", fontWeight: 500, color: "#6ee7b7" }}>
                  {r.to}
                </p>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section style={{ position: "relative", overflow: "hidden", background: "#09090b", color: "#fafafa" }}>
      <div aria-hidden="true" style={{ position: "absolute", left: "50%", bottom: "-340px", width: "1100px", height: "680px", transform: "translateX(-50%)", background: "radial-gradient(closest-side, rgba(16,185,129,.4), transparent)", filter: "blur(10px)" }} />
      <div className="w" style={{ position: "relative", paddingTop: "160px", paddingBottom: "150px", textAlign: "center" }}>
        <h2 className="zoom" style={{ margin: "0 auto", maxWidth: "900px", fontWeight: 600, fontSize: "clamp(42px, 6.6vw, 92px)", lineHeight: 0.98, letterSpacing: "-0.05em" }}>
          See it in{" "}
          <span className="serif grad" style={{ fontSize: "1.1em" }}>
            5 minutes.
          </span>
        </h2>
        <p style={{ margin: "24px auto 0", maxWidth: "520px", fontSize: "18px", lineHeight: 1.6, color: "#a1a1aa" }}>Watch the short video. If it makes sense, book a call.</p>
        <Link className="btn btn-w" href="/watch" style={{ marginTop: "38px", height: "56px", padding: "0 30px", fontSize: "16px" }}>
          {PLAY}
          Watch the video
        </Link>
      </div>
      <footer className="w" style={{ position: "relative", paddingTop: "28px", paddingBottom: "36px", borderTop: "1px solid rgba(255,255,255,.08)", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "16px", fontSize: "13px", color: "#71717a" }}>
        <span>© {new Date().getFullYear()} ScaleitAds. Every account is different. Results vary.</span>
        <FooterLinks />
        <p style={{ margin: 0, flexBasis: "100%", fontSize: "12px", color: "#52525b" }}>Not affiliated with or endorsed by Meta Platforms, Inc. Meta, Facebook and Instagram are trademarks of Meta Platforms, Inc.</p>
      </footer>
    </section>
  );
}
