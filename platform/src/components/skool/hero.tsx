import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowRightIcon, BookOpenIcon, CheckIcon, MessageSquareTextIcon, SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ACCENT, CARD, Container, MINI, Pete, WELL, type Cta } from "./parts";
import { StepRow, TextBars, UpNext } from "./visuals";

/** The three parts of one membership, named once near the top so nothing later is a surprise. */
export type Part = { name: string; what: string; body: string };

export function Hero({ join, signupHref, parts }: { join: Cta; signupHref: string; parts: Part[] }) {
  return (
    <section className="relative isolate pt-12 pb-20 md:pt-[72px] md:pb-28">
      {/* The faintest galaxy on marshmallow: a few violet stars and one soft glow. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[1000px]">
        <div className="bg-stars absolute inset-0 text-violet-500/45 [mask-image:radial-gradient(55%_60%_at_50%_10%,black,transparent)] dark:text-violet-200/40" />
        <div className="absolute top-[-200px] left-1/2 h-[600px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow-violet),transparent)]" />
      </div>

      <Container className="flex flex-col items-center text-center">
        <span className="reveal inline-flex items-center gap-2 rounded-full bg-card/80 py-1 pr-3.5 pl-1.5 text-[13px] font-medium text-foreground/80 shadow-xs ring-1 ring-ink/[0.06] backdrop-blur dark:ring-white/[0.08]">
          <span className={cn("grid size-5 place-items-center rounded-full bg-accent", ACCENT)}>
            <SparklesIcon className="size-3" aria-hidden />
          </span>
          The Anti-Pete Week · free for 7 days on Skool
        </span>

        <h1 className="reveal mt-6 max-w-[16ch] text-[46px] leading-[0.98] tracking-[-0.022em] text-foreground [transition-delay:60ms] sm:text-[64px] lg:text-[84px]">
          Grow your Skool community <em className="text-gradient-violet pr-1 italic">without becoming Pete.</em>
        </h1>

        <p className="reveal mt-6 max-w-[60ch] text-[17px] leading-relaxed text-pretty text-muted-foreground [transition-delay:120ms] md:text-[18.5px]">
          Pete posts every day and hopes somebody joins. You get seven days and seven small wins: a website, a Meta Pixel, and ads that go looking for members while you get on with your life. The course in Skool tells you what to do today. The app does most of it for you.
        </p>

        <div className="reveal mt-8 flex w-full flex-col items-center justify-center gap-3 [transition-delay:180ms] sm:w-auto sm:flex-row">
          <Button variant="cta" size="xl" asChild className="w-full sm:w-auto">
            <Link href={join.href}>
              {join.label}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
          <Button variant="outline" size="xl" asChild className="w-full sm:w-auto">
            <a href="#week">See the seven days</a>
          </Button>
        </div>

        <ul className="reveal mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13.5px] text-muted-foreground [transition-delay:220ms]">
          {["7-day free trial on Skool", "The app is included", "We never log in to your Skool"].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <CheckIcon className={cn("size-3.5", ACCENT)} strokeWidth={2.5} aria-hidden />
              {t}
            </li>
          ))}
        </ul>
        <p className="reveal mt-4 text-[13.5px] text-muted-foreground [transition-delay:240ms]">
          Already a member? <Link href={signupHref}>Sign up for the app</Link> with your Skool email.
        </p>
      </Container>

      <Container className="reveal mt-14 [transition-delay:260ms] md:mt-20">
        <DayLoop />
      </Container>

      <Container className="reveal mt-16 md:mt-24">
        <p className="text-center text-[13px] font-medium text-muted-foreground">One membership. Three parts that share a plan.</p>
        <dl className="mx-auto mt-6 grid max-w-[1080px] border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-border">
          {parts.map((p) => (
            <div key={p.name} className="flex flex-col gap-1.5 border-b border-border py-6 last:border-b-0 sm:border-b-0 sm:px-7 sm:first:pl-0 sm:last:pr-0">
              <dt className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="font-display text-[26px] leading-none tracking-[-0.01em]">{p.name}</span>
                <span className="eyebrow">{p.what}</span>
              </dt>
              <dd className="text-[14.5px] leading-relaxed text-muted-foreground">{p.body}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

function Step({ n, verb, where, note, children }: { n: number; verb: string; where: string; note: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline gap-2.5 px-1">
        <span className={cn("font-display text-[28px] leading-none", ACCENT)}>{n}</span>
        <span className="text-[15px] font-semibold tracking-[-0.01em]">{verb}</span>
        <span className="ml-auto text-[12.5px] text-muted-foreground">{where}</span>
      </div>
      {children}
      <p className="px-1 text-[13.5px] leading-snug text-muted-foreground">{note}</p>
    </li>
  );
}

function Arrow() {
  return (
    <li aria-hidden className="grid place-items-center text-subtle-foreground lg:pt-12">
      <ArrowRightIcon className="hidden size-5 lg:block" />
      <ArrowDownIcon className="size-5 lg:hidden" />
    </li>
  );
}

/** Every day has the same three beats. This is the whole product in one picture. */
function DayLoop() {
  return (
    <div className="relative mx-auto max-w-[1080px]">
      <div aria-hidden className="absolute inset-x-[10%] top-[18%] -bottom-8 -z-10 rounded-[48px] bg-[radial-gradient(closest-side,var(--glow-violet),transparent)] blur-2xl" />
      <p className="mb-6 text-center text-[13px] font-medium text-muted-foreground">Every day of the week works the same way.</p>
      <ol className="grid items-start gap-4 text-left lg:grid-cols-[1fr_auto_1.2fr_auto_1fr] lg:gap-3">
        <Step n={1} verb="Read" where="in Skool" note="Text and pictures. A few minutes, jokes included.">
          <div className={cn(CARD, "p-5")} aria-hidden>
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.1em] text-subtle-foreground uppercase">
              <BookOpenIcon className="size-3.5" /> Today&apos;s lesson
            </div>
            <div className="mt-3 font-display text-[24px] leading-[1.05]">Day 1</div>
            <TextBars className="mt-3" widths={["w-full", "w-[92%]", "w-[70%]"]} />
            <div className={cn(WELL, "mt-4 flex items-end justify-between gap-2 overflow-hidden rounded-2xl px-4 pt-3")}>
              <span className="pb-3 text-[12px] leading-snug font-medium text-muted-foreground">
                Pete, posting.
                <br />
                Again.
              </span>
              <Pete size={92} pose="posting" className="-mb-2 shrink-0" />
            </div>
            <TextBars className="mt-4" widths={["w-[96%]", "w-[58%]"]} />
          </div>
        </Step>

        <Arrow />

        <Step n={2} verb="Do" where="in the app" note="One next step on the screen, in the lesson's own words.">
          <div className={cn(CARD, "overflow-hidden shadow-float")} aria-hidden>
            <div className="flex h-10 items-center gap-2.5 border-b border-border/70 bg-background/60 px-4">
              <LogoMark className="size-5 rounded-[6px]" />
              <span className="text-[12px] font-semibold">Your path</span>
            </div>
            <div className={cn(WELL, "flex flex-col gap-2.5 p-4 ring-0")}>
              <UpNext day={1} title="Put your website live" body="Answer a few questions. The app writes the page. You press publish." />
              <StepRow state="done">Your free Gemini key is in</StepRow>
              <StepRow state="later">After that: your Meta Pixel</StepRow>
            </div>
          </div>
        </Step>

        <Arrow />

        <Step n={3} verb="Post" where="back in Skool" note="Post your work, review the one before you, get your audit.">
          <div className={cn(CARD, "flex flex-col gap-2.5 p-5")} aria-hidden>
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.1em] text-subtle-foreground uppercase">
              <MessageSquareTextIcon className="size-3.5" /> Day 1 section
            </div>
            <div className={cn(MINI, "px-3.5 py-3")}>
              <div className="text-[12.5px] font-semibold">The post before yours</div>
              <div className={cn("mt-1 flex items-center gap-1.5 text-[12px] font-medium", ACCENT)}>
                <CheckIcon className="size-3.5" strokeWidth={2.5} /> You reviewed it
              </div>
            </div>
            <div className={cn(MINI, "px-3.5 py-3 ring-2 ring-violet-300 dark:ring-violet-400/50")}>
              <div className="text-[12.5px] font-semibold">Your post</div>
              <TextBars className="mt-2" widths={["w-full", "w-[64%]"]} />
            </div>
            <div className={cn(MINI, "px-3.5 py-3")}>
              <div className="text-[12.5px] font-semibold">Your audit</div>
              <div className="mt-1 text-[12px] text-muted-foreground">Personal, from Akshay</div>
            </div>
          </div>
        </Step>
      </ol>
    </div>
  );
}
