import Link from "next/link";
import {
  ArrowRightIcon,
  BotIcon,
  CheckIcon,
  ClapperboardIcon,
  GiftIcon,
  GlobeIcon,
  LayoutDashboardIcon,
  LockIcon,
  MailIcon,
  MegaphoneIcon,
  PaletteIcon,
  RouteIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  TrendingUpIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Parallax, Tilt } from "./fx/motion";
import { CARD, Container, Em, MenuChip, MINI, Penny, SectionHead } from "./parts";
import { StepRow, UpNext } from "./visuals";

// What the app does for a member. Every menu name here is spelled the way the app's menu spells it
// (src/app/app/w/[wid]/layout.tsx), because the lessons quote those names. Keep them in step.

const MENU: { icon: LucideIcon; label: string; gap?: boolean }[] = [
  { icon: LayoutDashboardIcon, label: "Dashboard" },
  { icon: RouteIcon, label: "Your path" },
  { icon: BotIcon, label: "Your AI", gap: true },
  { icon: SparklesIcon, label: "AI launch kit" },
  { icon: GlobeIcon, label: "Funnels & pages" },
  { icon: SearchIcon, label: "Ad research", gap: true },
  { icon: ClapperboardIcon, label: "ReelVault" },
  { icon: PaletteIcon, label: "Ad studio" },
  { icon: MegaphoneIcon, label: "Ad review" },
  { icon: TrendingUpIcon, label: "Growth ladder" },
  { icon: UsersIcon, label: "Leads" },
  { icon: GiftIcon, label: "Unlocks", gap: true },
  { icon: MailIcon, label: "Emails" },
  { icon: SettingsIcon, label: "Settings", gap: true },
];

const PROMISES: { title: string; body: string }[] = [
  { title: "One next step, always", body: "Open the app and the first thing you see is the one job to do now, in the same words as today's lesson. Not a wall of tiles to decode." },
  { title: "Same names as the course", body: "When a lesson says “open Ad studio”, there is a thing in the menu called Ad studio. It sounds obvious. You'd be surprised." },
  { title: "Penny points at the button", body: "Penny is the AI guide in the corner. She shows you where to click, and she goes quiet when you ask her to." },
];

/** Your part and the app's part, job by job, in the order the week meets them. */
const JOBS: { you: string; app: string; where: string[]; lunch?: boolean }[] = [
  { you: "Answer a few questions about your group.", app: "Writes your website, your free checklist, your follow-up emails and your Skool About page.", where: ["AI launch kit"] },
  { you: "Read it, change what doesn't sound like you, press publish.", app: "Puts your website online. Nothing to install and nowhere else to host it.", where: ["Funnels & pages"] },
  { you: "Paste in your Meta Pixel ID.", app: "Tells Meta about every sign-up, so Meta can go and find more people like them.", where: ["Settings"] },
  { you: "Pick a few ads that have run a long time in your niche.", app: "Reads them and tells you what is working, and the gaps nobody is using yet.", where: ["Ad research"] },
  { you: "Press one button, then make the pictures it describes.", app: "Writes five different ads, and the exact clicks to launch them in Meta.", where: ["Ad studio"] },
  { you: "Nothing. Go and have lunch.", app: "Keeps every sign-up in one list and sends each one your follow-up emails.", where: ["Leads", "Emails"], lunch: true },
  { you: "Copy a few numbers per ad out of Meta.", app: "Says in plain words what to do with each ad, including when it's too early to tell.", where: ["Ad review"] },
  { you: "Copy four numbers out of Skool.", app: "Shows where you stand on Skool's Growth levels, and what gets you to the next one.", where: ["Growth ladder"] },
];

export function AppSection({ name, signupHref, reelVault }: { name: string; signupHref: string; reelVault: boolean }) {
  return (
    <section id="app" className="relative scroll-mt-20 border-t border-white/[0.06] py-24 md:py-36">
      <div aria-hidden className="sk-gridlines pointer-events-none absolute inset-x-0 top-0 h-[720px] opacity-60" />
      <Container className="relative">
        <SectionHead
          align="center"
          eyebrow={`The app · ${name}, included`}
          title={
            <>
              The lesson says what. <Em>The app does it.</Em>
            </>
          }
          sub="The course never asks you to go and work something out on your own. Each day's job has a place in the app, and the app does the heavy part: the writing, the building and the sums."
        />

        <AppWindow reelVault={reelVault} />

        <ol className="mt-16 grid gap-4 md:mt-20 md:grid-cols-3 md:gap-5">
          {PROMISES.map((p, i) => (
            <li key={p.title} className={cn(CARD, "reveal flex flex-col p-6 md:p-7")} style={{ transitionDelay: `${i * 80}ms` }}>
              <span className="sk-grad font-display text-[44px] leading-[0.9] font-semibold tracking-[-0.04em] tabular-nums">0{i + 1}</span>
              <h3 className="mt-5 text-[19px] font-semibold tracking-[-0.02em] text-white">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-white/60">{p.body}</p>
            </li>
          ))}
        </ol>

        <div className="reveal mt-10 flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-center sm:text-left">
          <Penny size={64} pose="point" className="shrink-0 drop-shadow-[0_8px_20px_rgb(124_92_255/0.35)]" />
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <Link href={signupHref} className="sk-ghost">
              Sign up for the app
              <ArrowRightIcon className="size-4" aria-hidden />
            </Link>
            <span className="max-w-[44ch] text-[13px] leading-snug text-white/50">Use the email you joined Skool with. Your account turns on by itself, no codes to copy.</span>
          </div>
        </div>

        <Ledger />
      </Container>
    </section>
  );
}

