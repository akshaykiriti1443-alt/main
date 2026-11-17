import { CheckIcon, TrophyIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Parallax, Rise, Tilt } from "./fx/motion";
import { WeekNode, WeekRail } from "./fx/week-rail";
import { CARD, Container, Em, MenuChip, Pete, SectionHead } from "./parts";
import { Browser, FiveAds, MiniLanding } from "./visuals";

/** One day of the course. `tools` are menu items in the app, spelled the way the menu spells them. */
export type Day = { day: number; title: string; body: string; win: string; tools: string[] };

const two = (n: number) => String(n).padStart(2, "0");

// The showpiece. Day 1 is the big card with the light running round it and the pictures. Days 2-7
// hang off a rail whose light fills as you scroll: on phones the rail runs down the left, from lg
// it runs down the middle with the cards alternating and a giant day number across from each one.

export function Week({ days }: { days: Day[] }) {
  const [first, ...rest] = days;
  return (
    <section id="week" className="relative isolate scroll-mt-20 overflow-x-clip py-24 md:py-36">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-[8%] left-1/2 h-[700px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(124_92_255/0.2),transparent)] blur-2xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.14),transparent)]" />
      </div>

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

        {rest.length ? (
          <>
            <Rise className="mt-20 flex items-center gap-4 md:mt-28 lg:justify-center">
              <span className="sk-eyebrow">Then six shorter days</span>
              <span className="hidden text-[14px] text-white/45 sm:inline">One job, one win, every day.</span>
            </Rise>

            <WeekRail className="mt-10 md:mt-14">
              <ol className="flex flex-col gap-8 lg:gap-4">
                {rest.map((d, i) => (
                  <DayRow key={d.day} d={d} flip={i % 2 === 1} last={i === rest.length - 1} />
                ))}
              </ol>
            </WeekRail>
          </>
        ) : null}

        <Rise className="mt-16 flex justify-start md:mt-20 lg:justify-center">
          <div className="flex items-center gap-3 rounded-full bg-white/[0.04] py-2 pr-5 pl-2 ring-1 ring-white/10">
            <Pete size={44} pose="shrug" className="shrink-0" />
            <p className="text-[14px] leading-snug text-white/70">
              <span className="font-semibold text-white">That&apos;s the week.</span> Pete is still researching ring lights.
            </p>
          </div>
        </Rise>

        <p className="reveal mt-10 max-w-[70ch] text-[13px] leading-relaxed text-white/45 lg:mx-auto lg:text-center">
          Fit Dads Club is made up. It&apos;s there to show the kind of thing the app builds, and your group goes in its place. The labels after &ldquo;In the app&rdquo; are the exact names in the app&apos;s menu.
        </p>
      </Container>
    </section>
  );
}

/** The day's win: the thing you can point at tonight. */
function Win({ text, big }: { text: string; big?: boolean }) {
  return (
    <div className="flex gap-3.5 rounded-2xl bg-[linear-gradient(100deg,rgb(111_242_196/0.10),rgb(255_211_111/0.05))] p-4 ring-1 ring-[rgb(111_242_196/0.22)] ring-inset">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[rgb(255_211_111/0.12)] text-[var(--sk-gold)] shadow-[0_0_26px_-4px_rgb(255_211_111/0.6)] ring-1 ring-[rgb(255_211_111/0.32)]" aria-hidden>
        <TrophyIcon className="size-4" strokeWidth={2.2} />
      </span>
      <p className="min-w-0">
        <span className="block text-[11px] font-bold tracking-[0.16em] text-[var(--sk-mint)] uppercase">The win</span>
        <span className={cn("mt-1 block leading-snug font-medium text-white", big ? "text-[16px] md:text-[17px]" : "text-[15px]")}>{text}</span>
      </p>
    </div>
  );
}

function Tools({ tools }: { tools: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[12px] text-white/45">In the app:</span>
      {tools.map((t) => (
        <MenuChip key={t}>{t}</MenuChip>
      ))}
    </div>
  );
}

