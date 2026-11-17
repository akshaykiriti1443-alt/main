import { cn } from "@/lib/utils";
import { CARD, Container, Em, Pete, SectionHead } from "./parts";

// Who Pete is. No numbers about Pete anywhere: he is a character, not a case study.

const PETES_WEEK: [day: string, plan: string][] = [
  ["Mon", "Post a Reel."],
  ["Tue", "Post a better Reel."],
  ["Wed", "Change the hook. Change it back."],
  ["Thu", "Research ring lights."],
  ["Fri", "Post about consistency."],
  ["Sat", "Blame the algorithm."],
  ["Sun", "Decide next week will be different."],
];

export function PeteStory() {
  return (
    <section id="pete" className="scroll-mt-20 border-t border-border/60 py-24 md:py-32">
      <Container className="grid items-start gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
        <div>
          <SectionHead
            eyebrow="Meet Pete"
            title={
              <>
                Pete is doing it <Em>the hard way.</Em>
              </>
            }
          />
          <div className="reveal mt-7 flex max-w-[56ch] flex-col gap-5 text-[16.5px] leading-relaxed text-muted-foreground md:text-[17.5px]">
            <p>Pete is a good guy and he works hard. He posts every day. He changes his hook, changes it back, buys a ring light, and waits for the algorithm to notice him.</p>
            <p>Some weeks it does. Most weeks Pete gets likes from other Petes.</p>
            <p>Nothing is wrong with Pete. He just picked the slowest way to find members, which is hoping strangers wander in.</p>
          </div>
          <p className="reveal mt-9 font-display text-[34px] leading-[1.05] tracking-[-0.012em] text-foreground md:text-[44px]">We were all Pete once.</p>
          <div className="reveal mt-7 flex max-w-[56ch] flex-col gap-5 text-[16.5px] leading-relaxed text-muted-foreground md:text-[17.5px]">
            <p>
              The other way is less romantic. You pay a little to put your offer in front of the right people, send them to a page that explains it, and count what happens. A few days later you have real numbers instead of a feeling.
            </p>
            <p className="font-medium text-foreground">That is the whole week.</p>
          </div>
        </div>

        <PetesPlanner />
      </Container>
    </section>
  );
}

function PetesPlanner() {
  return (
    <figure className="reveal relative mt-10 [transition-delay:80ms] lg:mt-16">
      <Pete size={148} pose="shrug" className="absolute -top-[92px] right-3 z-10 drop-shadow-[0_8px_14px_rgb(28_21_56/0.14)] sm:right-8" />
      <div className={cn(CARD, "overflow-hidden")}>
        <div className="border-b border-border/70 px-6 pt-6 pb-4 md:px-8">
          <span className="eyebrow">Exhibit A</span>
          <figcaption className="mt-1.5 font-display text-[28px] leading-none">Pete&apos;s week</figcaption>
        </div>
        <ol className="flex flex-col px-6 py-2 md:px-8">
          {PETES_WEEK.map(([day, plan]) => (
            <li key={day} className="flex items-baseline gap-5 border-b border-dashed border-border-strong/70 py-3.5 last:border-0">
              <span className="w-9 shrink-0 text-[11.5px] font-semibold tracking-[0.12em] text-subtle-foreground uppercase">{day}</span>
              <span className="text-[15.5px] leading-snug text-foreground/85">{plan}</span>
            </li>
          ))}
        </ol>
        <div className="border-t border-border/70 bg-muted/60 px-6 py-4 text-[13.5px] leading-snug text-muted-foreground md:px-8">
          <span className="font-semibold text-foreground">Members found:</span> unknown. Pete doesn&apos;t count.
        </div>
      </div>
    </figure>
  );
}