/** A small floating status card around the app picture. Decorative: the section's words say the same. */
function FloatChip({ className, speed, children }: { className: string; speed: number; children: ReactNode }) {
  return (
    <Parallax speed={speed} className={cn("pointer-events-none absolute z-10", className)}>
      <div className="sk-glass flex items-center gap-2.5 rounded-2xl py-2 pr-3.5 pl-2 text-[12px] font-semibold whitespace-nowrap text-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9),0_0_40px_-18px_rgb(124_92_255/0.8)]">
        {children}
      </div>
    </Parallax>
  );
}

function Done() {
  return (
    <span className="grid size-6 place-items-center rounded-full bg-[var(--sk-mint)]/15 text-[var(--sk-mint)] ring-1 ring-[var(--sk-mint)]/30">
      <CheckIcon className="size-3.5" strokeWidth={3} />
    </span>
  );
}

/** The app, drawn as a floating device: the real menu on the left, the one next step on the right. */
function AppWindow({ reelVault }: { reelVault: boolean }) {
  const menu = MENU.filter((m) => reelVault || m.label !== "ReelVault");
  return (
    <figure className="mx-auto mt-14 max-w-[1060px] md:mt-20">
      <div aria-hidden className="relative">
        {/* The glow the device floats on, and a faint floor line. */}
        <div className="pointer-events-none absolute inset-x-[6%] -bottom-14 h-40 rounded-[50%] bg-[radial-gradient(closest-side,rgb(124_92_255/0.6),rgb(255_111_174/0.18)_60%,transparent)] blur-2xl" />
        <div className="pointer-events-none absolute inset-x-[12%] -bottom-8 h-px bg-[linear-gradient(90deg,transparent,rgb(201_184_255/0.6),transparent)]" />

        <FloatChip speed={0.9} className="-top-5 left-2 md:top-[14%] md:-left-4 xl:-left-10">
          <Done /> Website published
        </FloatChip>
        <FloatChip speed={1.3} className="top-[36%] -right-12 hidden xl:block">
          <span className="size-2.5 rounded-full bg-[var(--sk-mint)] shadow-[0_0_10px_#6ff2c4]" /> Meta Pixel connected
        </FloatChip>
        <FloatChip speed={0.7} className="-bottom-6 right-2 md:right-[8%] md:-bottom-8">
          <span className="flex -space-x-1.5">
            {["bg-[linear-gradient(150deg,#1a0e4a,#5b33e8)]", "bg-[linear-gradient(160deg,#2a0f45,#c23f8c)]", "bg-[linear-gradient(150deg,#4a22cf,#ff6fae)]"].map((bg) => (
              <span key={bg} className={cn("size-6 rounded-md ring-2 ring-[var(--card)]", bg)} />
            ))}
          </span>
          Five ads written
        </FloatChip>
        <FloatChip speed={1.1} className="bottom-[22%] -left-14 hidden xl:block">
          <Penny size={28} pose="point" className="-my-1" /> Click here next
        </FloatChip>

        <Tilt max={5} className="rounded-[26px]">
          <div className="overflow-hidden rounded-[26px] bg-[var(--sk-frame)] shadow-[0_60px_140px_-50px_rgb(0_0_0/1),0_0_100px_-40px_rgb(124_92_255/0.9),inset_0_0_0_1px_rgb(255_255_255/0.1),inset_0_1px_0_rgb(255_255_255/0.16)] backdrop-blur-xl">
            <div className="flex h-11 items-center gap-2 border-b border-white/[0.07] bg-white/[0.025] px-4">
              <span className="size-2.5 rounded-full bg-[var(--sk-pink)]/70" />
              <span className="size-2.5 rounded-full bg-[var(--sk-gold)]/70" />
              <span className="size-2.5 rounded-full bg-[var(--sk-mint)]/70" />
              <span className="mx-auto flex min-w-0 items-center gap-1.5 truncate rounded-full bg-white/[0.05] px-3 py-1 text-[11.5px] text-white/50 ring-1 ring-white/[0.06]">
                <LockIcon className="size-3 shrink-0" /> <span className="truncate">Fit Dads Club · Your path</span>
              </span>
              <span className="hidden w-[52px] sm:block" />
            </div>

            <div className="grid text-left md:grid-cols-[200px_1fr]">
              <aside className="hidden border-r border-white/[0.06] bg-white/[0.015] p-3 md:block">
                <div className="mb-2 flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                  <span className="brand-mark size-7 text-[10px]">FD</span>
                  <span className="text-[13px] font-semibold text-white">Fit Dads Club</span>
                </div>
                <ul className="flex flex-col gap-px">
                  {menu.map((m) => {
                    const active = m.label === "Your path";
                    return (
                      <li
                        key={m.label}
                        className={cn(
                          "relative flex h-[30px] items-center gap-2.5 rounded-[9px] px-2.5 text-[12.5px] font-medium text-white/50",
                          m.gap && "mt-2.5",
                          active && "bg-white/[0.07] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]",
                        )}
                      >
                        {active ? <span className="absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-r-full bg-[linear-gradient(180deg,#c9b8ff,#ff6fae)] shadow-[0_0_10px_#a58bff]" /> : null}
                        <m.icon className={cn("size-[15px] text-white/35", active && "text-[var(--sk-lilac)]")} />
                        {m.label}
                      </li>
                    );
                  })}
                </ul>
              </aside>

              <div className="flex min-w-0 flex-col gap-4 bg-[radial-gradient(120%_90%_at_70%_0%,rgb(124_92_255/0.16),transparent_60%)] p-4 md:p-7">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
                  <span className="font-display text-[30px] leading-none font-semibold tracking-[-0.04em] text-white md:text-[36px]">Day 1</span>
                  <span className="text-[12px] text-white/45">Your website, Pixel and five ads</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-[1.05fr_1fr] lg:gap-4">
                  <UpNext day={1} title="Put your website live" body="It's written. Change three lines so it sounds like you, then press publish." />
                  <div className="flex flex-col gap-2">
                    <StepRow state="done">Get your free Gemini key</StepRow>
                    <StepRow state="done">Build your launch kit</StepRow>
                    <StepRow state="now">Put your website live</StepRow>
                    <StepRow state="later">Open your own Skool group</StepRow>
                    <StepRow state="later">Connect your Meta Pixel</StepRow>
                    <StepRow state="later">Make your first five ads</StepRow>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Tilt>
      </div>
      <figcaption className="mt-16 text-center text-[12.5px] leading-snug text-white/45">A sketch of the idea, not a screenshot. Fit Dads Club is made up, and your group goes in its place.</figcaption>
    </figure>
  );
}

