import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, BookOpenIcon, CheckIcon, MessageSquareTextIcon, MousePointerClickIcon, SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/shell";
import { Hero3D } from "./fx/hero-3d";
import { ACCENT, CARD, Container, MINI, Pete, type Cta } from "./parts";
import { StepRow, TextBars, UpNext } from "./visuals";

/** The three parts of one membership: the nutshell, right under the 3D week. */
export type Part = { name: string; what: string; body: string };

const PART_ICONS = [BookOpenIcon, MousePointerClickIcon, SparklesIcon];

/**
 * The first screen. One promise, one button, the 3D week, and the whole offer in one line of
 * three parts. Everything a skimmer needs is here; everything else is further down or on the tour.
 */
export function Hero({ join, signupHref, parts }: { join: Cta; signupHref: string; parts: Part[] }) {
  return (
    <section className="relative isolate">
      <div className="relative overflow-hidden pt-10 md:pt-16">
        {/* Faint grid, a violet dawn at the top, and the 3D week turning below the words. */}
        <div aria-hidden className="sk-gridlines pointer-events-none absolute inset-0 -z-20 opacity-70" />
        <div aria-hidden className="pointer-events-none absolute top-[-320px] left-1/2 -z-20 h-[760px] w-[1400px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(124_92_255/0.26),transparent)] dark:bg-[radial-gradient(closest-side,rgb(124_92_255/0.38),transparent)]" />
        <div aria-hidden className="pointer-events-none absolute right-0 bottom-[6%] left-0 -z-20 mx-auto h-[520px] w-[min(980px,100%)] rounded-full bg-[radial-gradient(closest-side,rgb(124_92_255/0.22),rgb(255_111_174/0.08)_60%,transparent)] blur-2xl dark:bg-[radial-gradient(closest-side,rgb(124_92_255/0.35),rgb(255_111_174/0.08)_60%,transparent)]" />

        <Container className="flex flex-col items-center text-center">
          <span className="reveal sk-glass inline-flex items-center gap-2.5 rounded-full! py-1.5 pr-4 pl-1.5 text-[13px] font-semibold text-white/80">
            <span className="relative grid size-6 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-[#fff]">
              <SparklesIcon className="size-3.5" aria-hidden />
              <span className="absolute inset-0 animate-ping rounded-full bg-violet-400/40 [animation-duration:2.4s] motion-reduce:hidden" />
            </span>
            The Anti-Pete Week · free for 7 days on Skool
          </span>

          <h1 className="reveal sk-display mt-6 max-w-[15ch] text-[48px] text-white [transition-delay:80ms] sm:text-[72px] lg:text-[96px]">
            Grow your Skool community <span className="sk-grad-anim">without a following.</span>
          </h1>

          <p className="reveal mt-6 max-w-[46ch] text-[17px] leading-relaxed text-pretty text-white/65 [transition-delay:160ms] md:text-[20px]">
            No followers? Good, you won&apos;t need them. In 7 days you build <b className="font-semibold text-white">a simple system that puts your group in front of people who&apos;ve never heard of you.</b> The app does most of the work.
          </p>

          <div className="reveal mt-8 flex w-full flex-col items-center justify-center gap-3 [transition-delay:240ms] sm:w-auto sm:flex-row">
            <Link href={join.href} className="sk-cta group w-full sm:w-auto">
              <span className="relative">{join.label}</span>
              <ArrowRightIcon className="relative size-4.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <a href="#wins" className="sk-ghost w-full sm:w-auto">
              See the 7 wins
            </a>
          </div>

          <ul className="reveal mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13.5px] font-medium text-white/55 [transition-delay:300ms]">
            {["$0 for 7 days", "No following needed", "Cancel any time on Skool"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <CheckIcon className="size-3.5 text-[var(--sk-mint)]" strokeWidth={3} aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </Container>

        {/* The stage: the 3D week turning around the app, below the words. */}
        <div className="relative -mt-4 h-[340px] sm:h-[440px] md:-mt-8 md:h-[540px]">
          <Hero3D className="absolute inset-0" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-[var(--background)]" />
        </div>
      </div>

      {/* The nutshell: one membership, three parts. */}
      <Container className="relative z-[1] -mt-4 md:-mt-8">
        <div className="reveal flex flex-col items-center gap-4">
          <span className="text-[12px] font-bold tracking-[0.2em] text-white/45 uppercase">One membership. Three parts.</span>
          <ul className="grid w-full gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch md:gap-2">
            {parts.map((p, i) => {
              const Icon = PART_ICONS[i] ?? SparklesIcon;
              return (
                <Fragment key={p.name}>
                  {i > 0 ? (
                    <li aria-hidden className="hidden place-items-center font-display text-[26px] text-white/30 md:grid">
                      +
                    </li>
                  ) : null}
                  <li className={cn(CARD, "flex items-center gap-4 p-4 text-left md:p-5", i === 1 && "sk-beam")}>
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-[#fff] shadow-[0_10px_24px_-10px_rgb(124_92_255/0.9)]">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[11px] font-bold tracking-[0.16em] text-white/45 uppercase">{p.what}</span>
                      <span className="font-display text-[21px] leading-tight text-white">{p.name}</span>
                      <span className="text-[14px] leading-snug text-white/60">{p.body}</span>
                    </span>
                  </li>
                </Fragment>
              );
            })}
          </ul>
          <p className="text-[13.5px] text-white/50">
            Already a member? <Link href={signupHref}>Sign up for the app</Link> with your Skool email.
          </p>
        </div>
      </Container>
    </section>
  );
}

function Step({ n, verb, where, note, children, delay }: { n: number; verb: string; where: string; note: string; children: ReactNode; delay: number }) {
  return (
    <li className="reveal flex min-w-0 flex-col gap-4" style={{ transitionDelay: `${delay}ms` }}>
      <div className="flex items-center gap-3 px-1">
        <span className="grid size-9 place-items-center rounded-full bg-white font-display text-[17px] text-[var(--sk-on-solid)] shadow-[0_0_30px_rgb(201_184_255/0.6)]">{n}</span>
        <span className="font-display text-[24px] leading-none text-white">{verb}</span>
        <span className="ml-auto rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] font-medium text-white/55 ring-1 ring-white/10">{where}</span>
      </div>
      {children}
      <p className="px-1 text-[14px] leading-snug text-white/50">{note}</p>
    </li>
  );
}

/** Every day has the same three beats. This is the whole product in one picture. */
export function DayLoop() {
  return (
    <section id="how" className="relative scroll-mt-24 py-24 md:py-32">
      <Container>
    <div className="relative">
      <div className="reveal mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
        <span className="sk-eyebrow">How every day works</span>
        <h2 className="sk-h2 text-white">
          Read it. Do it. <span className="sk-grad">Post it.</span>
        </h2>
        <p className="max-w-[54ch] text-[16.5px] leading-relaxed text-white/60 md:text-[19px]">Every day of the week works the same way, so by Wednesday you could do it with your eyes closed. Please don&apos;t.</p>
      </div>
      <div className="relative mt-14">
        <div aria-hidden className="absolute top-[22px] right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent via-violet-300/50 to-transparent lg:block" />
        <ol className="grid items-start gap-10 text-left lg:grid-cols-3 lg:gap-6">
          <Step n={1} verb="Read" where="in Skool" note="Text and pictures. A few minutes, jokes included." delay={0}>
            <div className={cn(CARD, "p-6")} aria-hidden>
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-white/45 uppercase">
                <BookOpenIcon className="size-3.5" /> Today&apos;s lesson
              </div>
              <div className="mt-3 font-display text-[28px] leading-[1.05] text-white">Day 1</div>
              <TextBars className="mt-3" widths={["w-full", "w-[92%]", "w-[70%]"]} />
              <div className="mt-4 flex items-end justify-between gap-2 overflow-hidden rounded-2xl bg-[radial-gradient(120%_100%_at_50%_0%,rgb(124_92_255/0.28),transparent)] px-4 pt-3 ring-1 ring-white/[0.08]">
                <span className="pb-3 text-[12.5px] leading-snug font-medium text-white/60">
                  Pete, posting.
                  <br />
                  Again.
                </span>
                <Pete size={96} pose="posting" className="-mb-2 shrink-0" />
              </div>
              <TextBars className="mt-4" widths={["w-[96%]", "w-[58%]"]} />
            </div>
          </Step>

          <Step n={2} verb="Do" where="in the app" note="One next step on the screen, in the lesson's own words." delay={120}>
            <div className={cn(CARD, "sk-beam overflow-hidden")} aria-hidden>
              <div className="flex h-11 items-center gap-2.5 border-b border-white/[0.08] px-4">
                <LogoMark className="size-5 rounded-[6px]" />
                <span className="text-[12.5px] font-semibold text-white">Your path</span>
                <span className="ml-auto flex gap-1">
                  <span className="size-1.5 rounded-full bg-white/20" />
                  <span className="size-1.5 rounded-full bg-white/20" />
                  <span className="size-1.5 rounded-full bg-white/20" />
                </span>
              </div>
              <div className="flex flex-col gap-2.5 p-4">
                <UpNext day={1} title="Put your website live" body="Answer a few questions. The app writes the page. You press publish." />
                <StepRow state="done">Your free Gemini key is in</StepRow>
                <StepRow state="later">After that: your Meta Pixel</StepRow>
              </div>
            </div>
          </Step>

          <Step n={3} verb="Post" where="back in Skool" note="Post your work, review the one before you, get your audit." delay={240}>
            <div className={cn(CARD, "flex flex-col gap-2.5 p-6")} aria-hidden>
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-white/45 uppercase">
                <MessageSquareTextIcon className="size-3.5" /> Day 1 section
              </div>
              <div className={cn(MINI, "px-3.5 py-3")}>
                <div className="text-[12.5px] font-semibold text-white">The post before yours</div>
                <div className={cn("mt-1 flex items-center gap-1.5 text-[12px] font-medium", ACCENT)}>
                  <CheckIcon className="size-3.5" strokeWidth={2.5} /> You reviewed it
                </div>
              </div>
              <div className={cn(MINI, "px-3.5 py-3 ring-2 ring-violet-400/60 shadow-[0_0_30px_-6px_rgb(124_92_255/0.8)]")}>
                <div className="text-[12.5px] font-semibold text-white">Your post</div>
                <TextBars className="mt-2" widths={["w-full", "w-[64%]"]} />
              </div>
              <div className={cn(MINI, "px-3.5 py-3")}>
                <div className="text-[12.5px] font-semibold text-white">Your audit</div>
                <div className="mt-1 text-[12px] text-white/50">Personal, from Akshay</div>
              </div>
            </div>
          </Step>
        </ol>
      </div>
    </div>
      </Container>
    </section>
  );
}
