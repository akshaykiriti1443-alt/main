import { ArrowDownIcon, CheckIcon, HeartIcon, SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Parallax, Rise, ScrollWords, Tilt } from "./fx/motion";
import { PeteFloat } from "./fx/pete-float";
import { CARD, Container, Em, Pete, SectionHead } from "./parts";

// Who Pete is. No numbers about Pete anywhere: he is a character, not a case study.
// Three beats: meet Pete (on his little stage), the turn ("we were all Pete once"), then
// Pete's week next to the other way.

const PETES_WEEK: [day: string, plan: string][] = [
  ["Mon", "Post a Reel."],
  ["Tue", "Post a better Reel."],
  ["Wed", "Change the hook. Change it back."],
  ["Thu", "Research ring lights."],
  ["Fri", "Post about consistency."],
  ["Sat", "Blame the algorithm."],
  ["Sun", "Decide next week will be different."],
];

/** A small frosted bubble (not .sk-glass, whose fixed 28px radius would override ours). */
const BUBBLE = "bg-white/[0.07] ring-1 ring-white/15 backdrop-blur-md shadow-[inset_0_1px_0_rgb(255_255_255/0.1),0_18px_40px_-18px_rgb(0_0_0/0.8)]";

const OTHER_WAY:[step: string, line: string][] = [
  ["Pay a little", "Put your offer in front of the right people."],
  ["Explain it", "Send them to a page that explains it."],
  ["Count", "Count what happens."],
];

export function PeteStory() {
  return (
    <section id="pete" className="relative isolate scroll-mt-20 overflow-x-clip py-24 md:py-36">
      <div aria-hidden className="sk-gridlines pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] opacity-60" />

      {/* Beat 1: meet Pete */}
      <Container className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div>
          <SectionHead
            eyebrow="Meet Pete"
            title={
              <>
                Pete is doing it <Em>the hard way.</Em>
              </>
            }
          />
          <div className="mt-8 flex max-w-[54ch] flex-col gap-5 text-[16.5px] leading-relaxed text-white/60 md:text-[18px]">
            <Rise delay={0.05}>
              <p>
                Pete is a good guy and he works hard. He posts every day. He changes his hook, changes it back, buys a ring light, and waits for the algorithm to notice him.
              </p>
            </Rise>
            <Rise delay={0.12}>
              <p>
                Some weeks it does. Most weeks Pete gets <span className="font-semibold text-white">likes from other Petes.</span>
              </p>
            </Rise>
            <Rise delay={0.19}>
              <p>Nothing is wrong with Pete. He just picked the slowest way to find members, which is hoping strangers wander in.</p>
            </Rise>
          </div>
        </div>

        <PeteStage />
      </Container>

      {/* Beat 2: the turn */}
      <Container className="mt-28 md:mt-40">
        <Rise>
          <p className="sk-display text-[clamp(52px,10vw,148px)] text-white">
            We were all <span className="sk-grad-anim pr-[0.06em]">Pete</span> once.
          </p>
        </Rise>
        <ScrollWords
          className="sk-display mt-10 max-w-[24ch] text-[clamp(30px,4.6vw,64px)] leading-[1.05]! text-white md:mt-14"
          text="The other way is less romantic. You pay a little to put your offer in front of the *right* *people,* send them to a page that explains it, and *count* what happens."
        />
      </Container>

      {/* Beat 3: Pete's week vs the other way */}
      <Container className="mt-20 md:mt-28">
        <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr] lg:gap-8">
          <Rise>
            <PetesPlanner />
          </Rise>

          <Rise delay={0.1} className="flex justify-center">
            <span className="grid size-14 place-items-center rounded-full bg-[var(--card)] font-display text-[18px] font-bold tracking-[-0.02em] text-white/80 shadow-[0_0_0_6px_rgb(255_255_255/0.03),0_0_40px_-6px_rgb(124_92_255/0.7)] ring-1 ring-white/15">
              vs
            </span>
          </Rise>

          <Rise delay={0.18}>
            <OtherWay />
          </Rise>
        </div>

        <Rise className="mt-16 flex flex-col items-center gap-6 text-center md:mt-20">
          <p className="sk-display text-[clamp(38px,6vw,76px)] text-white">
            That is the <Em>whole week.</Em>
          </p>
          <a href="#week" className="sk-ghost">
            See the seven days
            <ArrowDownIcon className="size-4" aria-hidden />
          </a>
        </Rise>
      </Container>
    </section>
  );
}

