import { scaleitadsBooking } from "@/server/scaleitads";
import { LegalShell } from "../_site/legal";
import { pageMetadata } from "../_site/parts";

// Verbatim from the old scaleitads.com/privacy (GoHighLevel, captured Nov 2026). Keep the wording as is:
// it is the owner's legal text. Only links changed (Cloudflare-obfuscated emails -> mailto), and the
// two places that name HighLevel turn neutral once /apply runs on our own stack (SCALEITADS_WORKSPACE
// + SCALEITADS_CALENDAR, see src/server/scaleitads.ts); while it still uses GoHighLevel they read as before.
export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ title: "Privacy Policy | ScaleitAds", description: "Privacy Policy | ScaleitAds", path: "/privacy" });

const TOC: [string, string][] = [
  ["#who", "01. Who we are"],
  ["#collect", "02. What we collect"],
  ["#use", "03. How we use it"],
  ["#legal", "04. Legal bases (EU, UK and similar laws)"],
  ["#cookies", "05. Cookies and tracking"],
  ["#share", "06. Who we share it with"],
  ["#transfers", "07. International transfers"],
  ["#retention", "08. How long we keep it"],
  ["#rights", "09. Your rights"],
  ["#messages", "10. Messages from us"],
  ["#security", "11. Security and children"],
  ["#changes", "12. Changes and contact"],
];

