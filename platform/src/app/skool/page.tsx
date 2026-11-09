import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  BotIcon,
  Building2Icon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  FlameIcon,
  GlobeIcon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  LockIcon,
  MailIcon,
  MegaphoneIcon,
  MousePointerClickIcon,
  PlusIcon,
  RocketIcon,
  RouteIcon,
  SearchIcon,
  SendIcon,
  SparklesIcon,
  SproutIcon,
  TagIcon,
  TrendingUpIcon,
  UsersIcon,
  WorkflowIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { PENNY_POINT, PENNY_WAVE } from "@/components/penny-art";
import { Reveal, REVEAL_BOOT } from "@/components/reveal";
import { LogoMark, Wordmark } from "@/components/shell";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";

// scaleitads.com/skool: The Skool Growth Program by ScaleitAds (the course + the OneX app).
// It was the app's homepage; on the app host "/" now opens the app, and src/middleware.ts serves
// this page on the marketing hosts. Static: no session needed, every account link goes to the app.
// Truth rules: real prices only, no testimonials, no invented numbers (DESIGN_SYSTEM.md section 10).

/** Where the free trial starts: the Skool group. SKOOL_GROUP_URL overrides it. */
const SKOOL_URL = env.skoolGroupUrl || "https://www.skool.com/0-to-1x-academy-9129/about";
/** Sign-up, log-in and the dashboard live on the app host (app.scaleitads.com). */
const APP = env.appUrl;
const CONTACT = "hello@scaleitads.com";
const AGENCY_MAIL = `mailto:${CONTACT}?subject=${encodeURIComponent(`${env.platformName} Agency plan`)}`;

const TITLE = "The Skool Growth Program by ScaleitAds";
const DESCRIPTION = "Grow your Skool community with ads, not endless posting. The Skool Growth Ladder course and the OneX app, by ScaleitAds. $9/month after a 7-day free trial for the first 100 founding members.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "https://scaleitads.com/skool" },
  openGraph: { type: "website", siteName: "ScaleitAds", url: "https://scaleitads.com/skool", title: TITLE, description: DESCRIPTION, images: [{ url: "https://scaleitads.com/scaleitads/og-skool.png", width: 1200, height: 630, alt: TITLE }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["https://scaleitads.com/scaleitads/og-skool.png"] },
};

type Cta = { href: string; label: string };

/* The plans. Membership prices are the owner's (Nov 2026); Growth and Agency have no fixed price. */
const TIERS: { name: string; price: string; per?: string; note: string; badge?: string; featured?: boolean; features: string[]; cta: Cta; variant: "cta" | "default" | "outline" }[] = [
  {
    name: "Membership",
    price: "$9",
    per: "/month",
    note: "After a 7-day free trial. The founding price for the first 100 members, kept for as long as you stay. After that, $27/month.",
    badge: "Founding price",
    featured: true,
    features: ["The Skool Growth Ladder course and the community on Skool", "The OneX app, included", "AI launch kit: page, lead magnet, emails, ads", "Landing pages with Meta Pixel + Conversions API", "Lead list and 3-email follow-up", "Custom ad review"],
    cta: { href: SKOOL_URL, label: "Start your 7-day free trial" },
    variant: "cta",
  },
  {
    name: "Growth",
    price: "Monthly + usage",
    note: "For owners who sell every day. Switch it on inside the app.",
    features: ["One inbox for Instagram, Facebook, WhatsApp and SMS", "AI lead scoring and reply drafts", "Automations, email campaigns, social planner", "Custom domains. Pay as you go for messages"],
    cta: { href: `${APP}/signup`, label: "Upgrade from inside" },
    variant: "default",
  },
  {
    name: "Agency",
    price: "Priced individually",
    note: "Your brand. Your clients. Message us.",
    features: ["Unlimited client sub-accounts", "Your logo, colors and app domain", "Templates you can load into any account", "Set your own prices"],
    cta: { href: AGENCY_MAIL, label: "Message us" },
    variant: "outline",
  },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "What do I get?",
    a: "The Skool Growth Ladder course and the OneX app. The course starts with Launch Week, seven days that fit your free trial. From day 8, the next modules unlock: Keep, Fix or Kill and the Teardown Room, Level 2, Talk, Rhythm, Season 2 (Levels 3 and 4) and reselling. The app does the work each lesson asks for.",
  },
  {
    q: "What does it cost?",
    a: "$9 a month after a 7-day free trial, for the first 100 founding members, who keep $9 for as long as they stay. After the 100 founding spots, membership is $27 a month. The app is included either way. Growth is an optional upgrade inside the app, and the Agency plan is priced individually.",
  },
  {
    q: "How do I get access?",
    a: "Start your free trial in our Skool community, then sign up for the app with the same email you use on Skool. Your account turns on by itself. No codes to copy.",
  },
  {
    q: "Do I need to know how to run ads?",
    a: "No. Ad research shows you the ads already working in your niche, and Ad studio writes your first 5 static ads with the exact clicks to launch them in Meta Ads Manager. No Pixel needed to start. Penny walks you through it, one step at a time.",
  },
  {
    q: "Do I have to pay for AI?",
    a: "You bring your own: connect the Claude or ChatGPT plan you already have, or a free Gemini key. Free plans work, and whatever your AI costs, you pay your provider directly.",
  },
  {
    q: "Will OneX log in to my Skool account?",
    a: "Never. We don't ask for your Skool password and we never act on your Skool account. Your pages and emails send people to your group's link; joining happens on Skool, where it should.",
  },
  {
    q: "Can I use my own domain?",
    a: "Yes, on the Growth plan. Either way your pages are hosted for you, fast and secure, with nothing to install.",
  },
  {
    q: "Who is behind it?",
    a: (
      <>
        ScaleitAds, the Meta ads agency run by Akshay Kolluru. The course and the app are both ScaleitAds products.{" "}
        <Link href="/">Visit ScaleitAds</Link>.
      </>
    ),
  },
  {
    q: "Can I resell OneX to my own clients?",
    a: "Yes. The Agency plan gives you your logo, colours and app domain, unlimited client sub-accounts and templates you can load into any of them. It's priced individually, so message us.",
  },
];

export default function SkoolProgramPage() {
  const join: Cta = { href: SKOOL_URL, label: "Start your 7-day free trial" };
  return (
    <div className="relative min-h-svh overflow-x-clip bg-background">
      <script dangerouslySetInnerHTML={{ __html: REVEAL_BOOT }} />
      <Reveal />
      <Nav name={env.platformName} join={join} />
      <main>
        <Hero join={join} />
        <Program />
        <Loop />
        <WhoFor />
        <Features />
        <Pricing />
        <Faq />
        <FinalCta join={join} />
      </main>
      <Footer name={env.platformName} />
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
   Shared bits
   --------------------------------------------------------------------------------------------- */


function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-5 md:px-8", className)}>{children}</div>;
}

function SectionHead({ eyebrow, title, sub, className }: { eyebrow: string; title: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("reveal mx-auto flex max-w-3xl flex-col items-center gap-4 text-center", className)}>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="font-display text-[40px] leading-[1.02] tracking-[-0.015em] text-foreground md:text-[60px]">{title}</h2>
      {sub ? <p className="max-w-[58ch] text-[16px] leading-relaxed text-muted-foreground md:text-[18px]">{sub}</p> : null}
    </div>
  );
}

function Penny({ size = 48, pose = "wave", full, className }: { size?: number; pose?: "wave" | "point"; full?: boolean; className?: string }) {
  return (
    <svg
      viewBox={full ? "0 0 200 200" : "22 14 152 152"}
      width={size}
      height={size}
      className={className}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: pose === "point" ? PENNY_POINT : PENNY_WAVE }}
    />
  );
}

