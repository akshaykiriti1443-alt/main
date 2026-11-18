import type { ComponentType } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  ChartNoAxesColumnIcon,
  CheckIcon,
  CompassIcon,
  DoorOpenIcon,
  EyeIcon,
  GaugeIcon,
  HeartIcon,
  HouseIcon,
  MegaphoneIcon,
  MegaphoneOffIcon,
  MessageCircleHeartIcon,
  ShieldCheckIcon,
  SignpostIcon,
  UserRoundCheckIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WEEK } from "@/lib/week";
import { Tilt } from "./fx/motion";
import { CARD, Container, Em, Pete, SectionHead, type Cta } from "./parts";
import { Browser, MiniLanding } from "./visuals";

// The short /skool page's own sections, in the order a buyer's head works:
//   Pain  -> what growing a Skool group without a following actually feels like
//   Patch -> the Anti-Pete Week: seven days, seven wins
//   Prove -> honest proof (truth rules: no testimonials, no member counts, no invented numbers)
//   Push  -> the price, one button, the questions people ask before pressing it
// Built for skimmers: a headline you can read in a second, a few words, a picture. The long
// version of everything lives on the full tour at /skool/inside. The ads are part of the course's
// story, so this page names them once, plainly, where the money is (the price box and the FAQ).

type Icon = ComponentType<{ className?: string }>;

/* ---------- Pain ---------- */

const PAINS: { title: string; line: string; icon: Icon }[] = [
  { title: "No following to launch to", line: "Every guide says “tell your audience.” What audience?", icon: MegaphoneOffIcon },
  { title: "Posting into the void", line: "Every day, for the same few people. Likes from other Petes.", icon: HeartIcon },
  { title: "An empty room", line: "A stranger finds your group, sees three posts and nobody home, and leaves.", icon: DoorOpenIcon },
  { title: "No idea what's working", line: "No numbers. Just a feeling, and maybe a second ring light.", icon: GaugeIcon },
];

