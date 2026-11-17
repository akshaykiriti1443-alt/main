import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { LogoMark } from "@/components/shell";
import { Parallax } from "./fx/motion";
import { Container, Em, Pete, Penny, SectionHead, type Cta } from "./parts";

// The end of the /skool page: questions, then one last, calm way in.

export type Qa = { q: string; a: ReactNode };

/* Native <details>, so it works with no JS. Where the browser can animate to height:auto
   (::details-content + interpolate-size) the answer glides open; elsewhere it simply opens. */
const ITEM = [
  "group/faq rounded-[22px] bg-white/[0.025] ring-1 ring-white/[0.07] ring-inset",
  "transition-[background-color,box-shadow] duration-300",
  "hover:bg-white/[0.04] open:bg-white/[0.05] open:shadow-[inset_0_0_0_1px_rgb(201_184_255/0.18),0_30px_80px_-44px_rgb(124_92_255/0.75)]",
  "[interpolate-size:allow-keywords]",
  "[&::details-content]:h-0 [&::details-content]:overflow-clip [&::details-content]:transition-[height,content-visibility]",
  "[&::details-content]:duration-500 [&::details-content]:ease-[cubic-bezier(.16,1,.3,1)] [&::details-content]:[transition-behavior:allow-discrete]",
  "[&[open]::details-content]:h-auto motion-reduce:[&::details-content]:transition-none",
].join(" ");

export function Faq({ items, more }: { items: Qa[]; more?: ReactNode }) {
  return (
    <section id="faq" className="relative scroll-mt-24 py-24 md:py-36">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.12),transparent)]" />
      <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <SectionHead
            eyebrow="Questions"
            title={
              <>
                Good to know <Em>before you start.</Em>
              </>
            }
            sub={<>Anything else? Once you&apos;re inside, Penny answers the &ldquo;what do I do now&rdquo; questions as you go, and your daily post is the place to ask the rest.</>}
          />
          <div className="reveal mt-10 hidden items-center gap-4 [transition-delay:140ms] lg:flex">
            <Penny size={76} full className="shrink-0 drop-shadow-[0_12px_30px_rgb(124_92_255/0.35)]" />
            <span className="rounded-2xl rounded-bl-md bg-white/[0.05] px-4 py-3 text-[14px] leading-snug text-white/70 ring-1 ring-white/10 backdrop-blur">
              Hi, I&apos;m Penny.
              <br />
              I&apos;ll show you every step.
            </span>
          </div>
        </div>

        <div className="reveal flex flex-col gap-3 [transition-delay:80ms]">
          {items.map((f, i) => (
            <details key={f.q} className={ITEM} open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center gap-4 rounded-[22px] px-5 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--sk-lilac)] md:gap-6 md:px-7 md:py-6 [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="sk-display w-7 shrink-0 text-[15px] text-white/30 tabular-nums transition-colors group-open/faq:text-[var(--sk-lilac)] md:w-8">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 text-[16.5px] font-semibold tracking-[-0.015em] text-white/85 transition-colors group-hover/faq:text-white group-open/faq:text-white md:text-[18.5px]">
                  {f.q}
                </span>
                <span
                  aria-hidden
                  className="relative grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.05] ring-1 ring-white/10 transition-[transform,background-color] duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover/faq:bg-white/[0.09] group-open/faq:rotate-180 group-open/faq:bg-[var(--sk-violet)] group-open/faq:ring-white/25"
                >
                  <span className="absolute h-[1.5px] w-3.5 rounded-full bg-white group-open/faq:bg-[#fff]" />
                  <span className="absolute h-3.5 w-[1.5px] rounded-full bg-white group-open/faq:bg-[#fff] transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-open/faq:scale-y-0" />
                </span>
              </summary>
              <div className="max-w-[62ch] px-5 pb-6 text-[15.5px] leading-relaxed text-white/60 duration-500 group-open/faq:animate-in group-open/faq:fade-in-0 group-open/faq:slide-in-from-top-1 sm:pl-[64px] md:pr-7 md:pb-7 md:pl-[84px]">
                {f.a}
              </div>
            </details>
          ))}
          {more ? <div className="mt-3 px-1 text-[15px] font-semibold">{more}</div> : null}
        </div>
      </Container>
    </section>
  );
}

