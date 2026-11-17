import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { reelVaultConfigured } from "@/lib/reelvault";
import { AppSection } from "@/components/skool/app";
import { Footer, Nav, type NavLink } from "@/components/skool/chrome";
import { Faq, FinalCta } from "@/components/skool/close";
import { Cancel, Cost } from "@/components/skool/cost";
import { Container, Em, type Cta } from "@/components/skool/parts";
import { PeteStory } from "@/components/skool/pete";
import { ReelVaultSection } from "@/components/skool/reelvault";
import { Rule } from "@/components/skool/rule";
import { SkoolShell } from "@/components/skool/shell";
import { Week } from "@/components/skool/week";
import { APP, CANCEL, DAYS, DESCRIPTION, NAME, SKOOL_URL, TITLE, costLines, faqItems } from "../content";

// scaleitads.com/skool/inside: the full tour of the Skool Growth Program, for the visitors who want
// every detail before they start. The sales page (/skool) stays short and links here.

const PAGE_TITLE = `Everything inside · ${TITLE}`;

export const metadata: Metadata = {
  title: { absolute: PAGE_TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "https://scaleitads.com/skool/inside" },
  openGraph: { type: "website", siteName: "ScaleitAds", url: "https://scaleitads.com/skool/inside", title: PAGE_TITLE, description: DESCRIPTION, images: [{ url: "https://scaleitads.com/scaleitads/og-skool.png", width: 1200, height: 630, alt: TITLE }] },
};

const LINKS: NavLink[] = [
  ["#week", "The week"],
  ["#rule", "The rule"],
  ["#app", "The app"],
  ["#cost", "What it costs"],
  ["#faq", "Questions"],
];

export default function SkoolInsidePage() {
  const join: Cta = { href: SKOOL_URL, label: "Start your 7-day free trial" };
  const signup = `${APP}/signup`;
  const reelVault = reelVaultConfigured();

  return (
    <SkoolShell>
      <Nav name={NAME} join={join} loginHref={`${APP}/login`} links={LINKS} />
      <main>
        <section className="relative pt-14 md:pt-24">
          <div aria-hidden className="sk-gridlines pointer-events-none absolute inset-0 -z-10 opacity-70" />
          <Container className="flex flex-col items-center text-center">
            <Link href="/skool" className="reveal inline-flex items-center gap-2 text-[14px] font-semibold">
              <ArrowLeftIcon className="size-4" aria-hidden /> The short version
            </Link>
            <h1 className="reveal sk-display mt-6 max-w-[16ch] text-[46px] text-white [transition-delay:80ms] sm:text-[64px] lg:text-[84px]">
              Everything inside <Em>the Anti-Pete Week.</Em>
            </h1>
            <p className="reveal mt-6 max-w-[52ch] text-[17px] leading-relaxed text-white/60 [transition-delay:160ms] md:text-[19px]">
              Every day in full, the rule that keeps the group alive, a tour of the {NAME} app and ReelVault, the whole price list, and exactly what happens if you cancel.
            </p>
          </Container>
        </section>
        <PeteStory />
        <Week days={DAYS} />
        <Rule />
        <AppSection name={NAME} signupHref={signup} reelVault={reelVault} />
        <ReelVaultSection live={reelVault} />
        <Cost
          lines={costLines(reelVault)}
          footnote={
            <>
              <span className="font-semibold text-foreground">The total</span> is mostly up to you. The ads are the only part that grows, and you&apos;re the one holding the switch.
            </>
          }
        />
        <Cancel points={CANCEL} lead="Day 7 ends with a private decision: stay or go. Nobody asks you to announce it. If it's go, this is exactly what happens." />
        <Faq items={faqItems(reelVault)} />
        <FinalCta join={join} signupHref={signup} />
      </main>
      <Footer name={NAME} appUrl={APP} skoolUrl={SKOOL_URL} />
    </SkoolShell>
  );
}