/** One of days 2-7: a node on the rail, the card, and (from lg) a giant number across the rail. */
function DayRow({ d, flip, last }: { d: Day; flip: boolean; last: boolean }) {
  return (
    <li className="relative grid items-center pl-12 lg:grid-cols-2 lg:gap-x-32 lg:pl-0">
      <WeekNode gold={last} className="top-9 lg:top-1/2 lg:-mt-[11px]" />

      <Rise className={cn("lg:row-start-1", flip ? "lg:col-start-2" : "lg:col-start-1")}>
        <article className={cn(CARD, "p-6 md:p-8")}>
          <div className="flex items-end justify-between gap-4">
            <span aria-hidden className="sk-display sk-grad w-fit pr-[0.08em] text-[64px] lg:hidden">
              {two(d.day)}
            </span>
            <span className="text-[11.5px] font-bold tracking-[0.16em] text-white/40 uppercase">Day {d.day} of 7</span>
          </div>
          <h3 className="sk-display mt-4 text-[28px] text-white md:text-[34px] lg:mt-3">
            <span className="sr-only">Day {d.day}: </span>
            {d.title}
          </h3>
          <p className="mt-3 text-[15px] leading-relaxed text-white/60 md:text-[15.5px]">{d.body}</p>
          <div className="mt-6 flex flex-col gap-4">
            <Win text={d.win} />
            <Tools tools={d.tools} />
          </div>
        </article>
      </Rise>

      <div aria-hidden className={cn("hidden lg:row-start-1 lg:flex", flip ? "lg:col-start-1 lg:justify-end" : "lg:col-start-2 lg:justify-start")}>
        <Parallax speed={0.18}>
          <Rise delay={0.12} className={cn("flex flex-col gap-3", flip ? "items-end" : "items-start")}>
            <span className="sk-display sk-grad pr-[0.08em] text-[clamp(150px,15vw,220px)] leading-[0.8]! drop-shadow-[0_0_48px_rgb(124_92_255/0.45)]">{two(d.day)}</span>
            <span className="text-[12px] font-bold tracking-[0.2em] text-white/35 uppercase">Day {d.day}</span>
          </Rise>
        </Parallax>
      </div>
    </li>
  );
}

/** Day 1 is the long one, so it gets the big card, the beam and the pictures. */
function DayOne({ day }: { day: Day }) {
  return (
    <Rise className="mt-14 md:mt-20">
      {/* The beam sits on a wrapper: .spot and .sk-beam both draw with ::before, so they can't share an element. */}
      <div className="sk-beam rounded-[28px]">
        <article className={cn(CARD, "grid overflow-hidden lg:grid-cols-[1fr_1.08fr]")}>
          <div className="flex flex-col p-6 sm:p-8 md:p-12">
            <div className="flex flex-wrap items-center gap-3">
              <span className="sk-eyebrow">Day 1 of 7</span>
              <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11.5px] font-semibold text-white/65 ring-1 ring-white/10">the long one</span>
            </div>
            <span aria-hidden className="sk-display sk-grad mt-5 w-fit pr-[0.08em] text-[120px] leading-[0.8]! drop-shadow-[0_0_48px_rgb(124_92_255/0.5)] md:text-[176px]">
              {two(day.day)}
            </span>
            <h3 className="sk-display mt-6 text-[34px] text-white md:text-[48px]">
              <span className="sr-only">Day {day.day}: </span>
              {day.title}
            </h3>
            <p className="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-white/60 md:text-[16.5px]">{day.body}</p>
            <div className="mt-auto flex flex-col gap-5 pt-8">
              <Win text={day.win} big />
              <Tools tools={day.tools} />
            </div>
          </div>

          <div
            aria-hidden
            className="relative flex flex-col justify-center gap-7 border-t border-white/10 bg-[radial-gradient(120%_90%_at_50%_0%,rgb(124_92_255/0.22),transparent_70%)] p-6 sm:p-8 md:p-12 lg:border-t-0 lg:border-l"
          >
            <div className="absolute top-1/3 left-1/2 size-[320px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_111_174/0.18),transparent)] blur-2xl" />
            <Tilt max={7} className="relative mx-auto w-full max-w-[440px] rounded-2xl">
              <Browser className="shadow-[0_40px_80px_-30px_rgb(0_0_0/0.9),0_0_60px_-20px_rgb(124_92_255/0.6)]">
                <MiniLanding big />
              </Browser>
              <span className="absolute -top-3 right-4 flex items-center gap-1.5 rounded-full bg-[var(--card)] py-1 pr-3 pl-1.5 text-[11.5px] font-semibold text-white shadow-[0_10px_30px_-8px_rgb(0_0_0/0.8)] ring-1 ring-white/15 [transform:translateZ(40px)]">
                <span className="grid size-5 place-items-center rounded-full bg-[rgb(111_242_196/0.15)] text-[var(--sk-mint)]">
                  <CheckIcon className="size-3" strokeWidth={3} />
                </span>
                Published
              </span>
              <span className="absolute -bottom-4 left-4 flex items-center gap-2 rounded-full bg-[var(--card)] py-1.5 pr-3.5 pl-2 text-[11.5px] font-semibold text-white shadow-[0_10px_30px_-8px_rgb(0_0_0/0.8)] ring-1 ring-white/15 [transform:translateZ(60px)]">
                <span className="size-2 rounded-full bg-[var(--sk-mint)] shadow-[0_0_10px_rgb(111_242_196/0.9)]" />
                Meta Pixel connected
              </span>
            </Tilt>
            <FiveAds className="relative mx-auto mt-3 w-full max-w-[440px]" />
            <p className="relative text-center text-[12px] text-white/45">An example: one website, one Pixel, five ads.</p>
          </div>
        </article>
      </div>
    </Rise>
  );
}