function Ledger() {
  const label = "text-[11px] font-bold tracking-[0.16em] uppercase";
  const cols = "md:grid md:grid-cols-[44px_minmax(0,0.85fr)_minmax(0,1.25fr)_190px] md:gap-x-8";
  return (
    <div className="mt-24 md:mt-32">
      <div className="reveal flex flex-col items-center text-center">
        <span className="sk-eyebrow">Who does what</span>
        <h3 className="sk-display mt-4 text-[38px] text-white md:text-[56px]">
          Your column is <span className="sk-grad">short on purpose.</span>
        </h3>
        <p className="mt-4 max-w-[56ch] text-[16px] leading-relaxed text-white/60">The names on the right are the exact names in the app&apos;s menu, so you can find each one without a map.</p>
      </div>

      <div className={cn(CARD, "reveal mt-10 overflow-hidden md:mt-12")}>
        <div className={cn(cols, "hidden border-b border-white/[0.08] bg-white/[0.03] px-8 py-4 text-white/45", label)} aria-hidden>
          <span />
          <span>You</span>
          <span className="text-[var(--sk-lilac)]">The app</span>
          <span>In the menu</span>
        </div>
        <ol>
          {JOBS.map((j, i) => (
            <li
              key={j.app}
              className={cn(cols, "group relative flex flex-col gap-3 border-b border-white/[0.06] px-5 py-5 transition-colors duration-300 last:border-0 hover:bg-white/[0.03] md:items-baseline md:px-8 md:py-6")}
            >
              <span className="hidden font-display text-[15px] font-semibold text-white/25 tabular-nums transition-colors group-hover:text-[var(--sk-lilac)] md:block">{String(i + 1).padStart(2, "0")}</span>
              <p className={cn("text-[15px] leading-snug", j.lunch ? "font-semibold text-white" : "text-white/55")}>
                <span className={cn(label, "mb-1.5 block text-white/35 md:hidden")}>You</span>
                {j.lunch ? <span className="sk-grad">{j.you}</span> : j.you}
              </p>
              <p className="text-[15.5px] leading-snug font-medium text-white">
                <span className={cn(label, "mb-1.5 block text-[var(--sk-lilac)] md:hidden")}>The app</span>
                {j.app}
              </p>
              <p className="flex flex-wrap gap-1.5">
                {j.where.map((w) => (
                  <MenuChip key={w}>{w}</MenuChip>
                ))}
              </p>
            </li>
          ))}
        </ol>
        <div className={cn(MINI, "m-4 flex items-center gap-3 rounded-2xl px-4 py-3 text-[13.5px] text-white/60 md:m-6")}>
          <Penny size={32} pose="wink" className="shrink-0" />
          <span>
            Count the words in your column, then in the app&apos;s. <span className="text-white">That&apos;s the deal.</span>
          </span>
        </div>
      </div>
    </div>
  );
}