const TEMP = {
  hot: "bg-hot-soft text-hot",
  warm: "bg-gold-soft text-gold-foreground",
  cold: "bg-secondary text-muted-foreground",
} as const;

function TempChip({ t, className }: { t: keyof typeof TEMP; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11px] font-semibold capitalize", TEMP[t], className)}>
      {t === "hot" ? <FlameIcon className="size-3" aria-hidden /> : null}
      {t}
    </span>
  );
}

function Avatar({ initials, tone = 0, className }: { initials: string; tone?: number; className?: string }) {
  const tones = [
    "bg-[linear-gradient(135deg,var(--violet-100),var(--pink-100))] text-violet-700",
    "bg-[linear-gradient(135deg,#fde8d7,#ffe4ef)] text-[#9a4a1d]",
    "bg-[linear-gradient(135deg,#dff3ea,#ede8ff)] text-[#0f6b4c]",
    "bg-[linear-gradient(135deg,#fdf0d2,#ede8ff)] text-[#7a5300]",
  ];
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold ring-2 ring-card", tones[tone % tones.length], className)}>
      {initials}
    </span>
  );
}

/* ---------------------------------------------------------------------------------------------
   Nav
   --------------------------------------------------------------------------------------------- */

function Nav({ name, join }: { name: string; join: Cta }) {
  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/70 backdrop-blur-xl backdrop-saturate-150 transition-colors duration-200 [html[data-scrolled]_&]:border-border/70">
      <Container className="flex h-[68px] items-center justify-between gap-4">
        <Link href="/skool" className="flex items-center gap-2.5 hover:no-underline" data-slot="brand" aria-label={`The Skool Growth Program by ScaleitAds`}>
          <Wordmark name={name} />
          <span className="hidden text-[12.5px] font-medium text-muted-foreground sm:inline">by ScaleitAds</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {[
            ["#program", "The program"],
            ["#how", "How it works"],
            ["#pricing", "Pricing"],
            ["#faq", "Questions"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              data-slot="nav-link"
              className="rounded-full px-3.5 py-2 text-[14px] font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button variant="ghost" asChild className="hidden sm:inline-flex">
            <Link href={`${APP}/login`}>Log in</Link>
          </Button>
          <Button variant="cta" asChild>
            <Link href={join.href}>
              <span className="sm:hidden">Free trial</span>
              <span className="hidden sm:inline">Start your free trial</span>
            </Link>
          </Button>
        </div>
      </Container>
    </header>
  );
}

/* ---------------------------------------------------------------------------------------------
   Hero
   --------------------------------------------------------------------------------------------- */

function Hero({ join }: { join: Cta }) {
  return (
    <section className="relative isolate pt-12 pb-20 md:pt-[72px] md:pb-28">
      {/* The faintest galaxy on marshmallow: a few violet stars and two soft glows. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[1000px]">
        <div className="bg-stars absolute inset-0 text-violet-500/45 [mask-image:radial-gradient(55%_60%_at_50%_10%,black,transparent)] dark:text-violet-200/40" />
        <div className="absolute top-[-200px] left-1/2 h-[600px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow-violet),transparent)]" />
        <div className="absolute top-[520px] left-1/2 h-[460px] w-[900px] -translate-x-[10%] rounded-full bg-[radial-gradient(closest-side,var(--glow-pink),transparent)]" />
      </div>

      <Container className="flex flex-col items-center text-center">
        <span className="reveal inline-flex items-center gap-2 rounded-full bg-card/80 py-1 pr-3.5 pl-1.5 text-[13px] font-medium text-foreground/80 shadow-xs ring-1 ring-ink/[0.06] backdrop-blur dark:ring-white/[0.08]">
          <span className="grid size-5 place-items-center rounded-full bg-cta-soft text-cta-soft-foreground">
            <SparklesIcon className="size-3" aria-hidden />
          </span>
          The Skool Growth Program · by ScaleitAds
        </span>

        <h1 className="reveal mt-6 max-w-[17ch] text-[46px] leading-[0.98] tracking-[-0.022em] text-foreground [transition-delay:60ms] sm:text-[64px] lg:text-[82px]">
          Grow your Skool community with ads, <em className="text-gradient-violet pr-1 italic">not endless posting.</em>
        </h1>

        <p className="reveal mt-6 max-w-[58ch] text-[17px] leading-relaxed text-pretty text-muted-foreground [transition-delay:120ms] md:text-[18.5px]">
          A course and an app that work as one. The Skool Growth Ladder shows you each step: ads first, then Skool growth, then lead growth. OneX does the work, from the page your ads point at to the follow-up emails that send every lead to your Skool group.
        </p>

        <div className="reveal mt-8 flex w-full flex-col items-center justify-center gap-3 [transition-delay:180ms] sm:w-auto sm:flex-row">
          <Button variant="cta" size="xl" asChild className="w-full sm:w-auto">
            <Link href={join.href}>
              {join.label}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
          <Button variant="outline" size="xl" asChild className="w-full sm:w-auto">
            <a href="#program">See what&apos;s inside</a>
          </Button>
        </div>

        <ul className="reveal mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13.5px] text-muted-foreground [transition-delay:220ms]">
          {["7-day free trial on Skool", "The app is included", "We never log in to your Skool"].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <CheckIcon className="size-3.5 text-primary dark:text-violet-300" strokeWidth={2.5} aria-hidden />
              {t}
            </li>
          ))}
        </ul>
        <p className="reveal mt-4 text-[13.5px] text-muted-foreground [transition-delay:240ms]">
          Already a member? <Link href={`${APP}/signup`}>Sign up for the app</Link> with your Skool email.
        </p>
      </Container>

      <Container className="reveal mt-14 [transition-delay:260ms] md:mt-16">
        <HeroMock />
      </Container>
    </section>
  );
}

const MOCK_NAV: { icon: LucideIcon; label: string; active?: boolean }[] = [
  { icon: RouteIcon, label: "Your path" },
  { icon: SparklesIcon, label: "AI launch kit" },
  { icon: GlobeIcon, label: "Landing pages" },
  { icon: UsersIcon, label: "Leads", active: true },
  { icon: MailIcon, label: "Emails" },
  { icon: WorkflowIcon, label: "Automations" },
  { icon: SearchIcon, label: "Ad research" },
  { icon: TrendingUpIcon, label: "Growth ladder" },
  { icon: BotIcon, label: "Your AI" },
];

const MOCK_LEADS: { name: string; initials: string; from: string; t: "hot" | "warm" | "cold"; latest: string; when: string }[] = [
  { name: "Jamie Doyle", initials: "JD", from: "Pain ad", t: "hot", latest: "Clicked your Skool link", when: "2m" },
  { name: "Priya Nair", initials: "PN", from: "Dream ad", t: "warm", latest: "Opened email 2 of 3", when: "18m" },
  { name: "Marcus Lee", initials: "ML", from: "Lesson ad", t: "hot", latest: "Downloaded the free guide", when: "1h" },
  { name: "Sofia Alvarez", initials: "SA", from: "Instagram bio", t: "cold", latest: "New lead", when: "3h" },
  { name: "Tom Becker", initials: "TB", from: "Pain ad", t: "warm", latest: "Opened email 1 of 3", when: "5h" },
];

function HeroMock() {
  return (
    <div className="relative mx-auto max-w-[1080px]">
      {/* Glow under the window. */}
      <div aria-hidden className="absolute inset-x-[8%] -bottom-10 top-[20%] -z-10 rounded-[48px] bg-[radial-gradient(closest-side,var(--glow-violet),transparent)] blur-2xl" />

      <div className="overflow-hidden rounded-[22px] bg-card shadow-float ring-1 ring-ink/[0.07] dark:ring-white/[0.08]">
        {/* Window bar */}
        <div className="flex h-11 items-center gap-2 border-b border-border/70 bg-background/60 px-4">
          <span className="size-2.5 rounded-full bg-mist-300 dark:bg-white/15" />
          <span className="size-2.5 rounded-full bg-mist-300 dark:bg-white/15" />
          <span className="size-2.5 rounded-full bg-mist-300 dark:bg-white/15" />
          <span className="mx-auto hidden items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[11.5px] text-muted-foreground sm:flex">
            <LockIcon className="size-3" aria-hidden /> Fit Dads Club · Leads
          </span>
        </div>

        <div className="grid text-left md:grid-cols-[208px_1fr]">
          {/* Sidebar */}
          <aside aria-hidden className="hidden border-r border-border/70 bg-sidebar p-3 md:block">
            <div className="mb-3 flex items-center gap-2.5 rounded-xl px-2 py-1.5">
              <span className="brand-mark size-7 text-[10px]">FD</span>
              <span className="grid leading-tight">
                <span className="text-[13px] font-semibold">Fit Dads Club</span>
                <span className="text-[11px] text-muted-foreground">Member plan</span>
              </span>
            </div>
            <ul className="flex flex-col gap-px">
              {MOCK_NAV.map((n) => (
                <li
                  key={n.label}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-[9px] px-2.5 text-[12.5px] font-medium text-sidebar-foreground",
                    n.active && "bg-sidebar-active text-foreground shadow-[0_1px_2px_rgb(28_21_56/0.06),0_0_0_1px_rgb(28_21_56/0.05)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]",
                  )}
                >
                  <n.icon className={cn("size-[15px] text-sidebar-foreground/55", n.active && "text-primary dark:text-violet-300")} aria-hidden />
                  {n.label}
                </li>
              ))}
            </ul>
          </aside>

          {/* Main */}
          <div className="min-w-0 p-5 md:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="eyebrow mb-2">Leads CRM</div>
                <div className="font-display text-[30px] leading-none tracking-[-0.01em] md:text-[36px]">Your leads</div>
                <div className="mt-2 text-[13px] text-muted-foreground">Everyone who signed up, hottest first.</div>
              </div>
              <div aria-hidden className="flex items-center gap-2">
                <span className="hidden h-8 items-center rounded-full border border-border-strong bg-card px-3.5 text-[12.5px] font-semibold sm:inline-flex">Export</span>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground shadow-press">
                  <PlusIcon className="size-3.5" /> Add lead
                </span>
              </div>
            </div>

            <div aria-hidden className="mt-5 flex items-center gap-1 rounded-full bg-muted p-1 text-[12px] font-medium text-muted-foreground sm:w-fit">
              {["All", "Hot", "Warm", "Cold"].map((f, i) => (
                <span key={f} className={cn("flex-1 rounded-full px-3.5 py-1 text-center", i === 0 && "bg-card text-foreground shadow-xs dark:bg-white/[0.09]")}>
                  {f}
                </span>
              ))}
            </div>

            <div aria-hidden className="mt-4 overflow-hidden rounded-2xl ring-1 ring-ink/[0.06] dark:ring-white/[0.07]">
              <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-border/80 bg-background/50 px-4 py-2.5 text-[10.5px] font-semibold tracking-[0.07em] text-muted-foreground uppercase sm:grid-cols-[1.3fr_0.8fr_0.7fr_1.4fr_40px]">
                <span>Lead</span>
                <span className="hidden sm:block">Came from</span>
                <span>Temperature</span>
                <span className="hidden sm:block">Latest</span>
                <span className="hidden text-right sm:block">When</span>
              </div>
              {MOCK_LEADS.map((l, i) => (
                <div
                  key={l.name}
                  className={cn(
                    "grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/60 px-4 py-2.5 text-[13px] last:border-0 sm:grid-cols-[1.3fr_0.8fr_0.7fr_1.4fr_40px]",
                    i === 0 && "bg-accent/60 dark:bg-white/[0.03]",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar initials={l.initials} tone={i} className="size-7 ring-0" />
                    <span className="truncate font-medium">{l.name}</span>
                  </span>
                  <span className="hidden truncate text-muted-foreground sm:block">{l.from}</span>
                  <span>
                    <TempChip t={l.t} />
                  </span>
                  <span className="hidden truncate text-muted-foreground sm:block">{l.latest}</span>
                  <span className="hidden text-right text-[12px] text-subtle-foreground tabular-nums sm:block">{l.when}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating: a new lead arrives. */}
      <div
        aria-hidden
        className="absolute -top-7 right-3 w-[260px] animate-[float-y_7s_ease-in-out_infinite] rounded-2xl bg-card p-3 shadow-float ring-1 ring-ink/[0.07] sm:-top-8 sm:right-[-28px] sm:w-[290px] dark:ring-white/[0.09]"
      >
        <div className="flex items-center gap-3">
          <span className="relative">
            <Avatar initials="JD" className="size-9 ring-0" />
            <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-cta ring-2 ring-card" />
          </span>
          <span className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-[13px] font-semibold">Jamie signed up</span>
            <span className="truncate text-[11.5px] text-muted-foreground">from your Pain ad · just now</span>
          </span>
          <TempChip t="hot" />
        </div>
      </div>

      {/* Floating: Penny's next step. */}
      <div
        aria-hidden
        className="absolute bottom-[-56px] left-[-52px] hidden w-[300px] animate-[float-y_8s_ease-in-out_infinite] rounded-2xl bg-card p-4 shadow-float ring-1 ring-ink/[0.07] [animation-delay:-3s] lg:block dark:ring-white/[0.09]"
      >
        <div className="flex items-start gap-3">
          <Penny size={44} className="shrink-0 drop-shadow-[0_4px_8px_rgb(201_138_18/0.3)]" />
          <div className="grid min-w-0 gap-1">
            <span className="text-[10.5px] font-semibold tracking-[0.12em] text-accent-foreground uppercase">Up next · Lesson 1.4</span>
            <span className="text-[15px] leading-snug font-semibold">Publish your funnel</span>
            <span className="text-[12px] leading-snug text-muted-foreground">Edit three lines, then press the scary button.</span>
          </div>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
          <span className="block h-full w-[30%] rounded-full bg-[linear-gradient(90deg,var(--violet-500),var(--pink-400))]" />
        </div>
      </div>

      {/* Floating: the landing page it built. */}
      <div
        aria-hidden
        className="absolute right-[-44px] bottom-[-48px] hidden w-[230px] animate-[float-y_9s_ease-in-out_infinite] overflow-hidden rounded-2xl bg-card shadow-float ring-1 ring-ink/[0.07] [animation-delay:-5s] xl:block dark:ring-white/[0.09]"
      >
        <MiniLanding />
      </div>
    </div>
  );
}

/** A tiny landing page, the kind OneX writes for a member. Always light: funnels carry their own theme. */
function MiniLanding({ className, big }: { className?: string; big?: boolean }) {
  return (
    <div className={cn("bg-[#fffaf6] text-[#1c1538]", className)}>
      <div className="flex items-center justify-between border-b border-[#1c1538]/[0.06] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[9px] font-bold tracking-[0.06em]">
          <span className="size-2.5 rounded-[4px] bg-[#0f7a57]" /> FIT DADS CLUB
        </span>
        <span className="text-[8px] text-[#1c1538]/50">Free guide</span>
      </div>
      <div className={cn("px-3 pt-3 pb-3.5", big && "px-5 pt-6 pb-6")}>
        <div className={cn("text-[8.5px] font-semibold tracking-[0.1em] text-[#0f7a57] uppercase", big && "text-[10px]")}>For busy dads</div>
        <div className={cn("mt-1 font-display text-[19px] leading-[1.02]", big && "text-[30px] md:text-[34px]")}>Get strong in 20 minutes a day</div>
        <div className={cn("mt-1.5 text-[9px] leading-snug text-[#1c1538]/60", big && "text-[12px]")}>The free 7-day plan for dads with no time and no gym.</div>
        <div className={cn("mt-2.5 flex gap-1.5", big && "mt-4 gap-2")}>
          <span className={cn("h-6 flex-1 rounded-full border border-[#1c1538]/12 bg-white px-2 text-[8.5px] leading-6 text-[#1c1538]/40", big && "h-9 px-3.5 text-[12px] leading-9")}>you@email.com</span>
          <span className={cn("h-6 rounded-full bg-[#0f7a57] px-2.5 text-[8.5px] leading-6 font-semibold text-white", big && "h-9 px-4 text-[12px] leading-9")}>Send it</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
   How it works: the loop
   --------------------------------------------------------------------------------------------- */

const STEPS: { n: string; icon: LucideIcon; title: string; body: string; art: ReactNode }[] = [
  {
    n: "01",
    icon: MegaphoneIcon,
    title: "Run an ad",
    body: "Start from angles already working in your niche. Your ad points at your own page, so every click is counted.",
    art: (
      <div className="w-full rounded-xl bg-card p-3 shadow-card ring-1 ring-ink/[0.05] dark:ring-white/[0.07]">
        <div className="flex items-center gap-2">
          <span className="brand-mark size-6 text-[9px]">FD</span>
          <span className="grid leading-tight">
            <span className="text-[11px] font-semibold">Fit Dads Club</span>
            <span className="text-[9.5px] text-muted-foreground">Sponsored</span>
          </span>
          <span className="ml-auto rounded-full bg-cta-soft px-2 py-0.5 text-[9.5px] font-semibold text-cta-soft-foreground">Pain</span>
        </div>
        <div className="mt-2 text-[12px] leading-snug font-medium">Tired of 5am workouts that never stick?</div>
        <div className="mt-2 flex items-center justify-between rounded-lg bg-muted px-2 py-1.5 text-[10px]">
          <span className="text-muted-foreground">The 20-minute plan</span>
          <span className="rounded-full bg-card px-2 py-0.5 font-semibold whitespace-nowrap shadow-xs">Learn more</span>
        </div>
      </div>
    ),
  },
  {
    n: "02",
    icon: GlobeIcon,
    title: "Land on your page",
    body: "A landing page written for your community, with your Meta Pixel and Conversions API already wired in.",
    art: (
      <div className="w-full overflow-hidden rounded-xl shadow-card ring-1 ring-ink/[0.05] dark:ring-white/[0.07]">
        <MiniLanding />
      </div>
    ),
  },
  {
    n: "03",
    icon: UsersIcon,
    title: "Catch the lead",
    body: "Every sign-up lands in one list, scored hot, warm or cold, and gets your follow-up emails right away.",
    art: (
      <div className="flex w-full flex-col gap-1.5">
        {(
          [
            ["Jamie Doyle", "JD", "hot"],
            ["Priya Nair", "PN", "warm"],
          ] as const
        ).map(([n, i, t], k) => (
          <div key={n} className="flex items-center gap-2.5 rounded-xl bg-card px-2.5 py-2 shadow-card ring-1 ring-ink/[0.05] dark:ring-white/[0.07]">
            <Avatar initials={i} tone={k} className="size-7 ring-0" />
            <span className="flex-1 truncate text-[12px] font-medium">{n}</span>
            <TempChip t={t} />
          </div>
        ))}
      </div>
    ),
  },
  {
    n: "04",
    icon: MousePointerClickIcon,
    title: "Welcome a member",
    body: "Your emails and thank-you page send them to your Skool group's link. They join on Skool, the way Skool likes it.",
    art: (
      <div className="w-full rounded-xl bg-card p-3 shadow-card ring-1 ring-ink/[0.05] dark:ring-white/[0.07]">
        <div className="flex items-center gap-2.5">
          <Avatar initials="ML" tone={2} className="size-8 ring-0" />
          <div className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-[12px] font-semibold">Marcus joined your group</span>
            <span className="truncate text-[10.5px] text-muted-foreground">via your Skool link</span>
          </div>
          <span className="grid size-6 place-items-center rounded-full bg-success-soft text-success">
            <CheckIcon className="size-3.5" strokeWidth={3} />
          </span>
        </div>
      </div>
    ),
  },
];

const LEVELS = [
  { l: 1, name: "Discovery", h: "h-[28%]" },
  { l: 2, name: "6 custom ads", h: "h-[48%]" },
  { l: 3, name: "Upload your own ads", h: "h-[70%]" },
  { l: 4, name: "Partnership ads", h: "h-[94%]" },
];

function Loop() {
  return (
    <section id="how" className="scroll-mt-20 py-24 md:py-32">
      <Container>
        <SectionHead
          eyebrow="How it works"
          title={
            <>
              One loop that <em className="italic text-primary dark:text-violet-300">feeds itself.</em>
            </>
          }
          sub="Each step hands off to the next, so a stranger who sees your ad ends up a member of your community, and every member makes the next ad easier."
        />

        <ol className="relative mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {/* The thread between the steps. */}
          <div aria-hidden className="absolute top-[118px] right-[12%] left-[12%] hidden h-px bg-[linear-gradient(90deg,transparent,var(--violet-300),var(--pink-300),var(--violet-300),transparent)] lg:block" />
          {STEPS.map((s, i) => (
            <li key={s.n} className="reveal relative flex flex-col rounded-3xl bg-card p-5 shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]" style={{ transitionDelay: `${i * 70}ms` }}>
              <div className="flex h-[150px] items-center justify-center rounded-2xl bg-[radial-gradient(120%_100%_at_50%_0%,var(--accent),var(--background))] px-4 ring-1 ring-ink/[0.03] dark:bg-[radial-gradient(120%_100%_at_50%_0%,rgb(118_85_245/0.14),transparent)] dark:ring-white/[0.04]">
                <div className="w-full max-w-[220px]">{s.art}</div>
              </div>
              <div className="mt-5 flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-full bg-accent text-primary ring-1 ring-violet-200/70 dark:text-violet-300 dark:ring-white/[0.06]">
                  <s.icon className="size-4" aria-hidden />
                </span>
                <span className="text-[12px] font-semibold tracking-[0.12em] text-subtle-foreground tabular-nums">{s.n}</span>
              </div>
              <h3 className="mt-3 text-[18px] font-semibold tracking-[-0.015em]">{s.title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>

        {/* The loop closes: Skool's Growth levels. */}
        <div className="reveal relative mt-5 overflow-hidden rounded-3xl bg-galaxy p-7 text-white shadow-lift ring-1 ring-white/10 md:p-10 lg:mt-6">
          <div aria-hidden className="bg-stars pointer-events-none absolute inset-0 text-white/50" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <span className="inline-flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.14em] text-pink-200 uppercase">
                <ZapIcon className="size-3.5" aria-hidden /> Then Skool joins in
              </span>
              <h3 className="mt-4 font-display text-[34px] leading-[1.04] font-normal tracking-[-0.01em] text-white md:text-[44px]">
                Climb Skool&apos;s Growth levels and Skool starts running ads for you too.
              </h3>
              <p className="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-white/75">
                Your About-page visitors and new paying members unlock Skool&apos;s own ad program, level by level. OneX tracks where you stand and what gets you to the next level, so your ads and Skool&apos;s pull in the same direction.
              </p>
            </div>
            <div aria-hidden className="rounded-2xl bg-white/[0.06] p-5 ring-1 ring-white/10 backdrop-blur-sm md:p-6">
              <div className="flex items-center justify-between text-[11px] font-semibold tracking-[0.1em] text-white/60 uppercase">
                <span>Skool Growth levels</span>
                <TrendingUpIcon className="size-4 text-pink-200" />
              </div>
              <div className="mt-5 grid h-[150px] grid-cols-4 items-end gap-3">
                {LEVELS.map((lv) => (
                  <div key={lv.l} className="flex h-full flex-col justify-end">
                    <div
                      className={cn(
                        "rounded-t-xl rounded-b-md",
                        lv.h,
                        lv.l === 2
                          ? "bg-[linear-gradient(180deg,var(--pink-300),var(--pink-500))] shadow-[0_0_30px_-6px_rgb(255_133_181/0.7)]"
                          : lv.l < 2
                            ? "bg-white/40"
                            : "bg-white/[0.12] ring-1 ring-white/15 ring-inset",
                      )}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-3 text-[11px] leading-tight">
                {LEVELS.map((lv) => (
                  <div key={lv.l} className={cn("text-white/55", lv.l === 2 && "text-white")}>
                    <div className="font-semibold">Level {lv.l}</div>
                    <div className="mt-0.5 text-white/60">{lv.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------
   The program: the course + the app
   --------------------------------------------------------------------------------------------- */

/* Mirrors the course modules and the app's "Your path" (src/server/path.ts). Keep them in step. */
const LAUNCH_WEEK = [
  { day: "Day 1", title: "Open the shop and put 5 ads live" },
  { day: "Days 2–3", title: "Polish your About page, text five people" },
  { day: "Days 4–6", title: "Real conversations, a welcome for your members, your first Ask" },
  { day: "Day 7", title: "Weigh in: a verdict on every ad" },
];
const UNLOCKS = [
  { name: "Day 8: Keep, Fix or Kill", body: "And the Teardown Room: real ads, taken apart" },
  { name: "Level 2", body: "Skool can start running ads for your group" },
  { name: "Talk", body: "Give your members a reason to post" },
  { name: "Rhythm", body: "Half a boring hour a week" },
  { name: "Season 2", body: "Levels 3 and 4: the upper rungs" },
  { name: "Reselling", body: "Optional: your own agency or software" },
];
const APP_POINTS = ["Penny, your guide, shows the one next step", "AI writes your page, free guide, emails and ads", "Every lead in one list, sorted hot, warm and cold", "Tracks your Skool Growth level, week by week"];

function Program() {
  return (
    <section id="program" className="scroll-mt-20 pt-8 pb-4">
      <Container>
        <SectionHead
          eyebrow="The program"
          title={
            <>
              A course that shows you. <em className="italic text-primary dark:text-violet-300">An app that does it.</em>
            </>
          }
          sub="Open the shop, put five ads live, then give people a reason to stay and talk. Every lesson ends with one thing to do, and the app has the button for it."
        />

        <div className="mt-16 grid gap-4 lg:grid-cols-[1.25fr_1fr] lg:gap-5">
          {/* The course */}
          <article className="reveal flex flex-col rounded-3xl bg-card p-7 shadow-card ring-1 ring-ink/[0.06] md:p-9 dark:ring-white/[0.07]">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-accent text-primary ring-1 ring-violet-200/70 dark:text-violet-300 dark:ring-white/[0.06]">
                <GraduationCapIcon className="size-5" aria-hidden />
              </span>
              <div className="grid leading-tight">
                <span className="text-[12px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">The course</span>
                <h3 className="text-[19px] font-semibold tracking-[-0.015em]">The Skool Growth Ladder</h3>
              </div>
            </div>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">In the Skool classroom. It starts with Launch Week, seven days that fit your free trial, and the rest unlocks one module at a time.</p>

            <div className="mt-7 rounded-2xl bg-[radial-gradient(120%_100%_at_50%_0%,var(--accent),var(--background))] p-5 ring-1 ring-ink/[0.04] dark:bg-[radial-gradient(120%_100%_at_50%_0%,rgb(118_85_245/0.14),transparent)] dark:ring-white/[0.05]">
              <div className="flex items-center justify-between gap-3">
                <span className="eyebrow">Launch Week</span>
                <span className="text-[12px] font-medium text-muted-foreground">Days 1–7 · your free trial</span>
              </div>
              <ol className="mt-4 flex flex-col gap-2">
                {LAUNCH_WEEK.map((s) => (
                  <li key={s.day} className="flex items-center gap-3 rounded-xl bg-card px-3.5 py-2.5 shadow-card ring-1 ring-ink/[0.05] dark:ring-white/[0.07]">
                    <span className="w-[68px] shrink-0 text-[12px] font-semibold text-primary tabular-nums dark:text-violet-300">{s.day}</span>
                    <span className="text-[14px] font-medium">{s.title}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3.5 text-[13.5px] leading-snug text-muted-foreground">A Crew that starts the same week, a buddy, and an owner who answers every intro and every Stuck.</p>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <span className="eyebrow">Unlocks from day 8</span>
                <LockIcon className="size-3.5 text-subtle-foreground" aria-hidden />
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {UNLOCKS.map((u) => (
                  <li key={u.name} className="flex flex-col rounded-xl px-3.5 py-2.5 ring-1 ring-border">
                    <span className="text-[13.5px] font-semibold">{u.name}</span>
                    <span className="text-[13px] leading-snug text-muted-foreground">{u.body}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>

          {/* The app */}
          <article className="reveal flex flex-col rounded-3xl bg-card p-7 shadow-card ring-1 ring-ink/[0.06] [transition-delay:70ms] md:p-9 dark:ring-white/[0.07]">
            <div className="flex items-center gap-3">
              <LogoMark className="size-10 rounded-2xl" />
              <div className="grid leading-tight">
                <span className="text-[12px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">The app · included</span>
                <h3 className="text-[19px] font-semibold tracking-[-0.015em]">{env.platformName} by ScaleitAds</h3>
              </div>
            </div>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">Pages, leads, emails and ads in one calm place. Each lesson points at the exact screen, and your path ticks off as you go.</p>
            <ul className="mt-6 flex flex-col gap-3.5 text-[14.5px]">
              {APP_POINTS.map((p) => (
                <li key={p} className="flex gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-primary dark:text-violet-300">
                    <CheckIcon className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                  <span className="leading-snug">{p}</span>
                </li>
              ))}
            </ul>
            {/* What the app shows you: the next step, with the lesson it belongs to. */}
            <div aria-hidden className="mt-8 rounded-2xl bg-[radial-gradient(120%_100%_at_50%_0%,var(--accent),var(--background))] p-5 ring-1 ring-ink/[0.04] dark:bg-[radial-gradient(120%_100%_at_50%_0%,rgb(118_85_245/0.14),transparent)] dark:ring-white/[0.05]">
              <div className="rounded-xl bg-card p-4 shadow-card ring-1 ring-ink/[0.05] dark:ring-white/[0.07]">
                <div className="text-[10.5px] font-semibold tracking-[0.12em] text-accent-foreground uppercase">Day 1 · Lesson 1.4</div>
                <div className="mt-1.5 font-display text-[24px] leading-[1.05]">Publish your funnel</div>
                <div className="mt-1 text-[13px] text-muted-foreground">Edit three lines, then press the scary button.</div>
                <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full w-[30%] rounded-full bg-[linear-gradient(90deg,var(--violet-500),var(--pink-400))]" />
                </div>
              </div>
              <div className="mt-2.5 flex flex-col gap-2">
                {["Say hi in the community", "Build your launch kit"].map((t) => (
                  <div key={t} className="flex items-center gap-2.5 rounded-xl bg-card/70 px-3 py-2 text-[12.5px] ring-1 ring-ink/[0.04] dark:ring-white/[0.06]">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success text-white dark:text-background">
                      <CheckIcon className="size-3" strokeWidth={3} />
                    </span>
                    <span className="font-medium text-muted-foreground line-through decoration-border-strong">{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-auto flex items-center gap-4 pt-8">
              <Penny size={56} className="shrink-0 drop-shadow-[0_4px_8px_rgb(201_138_18/0.3)]" />
              <div className="flex flex-col gap-2">
                <Button variant="outline" asChild className="w-fit">
                  <Link href={`${APP}/signup`}>
                    Sign up for the app
                    <ArrowRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
                <span className="text-[12.5px] text-muted-foreground">Use the email you joined Skool with.</span>
              </div>
            </div>
          </article>
        </div>
      </Container>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------
   Who it's for
   --------------------------------------------------------------------------------------------- */

const WHO: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: SproutIcon, title: "You're starting out", body: "You have a Skool group, or you're about to, and you need your first paying members. Launch Week is built for exactly that." },
  { icon: RocketIcon, title: "You're growing", body: "Members trickle in from posting. You want a steady flow from ads, and Skool's own Growth levels working for you too." },
  { icon: Building2Icon, title: "You run ads for others", body: "You look after Skool communities for clients. The Agency plan lets you resell the app under your own brand." },
];

function WhoFor() {
  return (
    <section id="who" className="scroll-mt-20 border-t border-border/60 py-24 md:py-32">
      <Container>
        <SectionHead
          eyebrow="Who it's for"
          title={
            <>
              Skool owners who&apos;d rather <em className="italic text-primary dark:text-violet-300">run ads than post all day.</em>
            </>
          }
          sub="Total beginners welcome: Penny walks you through every click, and you bring the AI you already use."
        />
        <div className="mt-16 grid gap-4 md:grid-cols-3 lg:gap-5">
          {WHO.map((w, i) => (
            <article key={w.title} className="reveal flex flex-col rounded-3xl bg-card p-7 shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]" style={{ transitionDelay: `${i * 70}ms` }}>
              <span className="grid size-10 place-items-center rounded-2xl bg-accent text-primary ring-1 ring-violet-200/70 dark:text-violet-300 dark:ring-white/[0.06]">
                <w.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-[18px] font-semibold tracking-[-0.015em]">{w.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{w.body}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------
   Features: a bento of real (HTML) product moments
   --------------------------------------------------------------------------------------------- */

function Tile({ className, title, body, icon: Icon, children, delay = 0 }: { className?: string; title: string; body: string; icon: LucideIcon; children: ReactNode; delay?: number }) {
  return (
    <article
      className={cn("reveal group/tile flex flex-col overflow-hidden rounded-3xl bg-card shadow-card ring-1 ring-ink/[0.06] transition-shadow duration-300 hover:shadow-lift dark:ring-white/[0.07]", className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="relative flex min-h-[220px] flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,var(--accent),transparent_75%)] p-6 dark:bg-[radial-gradient(120%_90%_at_50%_0%,rgb(118_85_245/0.12),transparent_75%)]" aria-hidden>
        {children}
      </div>
      <div className="flex flex-col gap-2 border-t border-border/70 p-6 md:p-7">
        <div className="flex items-center gap-2.5">
          <Icon className="size-[18px] text-primary dark:text-violet-300" aria-hidden />
          <h3 className="text-[17px] font-semibold tracking-[-0.015em]">{title}</h3>
        </div>
        <p className="text-[14.5px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </article>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-y border-border/60 bg-[linear-gradient(180deg,var(--background),color-mix(in_oklab,var(--accent)_45%,var(--background))_50%,var(--background))] py-24 md:py-32">
      <Container>
        <SectionHead
          eyebrow="What's inside"
          title={
            <>
              Everything between the ad <em className="italic text-primary dark:text-violet-300">and the member.</em>
            </>
          }
          sub="Seven tools that share one list of leads, so nothing slips through the gaps and you never stitch apps together."
        />

        <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-6 lg:gap-5">
          {/* Landing pages */}
          <Tile
            className="md:col-span-2 lg:col-span-4"
            icon={GlobeIcon}
            title="Landing pages that look expensive"
            body="Answer six questions and AI writes your landing page, free guide, three follow-up emails and the ad copy. Meta Pixel and Conversions API come built in, and one click puts it live."
          >
            <div className="relative w-full max-w-[520px]">
              <div className="overflow-hidden rounded-2xl bg-card shadow-lift ring-1 ring-ink/[0.07] dark:ring-white/[0.08]">
                <div className="flex h-8 items-center gap-1.5 border-b border-border/70 px-3">
                  <span className="size-2 rounded-full bg-mist-300 dark:bg-white/15" />
                  <span className="size-2 rounded-full bg-mist-300 dark:bg-white/15" />
                  <span className="size-2 rounded-full bg-mist-300 dark:bg-white/15" />
                </div>
                <MiniLanding big />
              </div>
              <div className="absolute -right-3 -bottom-4 flex items-center gap-2 rounded-full bg-card py-1.5 pr-3.5 pl-1.5 text-[12px] font-semibold shadow-lift ring-1 ring-ink/[0.07] sm:-right-6 dark:ring-white/[0.08]">
                <span className="grid size-6 place-items-center rounded-full bg-success-soft text-success">
                  <CheckIcon className="size-3.5" strokeWidth={3} />
                </span>
                Published
              </div>
              <div className="absolute -top-4 right-6 hidden items-center gap-1.5 rounded-full bg-card py-1 pr-3 pl-1.5 text-[11.5px] font-medium shadow-lift ring-1 ring-ink/[0.07] sm:flex dark:ring-white/[0.08]">
                <span className="grid size-5 place-items-center rounded-full bg-accent text-primary dark:text-violet-300">
                  <SparklesIcon className="size-3" />
                </span>
                Written by your AI
              </div>
            </div>
          </Tile>

          {/* Leads CRM */}
          <Tile className="lg:col-span-2" icon={UsersIcon} title="A leads CRM that sorts itself" body="Every lead in one list, scored hot, warm or cold, with where they came from, so you always know who to talk to first." delay={60}>
            <div className="flex w-full max-w-[260px] flex-col gap-2">
              {(
                [
                  ["Jamie Doyle", "JD", "hot", "Pain ad"],
                  ["Priya Nair", "PN", "warm", "Dream ad"],
                  ["Sofia Alvarez", "SA", "cold", "Bio link"],
                ] as const
              ).map(([n, i, t, src], k) => (
                <div key={n} className={cn("flex items-center gap-2.5 rounded-xl bg-card px-3 py-2.5 shadow-card ring-1 ring-ink/[0.05] dark:ring-white/[0.07]", k === 0 && "translate-x-2")}>
                  <Avatar initials={i} tone={k} className="size-8 ring-0" />
                  <span className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate text-[12.5px] font-semibold">{n}</span>
                    <span className="truncate text-[10.5px] text-muted-foreground">{src}</span>
                  </span>
                  <TempChip t={t} />
                </div>
              ))}
            </div>
          </Tile>

          {/* Emails */}
          <Tile className="lg:col-span-2" icon={MailIcon} title="Emails that follow up for you" body="A three-email welcome sequence that sends itself, plus campaigns for when you have news worth sharing." delay={0}>
            <div className="relative w-full max-w-[250px]">
              <div className="absolute top-3 bottom-3 left-[15px] w-px bg-[linear-gradient(180deg,var(--violet-300),var(--pink-300))]" />
              {[
                ["Now", "Here's your free guide", true],
                ["Day 2", "The mistake most dads make", true],
                ["Day 4", "Come train with us", false],
              ].map(([d, s, sent]) => (
                <div key={String(d)} className="relative flex items-center gap-3 py-1.5">
                  <span className={cn("z-10 grid size-[31px] shrink-0 place-items-center rounded-full ring-4 ring-card", sent ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground ring-1 ring-border-strong")}>
                    {sent ? <SendIcon className="size-3.5" /> : <ClockIcon className="size-3.5" />}
                  </span>
                  <span className="grid min-w-0 flex-1 rounded-xl bg-card px-3 py-2 leading-tight shadow-card ring-1 ring-ink/[0.05] dark:ring-white/[0.07]">
                    <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{d}</span>
                    <span className="truncate text-[12.5px] font-medium">{s}</span>
                  </span>
                </div>
              ))}
            </div>
          </Tile>

          {/* Automations */}
          <Tile className="lg:col-span-2" icon={WorkflowIcon} title="Automations, minus the wiring" body="When something happens, do the next thing: tag a lead, start an email, move them along. Set it once and let it run." delay={60}>
            <div className="flex w-full max-w-[220px] flex-col items-center">
              {[
                { icon: ZapIcon, label: "When a lead signs up", tone: "bg-cta-soft text-cta-soft-foreground" },
                { icon: TagIcon, label: "Tag “free guide”", tone: "bg-accent text-primary dark:text-violet-300" },
                { icon: MailIcon, label: "Start the welcome emails", tone: "bg-accent text-primary dark:text-violet-300" },
              ].map((n, i) => (
                <div key={n.label} className="flex w-full flex-col items-center">
                  {i > 0 ? <span className="h-4 w-px bg-border-strong" /> : null}
                  <div className="flex w-full items-center gap-2.5 rounded-xl bg-card px-3 py-2.5 shadow-card ring-1 ring-ink/[0.05] dark:ring-white/[0.07]">
                    <span className={cn("grid size-7 place-items-center rounded-lg", n.tone)}>
                      <n.icon className="size-3.5" />
                    </span>
                    <span className="text-[12.5px] font-medium">{n.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </Tile>

          {/* Your AI */}
          <Tile className="md:col-span-2 lg:col-span-2" icon={BotIcon} title="Your AI, your bill" body="Connect the Claude or ChatGPT plan you already pay for, or a free Gemini key. Free plans work, and the AI writes in your voice." delay={120}>
            <div className="flex w-full max-w-[250px] flex-col gap-2.5">
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[12.5px] leading-snug text-primary-foreground shadow-press">Write my Pain ad for busy dads</div>
              <div className="flex items-end gap-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-card shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.08]">
                  <SparklesIcon className="size-3.5 text-primary dark:text-violet-300" />
                </span>
                <div className="rounded-2xl rounded-bl-md bg-card px-3.5 py-2 text-[12.5px] leading-snug shadow-card ring-1 ring-ink/[0.05] dark:ring-white/[0.07]">
                  “Tired of 5am workouts that never stick? Here&apos;s the 20-minute plan…”
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[10.5px] font-semibold">
                {["Claude", "ChatGPT", "Gemini"].map((p) => (
                  <span key={p} className="rounded-full bg-card px-2.5 py-1 shadow-xs ring-1 ring-ink/[0.06] dark:ring-white/[0.08]">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </Tile>

          {/* Penny */}
          <Tile className="lg:col-span-3" icon={RouteIcon} title="Penny, your guide" body="One next step at a time, never a to-do list of forty. Penny ticks steps off as you do them and points at exactly where to click." delay={0}>
            <div className="flex w-full max-w-[400px] items-center gap-5">
              <div className="relative shrink-0">
                <div className="absolute inset-2 rounded-full bg-[radial-gradient(closest-side,rgb(232_179_65/0.35),transparent)] blur-md" />
                <Penny size={128} pose="point" full className="relative" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {[
                  ["Connect your AI", true],
                  ["Run the AI launch kit", true],
                  ["Publish your funnel", false],
                ].map(([t, done], i) => (
                  <div
                    key={String(t)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl bg-card px-3 py-2 text-[12.5px] shadow-card ring-1 ring-ink/[0.05] dark:ring-white/[0.07]",
                      !done && "ring-2 ring-pink-300 dark:ring-pink-400/60",
                    )}
                  >
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold", done ? "bg-success text-white dark:text-background" : "bg-cta text-cta-foreground")}>
                      {done ? <CheckIcon className="size-3" strokeWidth={3} /> : i + 1}
                    </span>
                    <span className={cn("truncate font-medium", done && "text-muted-foreground line-through decoration-border-strong")}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </Tile>

          {/* Ad research */}
          <Tile className="md:col-span-2 lg:col-span-3" icon={SearchIcon} title="Ad research and Ad studio" body="See the angles already working in your niche (one Pain, one Dream, one Lesson to borrow), then Ad studio writes your first 5 static ads in your voice." delay={60}>
            <div className="grid w-full max-w-[420px] grid-cols-3 gap-2.5">
              {[
                ["Pain", "5am. Again?", "Tired of workouts that never stick?", "bg-cta-soft text-cta-soft-foreground", "bg-[linear-gradient(150deg,#2a1640,#8c1f4f)]"],
                ["Dream", "Keep up all summer.", "Picture outrunning your kids.", "bg-accent text-accent-foreground", "bg-[linear-gradient(150deg,#24145f,#5b33e8)]"],
                ["Lesson", "The 20-minute rule.", "What changed my training.", "bg-gold-soft text-gold-foreground", "bg-[linear-gradient(150deg,#3b2a10,#a36d12)]"],
              ].map(([angle, big, hook, tone, art], i) => (
                <div
                  key={angle}
                  className={cn("flex flex-col gap-2 rounded-xl bg-card p-2 shadow-card ring-1 ring-ink/[0.05] dark:ring-white/[0.07]", i === 1 && "-translate-y-2")}
                >
                  <div className={cn("relative flex aspect-[4/5] items-end overflow-hidden rounded-lg p-2.5", art)}>
                    <span className="bg-stars absolute inset-0 text-white/40" />
                    <span className="relative font-display text-[19px] leading-[1] text-white">{big}</span>
                  </div>
                  <span className={cn("w-fit rounded-full px-2 py-0.5 text-[9.5px] font-semibold", tone)}>{angle}</span>
                  <span className="px-0.5 pb-0.5 text-[10.5px] leading-snug text-muted-foreground">{hook}</span>
                </div>
              ))}
            </div>
          </Tile>
        </div>
      </Container>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------
   Pricing
   --------------------------------------------------------------------------------------------- */
function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 py-24 md:py-32">
      <Container>
        <SectionHead
          eyebrow="Pricing"
          title={
            <>
              Start with a free week. <em className="italic text-primary dark:text-violet-300">Stay for $9.</em>
            </>
          }
          sub="$9 a month is the founding price for the first 100 members, and you keep it for as long as you stay. After that, membership is $27 a month. The app is always included."
        />
        <div className="mt-16 grid items-stretch gap-4 lg:grid-cols-3 lg:gap-5">
          {TIERS.map((t, i) => {
            const featured = Boolean(t.featured);
            return (
              <div
                key={t.name}
                className={cn(
                  "reveal relative flex flex-col rounded-3xl bg-card p-7 shadow-card ring-1 ring-ink/[0.06] md:p-8 dark:ring-white/[0.07]",
                  featured && "shadow-lift ring-2 ring-primary/80 lg:-my-3 lg:py-11 dark:ring-violet-400/70",
                )}
                style={{ transitionDelay: `${i * 70}ms` }}
              >
                {featured ? (
                  <div aria-hidden className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(100%_60%_at_50%_0%,var(--accent),transparent)] dark:bg-[radial-gradient(100%_60%_at_50%_0%,rgb(118_85_245/0.14),transparent)]" />
                ) : null}
                {t.badge ? (
                  <span className="absolute top-6 right-6 inline-flex h-6 items-center rounded-full bg-cta-soft px-2.5 text-[11.5px] font-semibold text-cta-soft-foreground ring-1 ring-pink-200 ring-inset md:top-7 md:right-7 dark:ring-pink-400/25">
                    {t.badge}
                  </span>
                ) : null}
                <div className="relative flex flex-1 flex-col">
                  <span className="text-[14px] font-semibold text-foreground/80">{t.name}</span>
                  <span className="mt-4 flex items-baseline gap-1.5">
                    <span className={cn("font-display leading-none tracking-[-0.015em]", t.per ? "text-[56px]" : "text-[40px]")}>{t.price}</span>
                    {t.per ? <span className="text-[15px] font-medium text-muted-foreground">{t.per}</span> : null}
                  </span>
                  <span className="mt-2.5 text-[14.5px] leading-relaxed text-muted-foreground">{t.note}</span>
                  <div className="my-7 h-px bg-border" />
                  <ul className="flex flex-1 flex-col gap-3.5 text-[14.5px]">
                    {t.features.map((f) => (
                      <li key={f} className="flex gap-3">
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-primary dark:text-violet-300">
                          <CheckIcon className="size-3" strokeWidth={3} aria-hidden />
                        </span>
                        <span className="leading-snug">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button variant={t.variant} size="lg" asChild className="mt-8 w-full">
                    <Link href={t.cta.href}>
                      {t.cta.label}
                      <ArrowRightIcon data-icon="inline-end" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="reveal mx-auto mt-10 max-w-[62ch] text-center text-[13.5px] leading-relaxed text-muted-foreground">
          Your membership and free week run on Skool. Upgrading inside the app keeps every page, lead and email exactly as it is.
        </p>
      </Container>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------
   FAQ
   --------------------------------------------------------------------------------------------- */

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-border/60 py-24 md:py-32">
      <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div className="reveal lg:sticky lg:top-28 lg:self-start">
          <span className="eyebrow">Questions</span>
          <h2 className="mt-4 font-display text-[40px] leading-[1.02] font-normal tracking-[-0.015em] md:text-[56px]">
            Good to know <em className="italic text-primary dark:text-violet-300">before you start.</em>
          </h2>
          <p className="mt-5 max-w-[40ch] text-[16px] leading-relaxed text-muted-foreground">
            Anything else? Once you&apos;re inside, Penny answers the &ldquo;what do I do now&rdquo; questions as you go.
          </p>
          <div className="mt-8 hidden items-center gap-3 lg:flex">
            <Penny size={72} full />
            <span className="text-[13.5px] leading-snug text-muted-foreground">
              Hi, I&apos;m Penny.
              <br />I&apos;ll show you every step.
            </span>
          </div>
        </div>
        <div className="reveal flex flex-col">
          {FAQ.map((f, i) => (
            <details key={f.q} className="group/faq border-b border-border py-1 first:border-t" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[17px] font-semibold tracking-[-0.012em] transition-colors hover:text-primary md:text-[18px] dark:hover:text-violet-300 [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-[transform,background-color,color] duration-200 group-open/faq:rotate-180 group-open/faq:bg-accent group-open/faq:text-primary dark:group-open/faq:text-violet-300">
                  <ChevronDownIcon className="size-4" aria-hidden />
                </span>
              </summary>
              <p className="max-w-[62ch] pb-6 text-[15.5px] leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------
   Final call to action + footer
   --------------------------------------------------------------------------------------------- */
function FinalCta({ join }: { join: Cta }) {
  return (
    <section className="pb-24 md:pb-32">
      <Container>
        <div className="reveal relative isolate overflow-hidden rounded-[32px] bg-galaxy px-6 py-16 text-center text-white shadow-float ring-1 ring-white/10 md:px-12 md:py-24">
          <div aria-hidden className="bg-stars pointer-events-none absolute inset-0 -z-10 text-white/55" />
          <div aria-hidden className="pointer-events-none absolute -bottom-64 left-1/2 -z-10 h-[360px] w-[1000px] -translate-x-1/2 rounded-[100%] border-t border-white/20 bg-[radial-gradient(closest-side,rgb(255_133_181/0.22),transparent)] shadow-[0_-20px_60px_-20px_rgb(255_133_181/0.35)]" />
          <div className="mx-auto flex max-w-2xl flex-col items-center">
            <LogoMark className="size-11 rounded-[14px]" />
            <h2 className="mt-7 font-display text-[44px] leading-[1] font-normal tracking-[-0.018em] text-white md:text-[68px]">
              Your first lead could land <em className="italic text-pink-200">this week.</em>
            </h2>
            <p className="mt-5 max-w-[46ch] text-[16px] leading-relaxed text-white/75 md:text-[18px]">
              Start your free week on Skool, then sign up for the app with the same email. Penny takes it from there.
            </p>
            <div className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
              <Button variant="cta" size="xl" asChild className="w-full sm:w-auto">
                <Link href={join.href}>
                  {join.label}
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
              <Button variant="ghost" size="xl" asChild className="w-full text-white/85 hover:bg-white/10 hover:text-white sm:w-auto dark:hover:bg-white/10">
                <Link href={`${APP}/signup`}>Sign up for the app</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function Footer({ name }: { name: string }) {
  const col = "text-foreground/75 hover:text-foreground hover:no-underline";
  return (
    <footer className="border-t border-border/70">
      <Container className="flex flex-col gap-8 py-12 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-xs flex-col gap-3">
          <span className="flex items-center gap-2.5">
            <Wordmark name={name} />
            <span className="text-[12.5px] font-medium text-muted-foreground">by ScaleitAds</span>
          </span>
          <p className="text-[14px] leading-relaxed text-muted-foreground">The Skool Growth Program: The Skool Growth Ladder course and the {name} app, by ScaleitAds.</p>
        </div>
        <div className="flex flex-wrap gap-x-14 gap-y-6 text-[14px]">
          <div className="flex flex-col gap-2.5">
            <span className="text-[11.5px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">Program</span>
            <a href="#program" className={col}>The program</a>
            <a href="#how" className={col}>How it works</a>
            <a href="#pricing" className={col}>Pricing</a>
            <a href={SKOOL_URL} className={col}>Join on Skool</a>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="text-[11.5px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">Account</span>
            <Link href={`${APP}/login`} className={col}>Log in</Link>
            <Link href={`${APP}/signup`} className={col}>Sign up</Link>
            <Link href={`${APP}/app`} className={`inline-flex items-center gap-1.5 ${col}`}>
              <LayoutDashboardIcon className="size-3.5" aria-hidden /> Dashboard
            </Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="text-[11.5px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">ScaleitAds</span>
            <Link href="/" className={col}>Meta ads agency</Link>
            <Link href={`${APP}/legal/privacy`} className={col}>Privacy</Link>
            <Link href={`${APP}/legal/terms`} className={col}>Terms</Link>
          </div>
        </div>
      </Container>
      <Container className="border-t border-border/60 py-6 text-[13px] text-subtle-foreground">
        © {new Date().getFullYear()} ScaleitAds. {name} is made by ScaleitAds for people who&apos;d rather build a community than feed an algorithm.
      </Container>
    </footer>
  );
}
