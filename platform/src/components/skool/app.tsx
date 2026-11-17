import Link from "next/link";
import {
  ArrowRightIcon,
  BotIcon,
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
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ACCENT, CARD, Container, Em, MenuChip, Penny, SectionHead, WELL } from "./parts";
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
  { title: "Penny points at the button", body: "Penny is the gold coin in the corner. She shows you where to click, and she goes quiet when you ask her to." },
];

/** Your part and the app's part, job by job, in the order the week meets them. */
const JOBS: { you: string; app: string; where: string[] }[] = [
  { you: "Answer a few questions about your group.", app: "Writes your website, your free checklist, your follow-up emails and your Skool About page.", where: ["AI launch kit"] },
  { you: "Read it, change what doesn't sound like you, press publish.", app: "Puts your website online. Nothing to install and nowhere else to host it.", where: ["Funnels & pages"] },
  { you: "Paste in your Meta Pixel ID.", app: "Tells Meta about every sign-up, so Meta can go and find more people like them.", where: ["Settings"] },
  { you: "Pick a few ads that have run a long time in your niche.", app: "Reads them and tells you what is working, and the gaps nobody is using yet.", where: ["Ad research"] },
  { you: "Press one button, then make the pictures it describes.", app: "Writes five different ads, and the exact clicks to launch them in Meta.", where: ["Ad studio"] },
  { you: "Nothing. Go and have lunch.", app: "Keeps every sign-up in one list and sends each one your follow-up emails.", where: ["Leads", "Emails"] },
  { you: "Copy a few numbers per ad out of Meta.", app: "Says in plain words what to do with each ad, including when it's too early to tell.", where: ["Ad review"] },
  { you: "Copy four numbers out of Skool.", app: "Shows where you stand on Skool's Growth levels, and what gets you to the next one.", where: ["Growth ladder"] },
];

