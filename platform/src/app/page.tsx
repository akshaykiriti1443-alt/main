import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getCurrentUser, requestHost } from "@/server/auth";
import { agencyForHost } from "@/server/agency";

export const dynamic = "force-dynamic";

export default async function Home() {
  const agency = await agencyForHost(await requestHost());
  if (agency) redirect("/login");
  const user = await getCurrentUser();
  return (
    <main className="mk">
      <nav className="mk-nav">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">{env.platformName.slice(0, 2).toUpperCase()}</span>
          {env.platformName}
        </div>
        <div className="row">
          {user ? (
            <Link className="btn btn-primary" href="/app">Open dashboard</Link>
          ) : (
            <>
              <Link className="btn" href="/login">Log in</Link>
              <Link className="btn btn-primary" href="/signup">Claim your account</Link>
            </>
          )}
        </div>
      </nav>

      <section className="mk-hero">
        <div className="eyebrow">For Skool owners, coaches and trainers</div>
        <h1>Your funnel, leads and inbox. Built in one minute.</h1>
        <p>Tell the AI who you help. It writes your landing page, lead magnet, emails and ads. Leads land in one inbox with a hot, warm or cold score.</p>
        <div className="row">
          <Link className="btn btn-primary" href="/signup">Start with your member code</Link>
          <Link className="btn" href="/login">Log in</Link>
        </div>
      </section>

      <section className="grid-3">
        <div className="card tier">
          <div className="eyebrow">Tier 1</div>
          <h2>Member</h2>
          <div className="price">Included</div>
          <p className="muted">With your Skool membership.</p>
          <ul>
            <li>AI launch kit: page, lead magnet, emails, ads</li>
            <li>Landing pages with Meta Pixel + Conversions API</li>
            <li>Lead list and 3-email follow-up</li>
            <li>Custom ad review</li>
          </ul>
        </div>
        <div className="card tier featured">
          <div className="eyebrow">Tier 2</div>
          <h2>Growth</h2>
          <div className="price">Monthly + usage</div>
          <p className="muted">For owners who sell every day.</p>
          <ul>
            <li>One inbox for Instagram, Facebook, WhatsApp and SMS</li>
            <li>AI lead scoring and reply drafts</li>
            <li>Automations, email campaigns, social planner</li>
            <li>Custom domains. Pay as you go for messages</li>
          </ul>
        </div>
        <div className="card tier">
          <div className="eyebrow">Tier 3</div>
          <h2>Agency</h2>
          <div className="price">Resell it</div>
          <p className="muted">Your brand. Your clients.</p>
          <ul>
            <li>Unlimited client sub-accounts</li>
            <li>Your logo, colors and app domain</li>
            <li>Templates you can load into any account</li>
            <li>Set your own prices</li>
          </ul>
        </div>
      </section>
      <footer className="row small muted" style={{ gap: 16 }}>
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/legal/terms">Terms</Link>
        <Link href="/legal/data-deletion">Data deletion</Link>
      </footer>
    </main>
  );
}
