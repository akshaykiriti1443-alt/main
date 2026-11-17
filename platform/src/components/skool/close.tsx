import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, ChevronDownIcon } from "lucide-react";
import { LogoMark } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Container, Em, Pete, Penny, type Cta } from "./parts";

// The end of the /skool page: questions, then one last, calm way in.

export type Qa = { q: string; a: ReactNode };

export function Faq({ items }: { items: Qa[] }) {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-border/60 py-24 md:py-32">
      <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div className="reveal lg:sticky lg:top-28 lg:self-start">
          <span className="eyebrow">Questions</span>
          <h2 className="mt-4 font-display text-[38px] leading-[1.02] font-normal tracking-[-0.015em] md:text-[56px]">
            Good to know <Em>before you start.</Em>
          </h2>
          <p className="mt-5 max-w-[40ch] text-[16px] leading-relaxed text-muted-foreground">
            Anything else? Once you&apos;re inside, Penny answers the &ldquo;what do I do now&rdquo; questions as you go, and your daily post is the place to ask the rest.
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
          {items.map((f, i) => (
            <details key={f.q} className="group/faq border-b border-border py-1 first:border-t" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[17px] font-semibold tracking-[-0.012em] transition-colors hover:text-primary md:text-[18px] dark:hover:text-violet-300 [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-[transform,background-color,color] duration-200 group-open/faq:rotate-180 group-open/faq:bg-accent group-open/faq:text-primary dark:group-open/faq:text-violet-300">
                  <ChevronDownIcon className="size-4" aria-hidden />
                </span>
              </summary>
              <div className="max-w-[62ch] pb-6 text-[15.5px] leading-relaxed text-muted-foreground">{f.a}</div>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function FinalCta({ join, signupHref }: { join: Cta; signupHref: string }) {
  return (
    <section className="pb-24 md:pb-32">
      <Container>
        <div className="reveal relative isolate overflow-hidden rounded-[32px] bg-galaxy px-6 py-16 text-center text-white shadow-float ring-1 ring-white/10 md:px-12 md:py-24">
          <div aria-hidden className="bg-stars pointer-events-none absolute inset-0 -z-10 text-white/55" />
          <div aria-hidden className="pointer-events-none absolute -bottom-64 left-1/2 -z-10 h-[360px] w-[1000px] -translate-x-1/2 rounded-[100%] border-t border-white/20 bg-[radial-gradient(closest-side,rgb(167_139_250/0.25),transparent)]" />
          <div className="mx-auto flex max-w-2xl flex-col items-center">
            <div className="flex items-end gap-3" aria-hidden>
              <Pete size={84} pose="wave" />
              <LogoMark className="mb-3 size-11 rounded-[14px]" />
            </div>
            <h2 className="mt-7 font-display text-[42px] leading-[1] font-normal tracking-[-0.018em] text-white md:text-[66px]">
              Seven days from now, <em className="italic text-violet-200">you&apos;ll know.</em>
            </h2>
            <p className="mt-5 max-w-[48ch] text-[16px] leading-relaxed text-white/75 md:text-[18px]">
              Whether ads work for your group, what they cost you, and whether you want to stay. That&apos;s more than Pete knows after all those Reels.
            </p>
            <div className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
              <Button variant="cta" size="xl" asChild className="w-full sm:w-auto">
                <Link href={join.href}>
                  {join.label}
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
              <Button variant="ghost" size="xl" asChild className="w-full text-white/85 hover:bg-white/10 hover:text-white sm:w-auto dark:hover:bg-white/10">
                <Link href={signupHref}>Sign up for the app</Link>
              </Button>
            </div>
            <p className="mt-5 text-[13px] text-white/60">Start on Skool, then sign up for the app with the same email.</p>
          </div>
        </div>
      </Container>
    </section>
  );
}