/** Section 2, Pain: what growing a Skool group feels like when you don't have an audience yet. */
export function Pain() {
  return (
    <section id="pain" className="relative scroll-mt-24 pt-24 pb-6 md:pt-36">
      <Container>
        <SectionHead
          align="center"
          eyebrow="Sound familiar?"
          title={
            <>
              You built the group. <Em>Then nobody came.</Em>
            </>
          }
          sub="Building it was the easy part. Filling it without a following is the hard part, and most advice just says: post more."
        />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 md:mt-16 lg:grid-cols-4">
          {PAINS.map((p, i) => (
            <li key={p.title} className={cn(CARD, "reveal flex flex-col gap-4 p-6")} style={{ transitionDelay: `${i * 80}ms` }}>
              <span className="grid size-11 place-items-center rounded-2xl bg-[var(--sk-pink)]/10 text-[var(--sk-pink)] ring-1 ring-[var(--sk-pink)]/25">
                <p.icon className="size-5" aria-hidden />
              </span>
              <span className="font-display text-[22px] leading-[1.1] tracking-[-0.025em] text-white">{p.title}</span>
              <span className="text-[15px] leading-snug text-white/60">{p.line}</span>
            </li>
          ))}
        </ul>

        {/* The turn: it's not you, it's Pete's plan. */}
        <div className="reveal mt-16 flex flex-col items-center gap-6 text-center md:mt-20 md:flex-row md:justify-center md:gap-10 md:text-left">
          <Pete size={150} pose="shrug" className="h-auto w-[120px] shrink-0 drop-shadow-[0_20px_24px_rgb(74_34_207/0.25)] md:w-[150px]" />
          <div className="flex max-w-[30ch] flex-col gap-3">
            <p className="sk-display text-[clamp(32px,4.4vw,54px)] leading-[1.02] text-white">
              It&apos;s not you. <Em>It&apos;s Pete&apos;s plan.</Em>
            </p>
            <p className="text-[16px] leading-snug text-white/60">Post more, hope harder, wait for the algorithm. We were all Pete once. There&apos;s a better plan, and it doesn&apos;t need a following.</p>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ---------- Patch ---------- */

type Win = { day: number; title: string; line: string; icon: Icon };

/**
 * The week as seven wins, short enough to read at a glance. Each title is the app's own day title
 * (src/lib/week.ts, as the full tour uses), so this page can't drift from the course's order.
 */
const dayTitle = (day: number) => WEEK[day - 1].title;
const WINS: Win[] = [
  {
    day: 1,
    title: dayTitle(1),
    line: "Find a reel that already works in your niche, turn it into your first carousel and post it. Then open your own group, and the AI writes your About page and cover.",
    icon: SignpostIcon,
  },
  { day: 2, title: dayTitle(2), line: "Your Facebook Page and Instagram, your website live, your Pixel, five ads live at $10 a day, and this week's posts scheduled.", icon: MegaphoneIcon },
  { day: 3, title: dayTitle(3), line: "Five more ads straight to your Skool link at $5 a day. Then sign up on your own site like a stranger, all the way to Join.", icon: EyeIcon },
  { day: 4, title: dayTitle(4), line: "A welcome post, your first Unlock, one quick-win lesson.", icon: HouseIcon },
  { day: 5, title: dayTitle(5), line: "Your first members probably know your name already.", icon: MessageCircleHeartIcon },
  { day: 6, title: dayTitle(6), line: "What's working, what isn't, or too early to tell.", icon: ChartNoAxesColumnIcon },
  { day: 7, title: dayTitle(7), line: "See where you stand on Skool's levels, then decide.", icon: CompassIcon },
];

function DayTag({ day }: { day: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11.5px] font-bold tracking-[0.16em] text-white/45 uppercase">
      <span className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 font-display text-[12px] tracking-normal text-[#fff] tabular-nums">{day}</span>
      Day {day}
    </span>
  );
}

/** Section 3, Patch: the Anti-Pete Week, as a bento of seven wins. */
export function Wins({ join }: { join: Cta }) {
  const [first, ...rest] = WINS;
  return (
    <section id="wins" className="relative scroll-mt-24 pt-24 pb-10 md:pt-32">
      <Container>
        <SectionHead
          align="center"
          eyebrow="The fix: the Anti-Pete Week"
          title={
            <>
              Seven days. <Em>Seven wins.</Em>
            </>
          }
          sub="One short lesson a day in Skool. The app does most of the work. Every win stays built."
        />

        <ul className="mt-12 grid gap-4 md:mt-16 md:grid-cols-2 lg:grid-cols-4">
          {/* Day 1: the big one, with the picture. */}
          <li className={cn(CARD, "sk-beam reveal flex flex-col gap-5 overflow-hidden p-6 md:col-span-2 md:p-8 lg:row-span-2")}>
            <DayTag day={first.day} />
            <div className="flex flex-col gap-2">
              <span className="sk-display text-[32px] leading-[1.02] text-white md:text-[44px]">{first.title}</span>
              <span className="text-[15.5px] leading-snug text-white/60">{first.line}</span>
            </div>
            <div aria-hidden className="relative mt-auto">
              <Tilt max={5} className="rounded-2xl">
                <Browser url="fitdadsclub.com" className="w-[92%]">
                  <MiniLanding big />
                </Browser>
              </Tilt>
              <span className="absolute right-0 bottom-6 inline-flex items-center gap-1.5 rounded-full bg-[var(--card)] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-[0_14px_30px_-14px_rgb(74_34_207/0.6)] ring-1 ring-white/10">
                <CheckIcon className="size-3.5 text-[var(--sk-mint)]" strokeWidth={3} /> Published
              </span>
            </div>
          </li>

          {rest.map((w, i) => (
            <li key={w.day} className={cn(CARD, "reveal flex flex-col gap-4 p-6", w.day === 7 && "lg:col-span-3")} style={{ transitionDelay: `${(i % 4) * 70}ms` }}>
              <span className="flex items-center justify-between">
                <DayTag day={w.day} />
                <w.icon className="size-5 text-[var(--sk-lilac)]" aria-hidden />
              </span>
              <span className="font-display text-[23px] leading-[1.08] tracking-[-0.025em] text-white">{w.title}</span>
              <span className="mt-auto text-[14.5px] leading-snug text-white/55">{w.line}</span>
            </li>
          ))}
        </ul>

        <div className="reveal mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link href={join.href} className="sk-cta group w-full sm:w-auto">
            <span className="relative">{join.label}</span>
            <ArrowRightIcon className="relative size-4.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <Link href="/skool/inside#week" className="text-[15px] font-semibold">
            See every day in detail
          </Link>
        </div>
      </Container>
    </section>
  );
}

/* ---------- Prove ---------- */

const PROOF: { title: string; line: string; icon: Icon }[] = [
  { title: "Built by people who do this for a living", line: "ScaleitAds is a Meta ads agency run by Akshay Kolluru. This is how the agency finds strangers for a business, made small enough for your group.", icon: BadgeCheckIcon },
  { title: "A real person checks your work", line: "Post each day's work in the group and Akshay audits it personally. Not a bot, not a template.", icon: UserRoundCheckIcon },
  { title: "Your own numbers, not ours", line: "No screenshots of someone else's results. On Day 6 the app reads your numbers in plain words. On Day 7 you see where you stand on Skool's levels.", icon: ChartNoAxesColumnIcon },
  { title: "Try the whole thing first", line: "Seven days free, app included. Day 7 helps you decide, and cancelling is a fine answer.", icon: ShieldCheckIcon },
];

/** Section 4, Prove: honest proof. No testimonials, no member counts, no invented numbers. */
export function Proof() {
  return (
    <section id="proof" className="relative scroll-mt-24 pt-24 md:pt-32">
      <Container>
        <SectionHead
          align="center"
          eyebrow="Why you can trust it"
          title={
            <>
              No made-up reviews. <Em>Just the real thing.</Em>
            </>
          }
          sub="We're new, so we won't invent a wall of happy faces. Here's who's behind it, who checks your work, and how you'll know for yourself."
        />
        <ul className="mt-12 grid gap-4 md:mt-16 md:grid-cols-2">
          {PROOF.map((p, i) => (
            <li key={p.title} className={cn(CARD, "reveal flex items-start gap-5 p-6 md:p-8", i === 1 && "sk-beam")} style={{ transitionDelay: `${(i % 2) * 90}ms` }}>
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--sk-mint)]/12 text-[var(--sk-mint)] ring-1 ring-[var(--sk-mint)]/30">
                <p.icon className="size-5.5" aria-hidden />
              </span>
              <span className="flex flex-col gap-2">
                <span className="font-display text-[23px] leading-[1.1] tracking-[-0.025em] text-white">{p.title}</span>
                <span className="text-[15px] leading-snug text-white/60">{p.line}</span>
              </span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/* ---------- Push / Pay ---------- */

/** Section 6, Push: the price on one card, with the one honest line about ad money. */
export function Price({ join, membership, autoBill }: { join: Cta; membership: string; autoBill: string }) {
  return (
    <section id="cost" className="relative scroll-mt-24 py-24 md:py-32">
      <Container>
        <SectionHead
          align="center"
          eyebrow="What it costs"
          title={
            <>
              Free for a week. <Em>Then $9.</Em>
            </>
          }
        />
        <div className={cn(CARD, "sk-beam reveal mx-auto mt-12 flex max-w-3xl flex-col gap-6 p-7 md:mt-16 md:p-10")}>
          <span className="text-[12px] font-bold tracking-[0.16em] text-white/45 uppercase">{membership}</span>
          <div className="flex items-end gap-3">
            <span className="sk-display text-[88px] leading-[0.85] text-white md:text-[120px]">$0</span>
            <span className="pb-2 text-[18px] font-semibold text-white/70 md:pb-3">for 7 days</span>
          </div>
          <ul className="flex flex-col gap-3 text-[16px]">
            <li className="flex items-start gap-3">
              <CheckIcon className="mt-1 size-4 shrink-0 text-[var(--sk-mint)]" strokeWidth={3} aria-hidden />
              <span className="text-white/75">
                <b className="font-semibold text-white">Then $9 a month</b> for the first 100 founding members, kept for as long as you stay. $27 a month once those seats are gone.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <CheckIcon className="mt-1 size-4 shrink-0 text-[var(--sk-mint)]" strokeWidth={3} aria-hidden />
              <span className="text-white/75">{autoBill} Day 7 helps you decide, and cancelling is a fine answer.</span>
            </li>
          </ul>
          <p className="rounded-2xl bg-white/[0.04] px-4 py-3.5 text-[14.5px] leading-snug text-white/65 ring-1 ring-white/[0.08]">
            <b className="font-semibold text-white">Good to know:</b> the course has you test a few small ads, about $15 a day on your own card, paid to Meta and never to us. You can switch them off any time. Your AI is free with a Gemini key.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={join.href} className="sk-cta group w-full sm:w-auto">
              <span className="relative">{join.label}</span>
              <ArrowRightIcon className="relative size-4.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link href="/skool/inside#cost" className="text-center text-[14.5px] font-semibold sm:ml-3">
              See the full price list
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}

/** A quiet door to the long version, for the few who want every detail. */
export function TourLink() {
  return (
    <Container className="pb-8">
      <Link
        href="/skool/inside"
        data-slot="tour"
        className={cn(CARD, "reveal group flex flex-col items-start gap-4 p-6 hover:no-underline sm:flex-row sm:items-center sm:justify-between md:p-8")}
      >
        <span className="flex flex-col gap-1">
          <span className="font-display text-[24px] leading-tight text-white md:text-[28px]">Want every detail?</span>
          <span className="text-[15px] text-white/55">Every day in full, the One-Before-You Rule, a tour of the app and ReelVault.</span>
        </span>
        <span className="sk-ghost shrink-0">
          Everything inside
          <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </Link>
    </Container>
  );
}
