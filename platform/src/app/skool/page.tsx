import type { Metadata } from "next";
import Link from "next/link";
import { reelVaultConfigured } from "@/lib/reelvault";
import { Footer, Nav, type NavLink } from "@/components/skool/chrome";
import { Faq, FinalCta } from "@/components/skool/close";
import { DayLoop, Hero, type Part } from "@/components/skool/hero";
import { Pain, Price, Proof, TourLink, Wins } from "@/components/skool/landing";
import type { Cta } from "@/components/skool/parts";
import { SkoolShell } from "@/components/skool/shell";
import { APP, AUTO_BILL, DESCRIPTION, NAME, SHORT_FAQ, SKOOL_URL, TITLE, faqItems, membershipItem } from "./content";

// scaleitads.com/skool: The Skool Growth Program by ScaleitAds, sold as one thing: the free
// Anti-Pete Week course in Skool, the OneX app that does the work, and ReelVault. On the app host
// "/" opens the app, and src/middleware.ts serves this page on the marketing hosts. Static: no
// session needed, every account link goes to the app.
// This page is short on purpose: most visitors read the first two screens and skim the rest, so
// it says the whole offer up there and keeps every block scannable. Order: the hook, then Pain
// (growing a group without a following), Patch (the week's seven wins), Prove (honest proof, no
// testimonials) and Push (price, questions, one button). The long version (every day in
// full, the rule, the app tour, the full price list and cancel steps) is /skool/inside.
// Truth rules: real prices only, no testimonials, no member counts, no invented numbers, no
// countdowns (DESIGN_SYSTEM.md section 10). The shared words live in ./content.tsx.

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "https://scaleitads.com/skool" },
  openGraph: { type: "website", siteName: "ScaleitAds", url: "https://scaleitads.com/skool", title: TITLE, description: DESCRIPTION, images: [{ url: "https://scaleitads.com/scaleitads/og-skool.png", width: 1200, height: 630, alt: TITLE }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["https://scaleitads.com/scaleitads/og-skool.png"] },
};

const LINKS: NavLink[] = [
  ["#pain", "Why it's hard"],
  ["#wins", "What you get"],
  ["#proof", "Proof"],
  ["#cost", "Price"],
  ["#faq", "Questions"],
  ["/skool/inside", "Everything inside"],
];

export default function SkoolProgramPage() {
  const join: Cta = { href: SKOOL_URL, label: "Start your 7-day free trial" };
  const signup = `${APP}/signup`;
  const reelVault = reelVaultConfigured();

  const parts: Part[] = [
    { name: "The Anti-Pete Week", what: "The course, in Skool", body: "Seven short lessons. One a day." },
    { name: NAME, what: "The app", body: "Does the work each lesson asks for." },
    { name: "ReelVault", what: "Reel study", body: reelVault ? "Takes apart reels that already work." : "Being set up. Joins the app's menu soon." },
  ];

  const faq = faqItems(reelVault).filter((f) => SHORT_FAQ.includes(f.q));

  return (
    <SkoolShell>
      <Nav name={NAME} join={join} loginHref={`${APP}/login`} links={LINKS} />
      <main>
        <Hero join={join} signupHref={signup} parts={parts} />
        <Pain />
        <Wins join={join} />
        <Proof />
        <DayLoop />
        <Price join={join} membership={membershipItem(reelVault)} autoBill={AUTO_BILL} />
        <Faq items={faq} more={<Link href="/skool/inside#faq">All the questions</Link>} />
        <TourLink />
        <FinalCta join={join} signupHref={signup} />
      </main>
      <Footer name={NAME} appUrl={APP} skoolUrl={SKOOL_URL} />
    </SkoolShell>
  );
}
