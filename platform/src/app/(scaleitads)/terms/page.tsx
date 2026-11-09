import { LegalShell } from "../_site/legal";
import { pageMetadata } from "../_site/parts";

// Verbatim from the old scaleitads.com/terms (GoHighLevel, captured Nov 2026). Keep the wording as is:
// it is the owner's legal text. Only links changed (Cloudflare-obfuscated emails -> mailto).
export const metadata = pageMetadata({ title: "Terms of Service | ScaleitAds", description: "Terms of Service | ScaleitAds", path: "/terms" });

const TOC: [string, string][] = [
  ["#about", "01. About these terms"],
  ["#service", "02. What we do"],
  ["#fees", "03. Fees and payment"],
  ["#term", "04. Month to month, cancel any time"],
  ["#you", "05. Your responsibilities"],
  ["#results", "06. Results and guarantees"],
  ["#meta", "07. Meta and other platforms"],
  ["#ip", "08. Ownership and confidentiality"],
  ["#liability", "09. Limits of liability"],
  ["#site", "10. Using our website"],
  ["#law", "11. Law and disputes"],
  ["#changes", "12. Changes and contact"],
];

export default function TermsPage() {
  return (
    <LegalShell
      id="sia-terms"
      title={<>Terms of <span className="serif" style={{ color: "#059669", fontSize: "1.1em" }}>Service</span></>}
      sub="The rules for using our site and working with us. Short, fair, and in plain English."
      effective="Effective: October 8, 2026 &#183; Last updated: October 8, 2026"
      toc={TOC}
      other={{ href: "/privacy", label: "Privacy Policy" }}
    >
<article style={{ flex: "1 1 auto", minWidth: "0", maxWidth: "720px" }}>
<section id="about" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>01</span>About these terms</h2>
<p>These terms apply when you use scaleitads.com, book a call, or work with ScaleitAds (&#8220;we&#8221;, &#8220;us&#8221;). Legal business name: Akshay Kiriti Kolluru (sole proprietor, trading as ScaleitAds). Based in: Hyderabad, Telangana, India.</p>
<p>By using the site or our services, you agree to these terms. If you become a client, any written proposal or agreement we both accept also applies, and it wins if the two ever disagree.</p>
</section>
<section id="service" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>02</span>What we do</h2>
<p>We optimize and manage Meta (Facebook and Instagram) ad accounts for businesses.</p>
<ul style={{ margin: "12px 0 0", paddingLeft: "20px" }}><li>Month one is optimization: we work on your existing ads and budget.</li><li>Scaling, with new ads and more budget, is a separate plan we agree on in writing.</li><li>We give creative direction. You or your team film or supply the content unless we agree otherwise.</li></ul>
</section>
<section id="fees" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>03</span>Fees and payment</h2>
<ul style={{ margin: "12px 0 0", paddingLeft: "20px" }}><li>Month one is a flat $600 USD, paid upfront before work starts.</li><li>From month two, fees follow the plan we agree in writing, which may include a monthly fee and a success fee.</li><li>Ad spend is separate. You pay Meta directly from your own ad account. We never hold your ad budget.</li><li>Invoices are due on receipt and paid through Wise or another method we agree. Prices exclude taxes you may owe in your country.</li></ul>
</section>
<section id="term" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>04</span>Month to month, cancel any time</h2>
<ul style={{ margin: "12px 0 0", paddingLeft: "20px" }}><li>There is no long-term contract. Either side can stop with written notice (email or WhatsApp is fine) before the next billing date.</li><li>Fees for a month that has started are not refunded.</li><li>When we stop, we hand back control and you should remove our access to your accounts.</li></ul>
</section>
<section id="you" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>05</span>Your responsibilities</h2>
<ul style={{ margin: "12px 0 0", paddingLeft: "20px" }}><li>Give us the access we need, and keep your ad account, payment method and website working.</li><li>Make sure your products, claims, ads and landing pages are legal and follow Meta's Advertising Standards.</li><li>Own or have the rights to the content you give us.</li><li>Tell us about promotions, stock issues, price changes or anything else that affects results.</li></ul>
</section>
<section id="results" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>06</span>Results and guarantees</h2>
<p>We work hard to grow your revenue, and we judge ourselves on it. But results depend on things we don't control: your product, offer, website, pricing, season, competitors and Meta itself. So we can't guarantee any specific revenue, ROAS or profit.</p>
<p>Client results shown on our site are real examples. They are not a promise of what you will get. Every account is different.</p>
</section>
<section id="meta" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>07</span>Meta and other platforms</h2>
<p>Meta controls its own platform. We are not responsible for account restrictions, ad rejections, policy changes, outages or billing done by Meta. ScaleitAds is not affiliated with or endorsed by Meta Platforms, Inc.</p>
</section>
<section id="ip" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>08</span>Ownership and confidentiality</h2>
<ul style={{ margin: "12px 0 0", paddingLeft: "20px" }}><li>Your ad account, data, brand and content stay yours.</li><li>Ads and campaign setups we build for you are yours once paid for. Our general methods, templates and know-how stay ours.</li><li>We keep your business information confidential and only use it to serve you. We may describe results anonymously, and we only name you with your written OK.</li></ul>
</section>
<section id="liability" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>09</span>Limits of liability</h2>
<p>To the extent the law allows, we aren't liable for indirect or consequential losses, such as lost profits, lost data or business interruption. Our total liability for any claim is limited to the fees you paid us in the 3 months before the claim.</p>
<p>Nothing in these terms limits liability that can't be limited by law.</p>
</section>
<section id="site" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>10</span>Using our website</h2>
<ul style={{ margin: "12px 0 0", paddingLeft: "20px" }}><li>Don't misuse the site, try to break it, or copy its content for commercial use without permission.</li><li>We may update or pause the site at any time.</li><li>Our Privacy Policy explains how we handle personal data and cookies.</li></ul>
</section>
<section id="law" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>11</span>Law and disputes</h2>
<p>These terms are governed by the laws of India, and the courts of Hyderabad, Telangana have jurisdiction. Before going to court, we both agree to try to settle any dispute in good faith by talking first.</p>
<p>If any part of these terms can't be enforced, the rest still applies.</p>
</section>
<section id="changes" className="sec" style={{ paddingBottom: "40px", marginBottom: "40px", borderBottom: "1px solid #f4f4f5" }}>
<h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600", letterSpacing: "-0.02em" }}><span className="mono" style={{ fontSize: "14px", color: "#a1a1aa", marginRight: "10px" }}>12</span>Changes and contact</h2>
<p>We may update these terms. The date at the top shows the latest version. Changes don't affect a month you've already paid for.</p>
<p>Questions? Email hello@scaleitads.com.</p>
</section>
<div style={{ padding: "22px", borderRadius: "16px", background: "#fafafa", border: "1px solid #e4e4e7" }}>
<p style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>Questions about these terms?</p>
<p style={{ margin: "6px 0 0", fontSize: "15px", lineHeight: "1.6", color: "#52525b" }}>Email <a href="mailto:hello@scaleitads.com" style={{ textDecoration: "underline" }}>hello@scaleitads.com</a>. We're happy to explain anything before you sign up.</p>
</div>
</article>
    </LegalShell>
  );
}