export function AppSection({ name, signupHref, reelVault }: { name: string; signupHref: string; reelVault: boolean }) {
  return (
    <section id="app" className="scroll-mt-20 border-t border-border/60 py-24 md:py-32">
      <Container>
        <SectionHead
          eyebrow={`The app · ${name}, included`}
          title={
            <>
              The lesson says what. <Em>The app does it.</Em>
            </>
          }
          sub="The course never asks you to go and work something out on your own. Each day's job has a place in the app, and the app does the heavy part: the writing, the building and the sums."
        />

        <div className="mt-14 grid items-start gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <AppWindow reelVault={reelVault} />

          <div className="reveal [transition-delay:80ms]">
            <ol className="flex flex-col">
              {PROMISES.map((p, i) => (
                <li key={p.title} className="flex gap-5 border-t border-border py-6 last:border-b">
                  <span className={cn("w-8 shrink-0 font-display text-[40px] leading-[0.9] tabular-nums", ACCENT)}>{i + 1}</span>
                  <div>
                    <h3 className="text-[18px] font-semibold tracking-[-0.015em]">{p.title}</h3>
                    <p className="mt-1.5 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">{p.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex items-center gap-4">
              <Penny size={64} pose="point" className="shrink-0 drop-shadow-[0_4px_8px_rgb(201_138_18/0.3)]" />
              <div className="flex flex-col gap-2">
                <Button variant="outline" asChild className="w-fit">
                  <Link href={signupHref}>
                    Sign up for the app
                    <ArrowRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
                <span className="text-[13px] leading-snug text-muted-foreground">Use the email you joined Skool with. Your account turns on by itself, no codes to copy.</span>
              </div>
            </div>
          </div>
        </div>

        <Ledger />
      </Container>
    </section>
  );
}

/** The app, drawn small: the real menu on the left, the one next step on the right. */
function AppWindow({ reelVault }: { reelVault: boolean }) {
  const menu = MENU.filter((m) => reelVault || m.label !== "ReelVault");
  return (
    <figure className="reveal relative">
      <div aria-hidden className="absolute inset-x-[8%] top-[20%] -bottom-8 -z-10 rounded-[48px] bg-[radial-gradient(closest-side,var(--glow-violet),transparent)] blur-2xl" />
      <div className={cn(CARD, "overflow-hidden shadow-float")} aria-hidden>
        <div className="flex h-11 items-center gap-2 border-b border-border/70 bg-background/60 px-4">
          <span className="size-2.5 rounded-full bg-mist-300 dark:bg-white/15" />
          <span className="size-2.5 rounded-full bg-mist-300 dark:bg-white/15" />
          <span className="size-2.5 rounded-full bg-mist-300 dark:bg-white/15" />
          <span className="mx-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[11.5px] text-muted-foreground">
            <LockIcon className="size-3" /> Fit Dads Club · Your path
          </span>
        </div>

        <div className="grid text-left md:grid-cols-[196px_1fr]">
          <aside className="hidden border-r border-border/70 bg-sidebar p-3 md:block">
            <div className="mb-2 flex items-center gap-2.5 rounded-xl px-2 py-1.5">
              <span className="brand-mark size-7 text-[10px]">FD</span>
              <span className="text-[13px] font-semibold">Fit Dads Club</span>
            </div>
            <ul className="flex flex-col gap-px">
              {menu.map((m) => {
                const active = m.label === "Your path";
                return (
                  <li
                    key={m.label}
                    className={cn(
                      "flex h-[30px] items-center gap-2.5 rounded-[9px] px-2.5 text-[12.5px] font-medium text-sidebar-foreground",
                      m.gap && "mt-2.5",
                      active && "bg-sidebar-active text-foreground shadow-[0_1px_2px_rgb(28_21_56/0.06),0_0_0_1px_rgb(28_21_56/0.05)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]",
                    )}
                  >
                    <m.icon className={cn("size-[15px] text-sidebar-foreground/55", active && ACCENT)} />
                    {m.label}
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className={cn(WELL, "flex min-w-0 flex-col gap-2.5 p-4 ring-0 md:p-6")}>
            <div className="mb-1 flex items-baseline justify-between gap-3 px-1">
              <span className="font-display text-[28px] leading-none tracking-[-0.01em]">Day 1</span>
              <span className="text-[12px] text-muted-foreground">Your website, Pixel and five ads</span>
            </div>
            <UpNext day={1} title="Put your website live" body="It's written. Change three lines so it sounds like you, then press publish." />
            <StepRow state="done">Get your free Gemini key</StepRow>
            <StepRow state="done">Build your launch kit</StepRow>
            <StepRow state="now">Put your website live</StepRow>
            <StepRow state="later">Open your own Skool group</StepRow>
            <StepRow state="later">Connect your Meta Pixel</StepRow>
            <StepRow state="later">Make your first five ads</StepRow>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-[12.5px] leading-snug text-muted-foreground">A sketch of the idea, not a screenshot. Fit Dads Club is made up, and your group goes in its place.</figcaption>
    </figure>
  );
}

function Ledger() {
  const label = "text-[11.5px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase";
  const cols = "md:grid md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.25fr)_190px] md:gap-x-10";
  return (
    <div className="reveal mt-20 md:mt-28">
      <h3 className="font-display text-[32px] leading-[1.04] font-normal tracking-[-0.012em] md:text-[42px]">Who does what</h3>
      <p className="mt-3 max-w-[58ch] text-[16px] leading-relaxed text-muted-foreground">Your column is short on purpose. The names on the right are the exact names in the app&apos;s menu, so you can find each one without a map.</p>

      <div className={cn(CARD, "mt-9 overflow-hidden")}>
        <div className={cn(cols, "hidden border-b border-border bg-muted/50 px-8 py-3.5", label)} aria-hidden>
          <span>You</span>
          <span>The app</span>
          <span>In the menu</span>
        </div>
        <ol>
          {JOBS.map((j) => (
            <li key={j.app} className={cn(cols, "flex flex-col gap-3 border-b border-border/80 px-5 py-5 last:border-0 md:items-baseline md:px-8")}>
              <p className="text-[15px] leading-snug text-muted-foreground">
                <span className={cn(label, "mb-1 block md:hidden")}>You</span>
                {j.you}
              </p>
              <p className="text-[15.5px] leading-snug font-medium text-foreground">
                <span className={cn(label, "mb-1 block font-semibold md:hidden")}>The app</span>
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
      </div>
    </div>
  );
}