/** Pete under a spotlight on a glowing little stage, with what he's thinking. Decoration only. */
function PeteStage() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[460px] select-none">
      <Rise y={40}>
        <div className="relative flex flex-col items-center pt-16">
          {/* spotlight cone and halo */}
          <div className="absolute -top-10 left-1/2 h-[440px] w-[min(360px,100%)] -translate-x-1/2 bg-[linear-gradient(180deg,rgb(255_255_255/0.16),rgb(201_184_255/0.05)_55%,transparent_85%)] blur-md [clip-path:polygon(40%_0,60%_0,100%_100%,0_100%)]" />
          <div className="absolute top-[18%] left-1/2 size-[280px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(124_92_255/0.6),rgb(255_111_174/0.18)_60%,transparent)] blur-2xl md:size-[360px]" />

          {/* the thought */}
          <div className="absolute top-0 right-0 z-20 sm:right-2">
            <PeteFloat delay={0.8}>
              <div className={cn(BUBBLE, "relative rounded-2xl rounded-br-md px-4 py-2.5 text-[13.5px] font-semibold text-white/90")}>
                Next week will be different.
                <span className="absolute -bottom-2 right-6 size-3 rounded-full bg-white/10 ring-1 ring-white/15" />
                <span className="absolute -bottom-5 right-9 size-2 rounded-full bg-white/10 ring-1 ring-white/15" />
              </div>
            </PeteFloat>
          </div>

          {/* the reward */}
          <div className="absolute top-[56%] left-0 z-20">
            <PeteFloat delay={1.6}>
              <div className={cn(BUBBLE, "flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-[12.5px] font-semibold whitespace-nowrap text-white/80")}>
                <span className="grid size-6 place-items-center rounded-full bg-[rgb(255_111_174/0.16)] text-[var(--sk-pink)] ring-1 ring-[rgb(255_111_174/0.3)]">
                  <HeartIcon className="size-3.5 fill-current" />
                </span>
                Likes from other Petes
              </div>
            </PeteFloat>
          </div>

          {/* Pete */}
          <Parallax speed={0.08} className="relative z-10">
            <PeteFloat>
              <Pete pose="shrug" size={300} className="h-auto w-[210px] drop-shadow-[0_28px_30px_rgb(0_0_0/0.55)] sm:w-[260px] md:w-[300px]" />
            </PeteFloat>
          </Parallax>

          {/* the stage */}
          <div className="relative -mt-12 h-[96px] w-[92%]">
            <div className="absolute inset-x-0 top-0 h-[86px] rounded-[50%] bg-[radial-gradient(closest-side,rgb(124_92_255/0.5),rgb(124_92_255/0.08)_70%,transparent)] ring-1 ring-white/10" />
            <div className="absolute inset-x-[14%] top-[14px] h-[58px] rounded-[50%] ring-1 ring-[rgb(201_184_255/0.35)] shadow-[0_0_40px_-4px_rgb(124_92_255/0.8),inset_0_0_24px_rgb(201_184_255/0.25)]" />
            <div className="absolute inset-x-[30%] top-[28px] h-[30px] rounded-[50%] bg-[rgb(255_255_255/0.08)] ring-1 ring-white/20" />
          </div>
        </div>
      </Rise>
    </div>
  );
}

/** Exhibit A: Pete's actual week. */
function PetesPlanner() {
  return (
    <figure className={cn(CARD, "overflow-hidden lg:-rotate-[1.2deg]")}>
      <div className="flex items-end justify-between gap-4 border-b border-white/10 px-6 pt-6 pb-5 md:px-8">
        <div>
          <span className="sk-eyebrow">Exhibit A</span>
          <figcaption className="mt-2 font-display text-[30px] leading-none font-semibold tracking-[-0.03em] text-white">Pete&apos;s week</figcaption>
        </div>
        <Pete size={64} pose="posting" className="-mb-2 shrink-0 opacity-90" />
      </div>
      <ol className="flex flex-col px-6 py-2 md:px-8">
        {PETES_WEEK.map(([day, plan]) => (
          <li key={day} className="flex items-baseline gap-5 border-b border-dashed border-white/10 py-3.5 last:border-0">
            <span className="w-9 shrink-0 text-[11.5px] font-bold tracking-[0.14em] text-white/35 uppercase">{day}</span>
            <span className="text-[15.5px] leading-snug text-white/70">{plan}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 bg-white/[0.02] px-6 py-5 md:px-8">
        <span className="inline-block -rotate-3 rounded-lg border-2 border-[rgb(255_111_174/0.55)] px-3 py-1 font-display text-[14px] font-bold tracking-[0.08em] text-[var(--sk-pink)] uppercase shadow-[0_0_24px_-6px_rgb(255_111_174/0.6)]">
          Members found: unknown
        </span>
        <span className="text-[13.5px] text-white/50">Pete doesn&apos;t count.</span>
      </div>
    </figure>
  );
}

/** The other way: less romantic, more countable. */
function OtherWay() {
  return (
    <div className="relative">
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[40px] bg-[radial-gradient(closest-side,rgb(124_92_255/0.35),transparent)] blur-2xl" />
      <Tilt max={6} className="rounded-[28px]">
        <div className={cn(CARD, "overflow-hidden")}>
          <div className="border-b border-white/10 px-6 pt-6 pb-5 md:px-8">
            <span className="sk-eyebrow">Exhibit B</span>
            <p className="mt-2 font-display text-[30px] leading-none font-semibold tracking-[-0.03em] text-white">
              The <Em>other</Em> way
            </p>
          </div>
          <ol className="flex flex-col gap-3 px-6 py-6 md:px-8">
            {OTHER_WAY.map(([step, line], i) => (
              <li key={step} className="flex items-start gap-4 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.07]">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[rgb(111_242_196/0.12)] text-[var(--sk-mint)] ring-1 ring-[rgb(111_242_196/0.3)]">
                  <CheckIcon className="size-4" strokeWidth={2.6} aria-hidden />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold tracking-[0.16em] text-white/40 uppercase">
                    {i + 1} · {step}
                  </span>
                  <span className="text-[15.5px] leading-snug font-medium text-white">{line}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="flex items-start gap-3 border-t border-white/10 bg-[linear-gradient(100deg,rgb(111_242_196/0.08),rgb(255_211_111/0.06))] px-6 py-5 md:px-8">
            <SparklesIcon className="mt-0.5 size-4 shrink-0 text-[var(--sk-gold)]" aria-hidden />
            <p className="text-[14.5px] leading-snug text-white/80">
              A few days later you have <span className="font-semibold text-white">real numbers instead of a feeling.</span>
            </p>
          </div>
        </div>
      </Tilt>
    </div>
  );
}
