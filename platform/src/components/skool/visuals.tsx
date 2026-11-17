import type { ReactNode } from "react";
import { CheckIcon, LockIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MINI, Penny } from "./parts";

// Small product pictures, drawn as a sleek dark app on the page's glass. Everything here is an
// example for a made-up group (Fit Dads Club) and the page says so: no results, no people, no numbers.

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
        <div className={cn("mt-1 font-display text-[19px] leading-[1.02] tracking-[-0.03em]", big && "text-[28px] md:text-[32px]")}>Get strong in 20 minutes a day</div>
        <div className={cn("mt-1.5 text-[9px] leading-snug text-[#1c1538]/60", big && "text-[12px]")}>The free checklist for dads with no time and no gym.</div>
        <div className={cn("mt-2.5 flex gap-1.5", big && "mt-4 gap-2")}>
          <span className={cn("h-6 min-w-0 flex-1 truncate rounded-full border border-[#1c1538]/12 bg-[#fff] px-2 text-[8.5px] leading-6 text-[#1c1538]/40", big && "h-9 px-3.5 text-[12px] leading-9")}>you@email.com</span>
          <span className={cn("h-6 shrink-0 rounded-full bg-[#0f7a57] px-2.5 text-[8.5px] leading-6 font-semibold text-white", big && "h-9 px-4 text-[12px] leading-9")}>Send it</span>
        </div>
      </div>
    </div>
  );
}

/** A dark glass browser frame around a picture. `url` puts a little address pill in the bar. */
export function Browser({ children, className, url }: { children: ReactNode; className?: string; url?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl bg-[var(--sk-frame)] shadow-[0_40px_90px_-40px_rgb(0_0_0/0.95),0_0_60px_-30px_rgb(124_92_255/0.7),inset_0_0_0_1px_rgb(255_255_255/0.09),inset_0_1px_0_rgb(255_255_255/0.12)]",
        className,
      )}
    >
      <div className="flex h-8 items-center gap-1.5 border-b border-white/[0.07] bg-white/[0.03] px-3">
        <span className="size-2 rounded-full bg-[var(--sk-pink)]/70" />
        <span className="size-2 rounded-full bg-[var(--sk-gold)]/70" />
        <span className="size-2 rounded-full bg-[var(--sk-mint)]/70" />
        {url ? (
          <span className="mx-auto flex max-w-[70%] items-center gap-1 truncate rounded-full bg-white/[0.05] px-2.5 py-0.5 text-[10px] text-white/45 ring-1 ring-white/[0.06]">
            <LockIcon className="size-2.5 shrink-0" />
            <span className="truncate">{url}</span>
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

// Five image ads, labelled the way the course labels them. The page's night palette: violet into pink.
const ADS: { id: string; line: string; art: string }[] = [
  { id: "S1", line: "5am. Again?", art: "bg-[linear-gradient(150deg,#1a0e4a,#5b33e8)]" },
  { id: "S2", line: "Keep up all summer.", art: "bg-[linear-gradient(160deg,#2a0f45,#c23f8c)]" },
  { id: "S3", line: "The 20-minute rule.", art: "bg-[linear-gradient(140deg,#24145f,#7c5cff)]" },
  { id: "S4", line: "The garage counts.", art: "bg-[linear-gradient(170deg,#13092e,#4a22cf)]" },
  { id: "S5", line: "Dad strength is real.", art: "bg-[linear-gradient(150deg,#4a22cf,#ff6fae)]" },
];

export function FiveAds({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-5 gap-1.5 sm:gap-2.5", className)}>
      {ADS.map((ad, i) => (
        <div key={ad.id} className={cn(MINI, "flex flex-col gap-1.5 p-1.5", i % 2 === 1 && "sm:-translate-y-2")}>
          <div className={cn("relative flex aspect-[4/5] items-end overflow-hidden rounded-lg p-1.5 sm:p-2", ad.art)}>
            <span className="bg-stars absolute inset-0 text-white/40" />
            <span className="absolute inset-0 bg-[linear-gradient(180deg,rgb(255_255_255/0.12),transparent_35%,rgb(0_0_0/0.35))]" />
            {/* Too narrow for words on a phone: the picture and its label carry it there. */}
            <span className="relative hidden font-display text-[13px] leading-[1.02] tracking-[-0.02em] text-white sm:block">{ad.line}</span>
          </div>
          <span className="px-0.5 pb-0.5 text-[10px] font-semibold text-white/45 tabular-nums">{ad.id}</span>
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
            d < today && "bg-[var(--sk-mint)]/12 text-[var(--sk-mint)] ring-1 ring-[var(--sk-mint)]/25 ring-inset",
            d === today && "bg-[linear-gradient(135deg,#7c5cff,#ff6fae)] text-white shadow-[0_0_18px_-3px_rgb(124_92_255/0.9),inset_0_1px_0_rgb(255_255_255/0.3)]",
            d > today && "bg-white/[0.05] text-white/35",
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
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-[linear-gradient(160deg,rgb(124_92_255/0.24),rgb(255_111_174/0.07)_60%,rgb(255_255_255/0.02))] p-4 ring-1 ring-white/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_20px_50px_-30px_rgb(124_92_255/0.8)]",
        className,
      )}
    >
      <span aria-hidden className="absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(201_184_255/0.8),transparent)]" />
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-bold tracking-[0.14em] text-[var(--sk-lilac)] uppercase">Up next · Day {day}</div>
          <div className="mt-1.5 font-display text-[24px] leading-[1.05] tracking-[-0.03em] text-white">{title}</div>
          <div className="mt-1.5 text-[13px] leading-snug text-white/60">{body}</div>
        </div>
        <Penny size={44} className="shrink-0 drop-shadow-[0_6px_14px_rgb(124_92_255/0.35)]" />
      </div>
      <WeekDots today={day} className="mt-4" />
    </div>
  );
}

/** Soft bars standing in for the lines of a lesson or a post. */
export function TextBars({ widths, className }: { widths: string[]; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {widths.map((w, i) => (
        <span key={i} className={cn("h-1.5 rounded-full bg-white/10", w)} />
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
        state === "done" && MINI,
        state === "now" && "bg-[#7c5cff]/[0.14] ring-1 ring-[var(--sk-lilac)]/55 shadow-[0_0_26px_-8px_rgb(124_92_255/0.9),inset_0_1px_0_rgb(255_255_255/0.08)]",
        state === "later" && "ring-1 ring-white/[0.07] ring-inset",
        className,
      )}
    >
      <span
        className={cn(
          "relative grid size-5 shrink-0 place-items-center rounded-full",
          state === "done" && "bg-[var(--sk-mint)]/15 text-[var(--sk-mint)] ring-1 ring-[var(--sk-mint)]/30",
          state === "now" && "bg-[#7c5cff]/30 text-[var(--sk-lilac)]",
          state === "later" && "bg-white/[0.05] text-white/30",
        )}
      >
        {state === "done" ? (
          <CheckIcon className="size-3" strokeWidth={3} />
        ) : (
          <>
            {state === "now" ? <span className="absolute inset-0 animate-ping rounded-full bg-[#7c5cff]/40 motion-reduce:hidden" /> : null}
            <span className="size-1.5 rounded-full bg-current" />
          </>
        )}
      </span>
      <span className={cn("min-w-0 truncate font-medium", state === "now" ? "text-white" : state === "done" ? "text-white/55" : "text-white/40")}>{children}</span>
    </div>
  );
}
