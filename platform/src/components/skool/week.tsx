import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT, CARD, Container, Em, MenuChip, MINI, SectionHead, WELL } from "./parts";
import { Browser, FiveAds, MiniLanding } from "./visuals";

/** One day of the course. `tools` are menu items in the app, spelled the way the menu spells them. */
export type Day = { day: number; title: string; body: string; win: string; tools: string[] };

export function Week({ days }: { days: Day[] }) {
  const [first, ...rest] = days;
  return (
    <section
      id="week"
      className="scroll-mt-20 border-y border-border/60 bg-[linear-gradient(180deg,var(--background),color-mix(in_oklab,var(--accent)_45%,var(--background))_50%,var(--background))] py-24 md:py-32"
    >
      <Container>
        <SectionHead
          eyebrow="Your week"
          title={
            <>
              Seven days. <Em>Seven wins.</Em>
            </>
          }
          sub="One lesson a day and one job a day. Every day ends with something you can point at, which is more than Pete can say about Thursday."
        />

        {first ? <DayOne day={first} /> : null}

        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:mt-5 lg:grid-cols-3 lg:gap-5">
          {rest.map((d, i) => (
            <li key={d.day} className={cn(CARD, "reveal flex flex-col p-6 md:p-7")} style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn("font-display text-[52px] leading-[0.9] tabular-nums", ACCENT)}>{d.day}</span>
                <span className="text-[11.5px] font-semibold tracking-[0.14em] text-subtle-foreground uppercase">Day {d.day}</span>
              </div>
              <h3 className="mt-5 text-[19px] leading-snug font-semibold tracking-[-0.015em]">{d.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{d.body}</p>
              <DayFoot day={d} className="mt-auto pt-6" />
            </li>
          ))}
        </ol>

        <p className="reveal mt-8 max-w-[70ch] text-[13.5px] leading-relaxed text-muted-foreground">
          Fit Dads Club is made up. It&apos;s there to show the kind of thing the app builds, and your group goes in its place. The labels after &ldquo;In the app&rdquo; are the exact names in the app&apos;s menu.
        </p>
      </Container>
    </section>
  );
}

function DayFoot({ day, className }: { day: Day; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <p className="flex gap-2.5 border-t border-border pt-4 text-[14px] leading-snug">
        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-success" aria-hidden>
          <CheckIcon className="size-3" strokeWidth={3} />
        </span>
        <span>
          <span className="font-semibold">The win: </span>
          {day.win}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] text-muted-foreground">In the app:</span>
        {day.tools.map((t) => (
          <MenuChip key={t}>{t}</MenuChip>
        ))}
      </div>
    </div>
  );
}

/** Day 1 is the long one, so it gets the big card and the pictures. */
function DayOne({ day }: { day: Day }) {
  return (
    <article className={cn(CARD, "reveal mt-14 grid overflow-hidden lg:grid-cols-[1fr_1.05fr]")}>
      <div className="flex flex-col p-7 md:p-10">
        <div className="flex items-baseline gap-4">
          <span className={cn("font-display text-[84px] leading-[0.8] tabular-nums md:text-[104px]", ACCENT)}>{day.day}</span>
          <span className="text-[11.5px] font-semibold tracking-[0.14em] text-subtle-foreground uppercase">Day {day.day} · the long one</span>
        </div>
        <h3 className="mt-7 font-display text-[32px] leading-[1.04] font-normal tracking-[-0.012em] md:text-[40px]">{day.title}</h3>
        <p className="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-muted-foreground">{day.body}</p>
        <DayFoot day={day} className="mt-auto pt-8" />
      </div>

      <div className={cn(WELL, "relative flex flex-col justify-center gap-6 p-6 ring-0 md:p-10 lg:border-l lg:border-border/70")} aria-hidden>
        <div className="relative mx-auto w-full max-w-[440px]">
          <Browser>
            <MiniLanding big />
          </Browser>
          <span className="absolute -top-3 right-4 flex items-center gap-1.5 rounded-full bg-card py-1 pr-3 pl-1.5 text-[11.5px] font-semibold shadow-lift ring-1 ring-ink/[0.07] dark:ring-white/[0.08]">
            <span className="grid size-5 place-items-center rounded-full bg-success-soft text-success">
              <CheckIcon className="size-3" strokeWidth={3} />
            </span>
            Published
          </span>
          <span className={cn(MINI, "absolute -bottom-4 left-4 flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-2 text-[11.5px] font-semibold")}>
            <span className="size-2 rounded-full bg-success" />
            Meta Pixel connected
          </span>
        </div>
        <FiveAds className="mx-auto mt-3 w-full max-w-[440px]" />
        <p className="text-center text-[12px] text-muted-foreground">An example: one website, one Pixel, five ads.</p>
      </div>
    </article>
  );
}