export default async function PrivacyPage() {
  const ownStack = Boolean(await scaleitadsBooking());
  const provider = ownStack ? "Our CRM and booking tools" : "HighLevel (LeadConnector)";
  const cookieProvider = ownStack ? "Our booking tools" : "HighLevel";
  return (
    <LegalShell
      id="sia-privacy"
      title={<>Privacy <span className="serif" style={{ color: "#059669", fontSize: "1.1em" }}>Policy</span></>}
      sub="What we collect, why we collect it, and the choices you have. Written in plain English."
      effective="Effective: October 8, 2026 &#183; Last updated: October 8, 2026"
      toc={TOC}
      other={{ href: "/terms", label: "Terms of Service" }}
    >
<article style={{ flex: "1 1 auto", minWidth: "0", maxWidth: "720px" }}>
<section id="who" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>01</span>Who we are</h2>
<p>ScaleitAds (&#8220;we&#8221;, &#8220;us&#8221;) is a Meta ads optimization service run by Akshay Kolluru. This policy covers scaleitads.com, our booking flow, and the messages we send you.</p>
<p>Legal business name: Akshay Kiriti Kolluru (sole proprietor, trading as ScaleitAds). Based in: Hyderabad, Telangana, India. Contact: akshay@scaleitads.com. We are the controller of the personal data described here.</p>
</section>
<section id="collect" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>02</span>What we collect</h2>
<p>We only collect what we need to book your call and, if we work together, run your account.</p>
<ul style={{ margin: "12px 0 0", paddingLeft: "20px" }}><li>What you give us: your name, email, WhatsApp or phone number, and your answers to our qualifying questions (monthly ad spend, rough monthly revenue, what you sell).</li><li>If you book a call: the time you chose, plus anything you send before the call, such as an ad account export or business numbers.</li><li>If you become a client: access to your Meta ad account and the reports in it, billing details, and our messages with you.</li><li>Collected automatically: device and browser type, pages visited, rough location from your IP address, and, if you allow analytics and marketing cookies, Meta Pixel events such as page views and bookings, and Microsoft Clarity data on how you use the pages (clicks, scrolls and time on page).</li></ul>
</section>
<section id="use" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>03</span>How we use it</h2>
<p>We never sell your personal data. We never use your ad account data for anything other than your account.</p>
<ul style={{ margin: "12px 0 0", paddingLeft: "20px" }}><li>To check whether we're a good fit and book your call.</li><li>To send call confirmations, reminders and follow-ups by email, WhatsApp or SMS.</li><li>To deliver our service if you become a client.</li><li>To measure and improve our own ads and website, only with your consent where the law requires it.</li><li>To meet legal, tax and accounting duties, and to protect our rights.</li></ul>
</section>
<section id="legal" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>04</span>Legal bases (EU, UK and similar laws)</h2>
<ul style={{ margin: "12px 0 0", paddingLeft: "20px" }}><li>Contract: to book your call and deliver our service.</li><li>Consent: for marketing cookies and marketing messages. You can withdraw it any time.</li><li>Legitimate interests: to run and secure our site and to follow up on a call you asked for.</li><li>Legal obligation: to keep financial records.</li></ul>
</section>
<section id="cookies" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>05</span>Cookies and tracking</h2>
<p>Essential cookies keep the site and booking working. They are always on. Analytics and marketing cookies, like Microsoft Clarity and the Meta Pixel, help us improve the site and see which of our ads lead to bookings. They only load if you click Accept or switch them on in Cookie settings.</p>
<p>You can change your choice any time with the Cookie settings link in the footer, or by clearing cookies in your browser. Our fonts load from Google Fonts, which receives your IP address but sets no cookies.</p>
<div style={{ marginTop: "18px", overflowX: "auto", border: "1px solid #e4e4e7", borderRadius: "14px" }}><table style={{ width: "100%", minWidth: "560px", borderCollapse: "collapse", fontSize: "14px" }}><thead><tr style={{ background: "#fafafa", textAlign: "left" }}><th style={{ padding: "12px 14px", fontWeight: "600", borderBottom: "1px solid #e4e4e7" }}>Cookie</th><th style={{ padding: "12px 14px", fontWeight: "600", borderBottom: "1px solid #e4e4e7" }}>Provider</th><th style={{ padding: "12px 14px", fontWeight: "600", borderBottom: "1px solid #e4e4e7" }}>Purpose</th><th style={{ padding: "12px 14px", fontWeight: "600", borderBottom: "1px solid #e4e4e7" }}>Type</th><th style={{ padding: "12px 14px", fontWeight: "600", borderBottom: "1px solid #e4e4e7" }}>Lasts</th></tr></thead><tbody><tr><td className="mono" style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", fontSize: "13px" }}>cookie_consent</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", color: "#3f3f46" }}>ScaleitAds</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", color: "#3f3f46" }}>Remembers your cookie choice</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5" }}><span style={{ display: "inline-flex", height: "24px", alignItems: "center", padding: "0 9px", borderRadius: "999px", fontSize: "12px", fontWeight: "600", background: "#f4f4f5", color: "#3f3f46" }}>Essential</span></td><td className="mono" style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", fontSize: "13px", color: "#52525b" }}>12 months</td></tr><tr><td className="mono" style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", fontSize: "13px" }}>Session cookies</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", color: "#3f3f46" }}>{cookieProvider}</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", color: "#3f3f46" }}>Keep pages, forms and booking working</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5" }}><span style={{ display: "inline-flex", height: "24px", alignItems: "center", padding: "0 9px", borderRadius: "999px", fontSize: "12px", fontWeight: "600", background: "#f4f4f5", color: "#3f3f46" }}>Essential</span></td><td className="mono" style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", fontSize: "13px", color: "#52525b" }}>Session to 12 months</td></tr><tr><td className="mono" style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", fontSize: "13px" }}>_fbp</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", color: "#3f3f46" }}>Meta</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", color: "#3f3f46" }}>Meta Pixel: measures visits and bookings from our ads</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5" }}><span style={{ display: "inline-flex", height: "24px", alignItems: "center", padding: "0 9px", borderRadius: "999px", fontSize: "12px", fontWeight: "600", background: "#ecfdf5", color: "#047857" }}>Marketing</span></td><td className="mono" style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", fontSize: "13px", color: "#52525b" }}>90 days</td></tr><tr><td className="mono" style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", fontSize: "13px" }}>_fbc</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", color: "#3f3f46" }}>Meta</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", color: "#3f3f46" }}>Meta Pixel: remembers the ad you clicked</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5" }}><span style={{ display: "inline-flex", height: "24px", alignItems: "center", padding: "0 9px", borderRadius: "999px", fontSize: "12px", fontWeight: "600", background: "#ecfdf5", color: "#047857" }}>Marketing</span></td><td className="mono" style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", fontSize: "13px", color: "#52525b" }}>90 days</td></tr><tr><td className="mono" style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", fontSize: "13px" }}>_clck</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", color: "#3f3f46" }}>Microsoft</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", color: "#3f3f46" }}>Clarity: counts unique visitors to improve the site</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5" }}><span style={{ display: "inline-flex", height: "24px", alignItems: "center", padding: "0 9px", borderRadius: "999px", fontSize: "12px", fontWeight: "600", background: "#ecfdf5", color: "#047857" }}>Marketing</span></td><td className="mono" style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", fontSize: "13px", color: "#52525b" }}>1 year</td></tr><tr><td className="mono" style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", fontSize: "13px" }}>_clsk</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", color: "#3f3f46" }}>Microsoft</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", color: "#3f3f46" }}>Clarity: links page views in one visit</td><td style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5" }}><span style={{ display: "inline-flex", height: "24px", alignItems: "center", padding: "0 9px", borderRadius: "999px", fontSize: "12px", fontWeight: "600", background: "#ecfdf5", color: "#047857" }}>Marketing</span></td><td className="mono" style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", fontSize: "13px", color: "#52525b" }}>1 day</td></tr></tbody></table></div>
</section>
<section id="share" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>06</span>Who we share it with</h2>
<p>We share data only with service providers who help us run the business, under contracts that require them to protect it:</p>
<ul style={{ margin: "12px 0 0", paddingLeft: "20px" }}><li>{provider}: website, forms, calendar, CRM, email, SMS and WhatsApp messaging.</li><li>Meta Platforms: the Meta Pixel (with your consent) and WhatsApp Business messaging.</li><li>Microsoft: Clarity site analytics (with your consent).</li><li>Our video-call provider, for the call itself.</li><li>Wise: payments and invoicing for clients.</li><li>Professional advisers and authorities, when the law requires it.</li></ul>
</section>
<section id="transfers" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>07</span>International transfers</h2>
<p>We are based in India, and our providers may store data in the United States and other countries. Where the law requires it, we rely on safeguards such as the EU Standard Contractual Clauses.</p>
</section>
<section id="retention" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>08</span>How long we keep it</h2>
<ul style={{ margin: "12px 0 0", paddingLeft: "20px" }}><li>Leads who don't become clients: up to 24 months after our last contact, then deleted.</li><li>Clients: for as long as we work together, then as long as tax and accounting law requires.</li><li>Ad account access: removed when our work ends. Please also remove our access on your side.</li></ul>
</section>
<section id="rights" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>09</span>Your rights</h2>
<p>Depending on where you live (for example the EU, UK, California, or India under the DPDP Act 2023), you can:</p>
<ul style={{ margin: "12px 0 0", paddingLeft: "20px" }}><li>Ask for a copy of your data, or ask us to correct or delete it.</li><li>Object to or limit how we use it, and withdraw consent at any time.</li><li>Ask us to move your data to another provider.</li><li>Opt out of any &#8220;sale&#8221; or &#8220;sharing&#8221; for targeted ads. We don't sell data, and you can turn off marketing cookies.</li><li>Complain to your local data protection authority.</li></ul>
</section>
<section id="messages" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>10</span>Messages from us</h2>
<p>When you book, you agree to get messages about your call by email, WhatsApp and SMS. Message and data rates may apply. Reply STOP to any text or WhatsApp to opt out, or use the unsubscribe link in any email. We'll still send messages you need, such as a booking you made.</p>
</section>
<section id="security" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>11</span>Security and children</h2>
<p>We use reputable providers, access controls and encryption in transit to protect your data. No system is perfectly secure, so we'll tell you promptly if a breach affects you.</p>
<p>Our service is for businesses. We don't knowingly collect data from anyone under 18.</p>
</section>
<section id="changes" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>12</span>Changes and contact</h2>
<p>If we change this policy, we'll update the date at the top. For big changes, we'll tell clients directly.</p>
<p>To use any of your rights, email akshay@scaleitads.com. We may need to confirm your identity first.</p>
</section>
<div style={{ padding: "22px", borderRadius: "16px", background: "#fafafa", border: "1px solid #e4e4e7" }}>
<p style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>Questions about your data?</p>
<p style={{ margin: "6px 0 0", fontSize: "15px", lineHeight: "1.6", color: "#52525b" }}>Email <a href="mailto:akshay@scaleitads.com" style={{ textDecoration: "underline" }}>akshay@scaleitads.com</a>. We reply within 30 days, usually much sooner.</p>
</div>
</article>
    </LegalShell>
  );
}