export function FinalCta({ join, signupHref }: { join: Cta; signupHref: string }) {
  return (
    <section className="relative isolate overflow-hidden pt-24 pb-44 md:pt-36 md:pb-60">
      {/* The finale's sky: a faint grid, a glowing orb, a tilted orbit and a planet's horizon. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="sk-gridlines absolute inset-0" />
        <Parallax speed={0.12} className="absolute inset-x-0 top-[4%] flex justify-center">
          <div className="size-[520px] rounded-full bg-[radial-gradient(closest-side,rgb(124_92_255/0.5),rgb(255_111_174/0.16)_58%,transparent)] blur-2xl md:size-[900px]" />
        </Parallax>
        <div className="absolute top-[44%] left-1/2 -translate-x-1/2 -translate-y-1/2 [perspective:1000px]">
          <div className="[transform:rotateX(74deg)]">
            <div className="relative size-[560px] animate-spin rounded-full border border-white/[0.12] motion-reduce:animate-none md:size-[980px]" style={{ animationDuration: "46s" }}>
              <span className="absolute top-0 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--sk-pink)] shadow-[0_0_28px_8px_rgb(255_111_174/0.65)]" />
              <span className="absolute bottom-0 left-1/2 size-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-[var(--sk-lilac)] shadow-[0_0_22px_6px_rgb(201_184_255/0.6)]" />
            </div>
          </div>
        </div>
        <div className="absolute top-[80%] left-1/2 aspect-square w-[200%] -translate-x-1/2 rounded-full border-t border-white/30 bg-[radial-gradient(55%_22%_at_50%_0%,rgb(124_92_255/0.16),transparent_100%),linear-gradient(180deg,rgb(255_255_255/0.95),rgb(247_245_255/0.6)_30%)] shadow-[0_-40px_140px_-30px_rgb(124_92_255/0.45),inset_0_1px_30px_-6px_rgb(124_92_255/0.25)] dark:bg-[radial-gradient(55%_22%_at_50%_0%,rgb(124_92_255/0.32),transparent_100%),linear-gradient(180deg,rgb(9_6_30/0.92),rgb(7_5_26/0.5)_30%)] dark:shadow-[0_-40px_140px_-30px_rgb(124_92_255/0.85),inset_0_1px_30px_-6px_rgb(201_184_255/0.5)] md:w-[1600px]" />
      </div>

      <Container className="relative flex flex-col items-center text-center">
        <div className="reveal flex items-end gap-3" aria-hidden>
          <Pete size={88} pose="wave" />
          <LogoMark className="mb-3 size-12 rounded-[15px] shadow-[0_0_44px_-4px_rgb(124_92_255/0.95)]" />
        </div>

        <span className="reveal sk-eyebrow mt-8 [transition-delay:60ms]">Seven days. Seven small wins.</span>

        <h2 className="reveal sk-display mt-6 max-w-[13ch] text-[clamp(50px,10vw,148px)] text-white [transition-delay:100ms]">
          Seven days from now, <span className="sk-grad-anim inline-block pb-[0.08em]">you&apos;ll know.</span>
        </h2>

        <p className="reveal mt-7 max-w-[48ch] text-[17px] leading-relaxed text-pretty text-white/65 [transition-delay:160ms] md:text-[20px]">
          Whether your group can grow without a following, what it really costs, and whether you want to stay. That&apos;s more than Pete knows after all those Reels.
        </p>

        <div className="reveal mt-11 flex w-full flex-col items-center justify-center gap-3 [transition-delay:220ms] sm:w-auto sm:flex-row">
          <Link href={join.href} className="sk-cta group w-full sm:w-auto">
            <span className="relative">{join.label}</span>
            <ArrowRightIcon className="relative size-[18px] transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <Link href={signupHref} className="sk-ghost w-full sm:w-auto">
            Sign up for the app
          </Link>
        </div>

        <p className="reveal mt-6 flex items-center justify-center gap-2 text-[13.5px] text-white/50 [transition-delay:260ms]">
          <CheckIcon className="size-3.5 shrink-0 text-[var(--sk-mint)]" strokeWidth={2.5} aria-hidden />
          Start on Skool, then sign up for the app with the same email.
        </p>
      </Container>
    </section>
  );
}
