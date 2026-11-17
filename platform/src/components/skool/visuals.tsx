import type { ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT, MINI, Penny } from "./parts";

// Small product pictures, built from the app's own look. Everything here is an example for a
// made-up group (Fit Dads Club) and the page says so: no results, no people, no numbers.

/** A tiny website, the kind the app writes for a member. Always light: members' pages carry their own colours. */
export function MiniLanding({ className, big }: { className?: string; big?: boolean }) {
  return (
    <div className={cn("bg-[#fffaf6] text-[#1c1538]", className)}>
      <div className="flex items-center justify-between border-b border-[#1c1538]/[0.06] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[9px] font-bold tracking-[0.06em]">
          <span className="size-2.5 rounded-[4px] bg-[#0f7a57]" /> FIT DADS CLUB
        </span>
        <span className="text-[8px] text-[#1c1538]/50">Free checklist</span>
      </div>
      <div className={cn("px-3 pt-3 pb-3.5", big && "px-5 pt-6 pb-6")}>
        <div className={cn("text-[8.5px] font-semibold tracking-[0.1em] text-[#0f7a57] uppercase", big && "text-[10px]")}>For busy dads</div>
        <div className={cn("mt-1 font-display text-[19px] leading-[1.02]", big && "text-[28px] md:text-[32px]")}>Get strong in 20 minutes a day</div>
        <div className={cn("mt-1.5 text-[9px] leading-snug text-[#1c1538]/60", big && "text-[12px]")}>The free checklist for dads with no time and no gym.</div>
        <div className={cn("mt-2.5 flex gap-1.5", big && "mt-4 gap-2")}>
          <span className={cn("h-6 min-w-0 flex-1 truncate rounded-full border border-[#1c1538]/12 bg-white px-2 text-[8.5px] leading-6 text-[#1c1538]/40", big && "h-9 px-3.5 text-[12px] leading-9")}>you@email.com</span>
          <span className={cn("h-6 shrink-0 rounded-full bg-[#0f7a57] px-2.5 text-[8.5px] leading-6 font-semibold text-white", big && "h-9 px-4 text-[12px] leading-9")}>Send it</span>
        </div>
      </div>
    </div>
  );
}

/** A browser frame around a picture. */
export function Browser({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl bg-card shadow-lift ring-1 ring-ink/[0.07] dark:ring-white/[0.08]", className)}>
      <div className="flex h-8 items-center gap-1.5 border-b border-border/70 px-3">
        <span className="size-2 rounded-full bg-mist-300 dark:bg-white/15" />
        <span className="size-2 rounded-full bg-mist-300 dark:bg-white/15" />
        <span className="size-2 rounded-full bg-mist-300 dark:bg-white/15" />
      </div>
      {children}
    </div>
  );
}

// Five image ads, labelled the way the course labels them. One colour family: violet is the only accent.
const ADS: { id: string; line: string; art: string }[] = [
  { id: "S1", line: "5am. Again?", art: "bg-[linear-gradient(150deg,#1a0e4a,#4a22cf)]" },
  { id: "S2", line: "Keep up all summer.", art: "bg-[linear-gradient(160deg,#24145f,#5b33e8)]" },
  { id: "S3", line: "The 20-minute rule.", art: "bg-[linear-gradient(140deg,#2c1679,#7a57f0)]" },
  { id: "S4", line: "The garage counts.", art: "bg-[linear-gradient(170deg,#1a0e4a,#3b1ba6)]" },
  { id: "S5", line: "Dad strength is real.", art: "bg-[linear-gradient(150deg,#3b1ba6,#9c82f7)]" },
];

export function FiveAds({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-5 gap-1.5 sm:gap-2.5", className)}>
      {ADS.map((ad, i) => (
        <div key={ad.id} className={cn(MINI, "flex flex-col gap-1.5 p-1.5", i % 2 === 1 && "sm:-translate-y-2")}>
          <div className={cn("relative flex aspect-[4/5] items-end overflow-hidden rounded-lg p-1.5 sm:p-2", ad.art)}>
            <span className="bg-stars absolute inset-0 text-white/40" />
            {/* Too narrow for words on a phone: the picture and its label carry it there. */}
            <span className="relative hidden font-display text-[13px] leading-[1.02] text-white sm:block">{ad.line}</span>
          </div>
          <span className="px-0.5 pb-0.5 text-[10px] font-semibold text-muted-foreground tabular-nums">{ad.id}</span>
        </div>
      ))}
    </div>
  );
}

/** The seven days as dots, with today lit. */
export function WeekDots({ today = 1, className }: { today?: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
        <span
          key={d}
          className={cn(
            "grid h-6 flex-1 place-items-center rounded-full text-[10.5px] font-semibold tabular-nums",
            d < today && "bg-success-soft text-success",
            d === today && "bg-primary text-primary-foreground shadow-press",
            d > today && "bg-muted text-subtle-foreground",
          )}
        >
          {d < today ? <CheckIcon className="size-3" strokeWidth={3} /> : d}
        </span>
      ))}
    </div>
  );
}

/** What the app shows first: the one next step, in the day's own words. */
export function UpNext({ day, title, body, className }: { day: number; title: string; body: string; className?: string }) {
  return (
    <div className={cn(MINI, "p-4", className)}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold tracking-[0.12em] text-accent-foreground uppercase">Up next · Day {day}</div>
          <div className="mt-1.5 font-display text-[24px] leading-[1.05]">{title}</div>
          <div className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{body}</div>
        </div>
        <Penny size={44} className="shrink-0 drop-shadow-[0_4px_8px_rgb(201_138_18/0.3)]" />
      </div>
      <WeekDots today={day} className="mt-4" />
    </div>
  );
}

/** Grey bars standing in for the lines of a lesson or a post. */
export function TextBars({ widths, className }: { widths: string[]; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {widths.map((w, i) => (
        <span key={i} className={cn("h-1.5 rounded-full bg-mist-200 dark:bg-white/10", w)} />
      ))}
    </div>
  );
}

/** A done row, a do-this-now row or a not-yet row, for the small checklists inside pictures. */
export function StepRow({ state = "now", children, className }: { state?: "done" | "now" | "later"; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px]",
        state === "later" ? "ring-1 ring-border ring-inset" : MINI,
        state === "now" && "ring-2 ring-violet-300 dark:ring-violet-400/50",
        className,
      )}
    >
      <span className={cn("grid size-5 shrink-0 place-items-center rounded-full", state === "done" ? "bg-success text-white dark:text-background" : state === "now" ? cn("bg-accent", ACCENT) : "bg-muted text-subtle-foreground")}>
        {state === "done" ? <CheckIcon className="size-3" strokeWidth={3} /> : <span className="size-1.5 rounded-full bg-current" />}
      </span>
      <span className={cn("min-w-0 truncate font-medium", state !== "now" && "text-muted-foreground")}>{children}</span>
    </div>
  );
}
