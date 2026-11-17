import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PENNY_POINT, PENNY_WAVE, PENNY_WINK } from "@/components/penny-art";
import { PETE_POSTING, PETE_SHRUG, PETE_VIEWBOX, PETE_WAVE } from "./pete-art";

// The small pieces every section of the /skool page shares. Server components, theme tokens only.

export type Cta = { href: string; label: string };

/** The raised white card every section uses. */
export const CARD = "sk-glass spot rounded-[28px]";
/** The soft violet well a product picture sits in. */
export const WELL =
  "bg-[radial-gradient(120%_100%_at_50%_0%,var(--accent),var(--background))] ring-1 ring-ink/[0.04] dark:bg-[radial-gradient(120%_100%_at_50%_0%,rgb(118_85_245/0.14),transparent)] dark:ring-white/[0.05]";
/** A small card inside a product picture. */
export const MINI = "rounded-xl bg-white/[0.045] ring-1 ring-white/[0.08] shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]";
/** Violet as text: the one accent. */
export const ACCENT = "text-violet-300";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1240px] px-5 md:px-8", className)}>{children}</div>;
}

export function SectionHead({ eyebrow, title, sub, align = "left", className }: { eyebrow: string; title: ReactNode; sub?: ReactNode; align?: "left" | "center"; className?: string }) {
  return (
    <div className={cn("reveal flex max-w-4xl flex-col gap-5", align === "center" && "mx-auto items-center text-center", className)}>
      <span className="sk-eyebrow">{eyebrow}</span>
      <h2 className="sk-h2 text-white">{title}</h2>
      {sub ? <p className="max-w-[60ch] text-[16.5px] leading-relaxed text-pretty text-white/60 md:text-[19px]">{sub}</p> : null}
    </div>
  );
}

/** The accent half of a headline: a light gradient, not italics (the display face has none). */
export function Em({ children }: { children: ReactNode }) {
  return <em className="sk-grad not-italic">{children}</em>;
}

const PENNY = { wave: PENNY_WAVE, point: PENNY_POINT, wink: PENNY_WINK } as const;

export function Penny({ size = 48, pose = "wave", full, className }: { size?: number; pose?: keyof typeof PENNY; full?: boolean; className?: string }) {
  return <svg viewBox={full ? "0 0 200 200" : "22 14 152 152"} width={size} height={size} className={className} aria-hidden dangerouslySetInnerHTML={{ __html: PENNY[pose] }} />;
}

const PETE = { posting: PETE_POSTING, shrug: PETE_SHRUG, wave: PETE_WAVE } as const;

/** Pete, from the course pictures. Decorative: the words beside him always say who he is. */
export function Pete({ size = 120, pose = "posting", flip, className }: { size?: number; pose?: keyof typeof PETE; flip?: boolean; className?: string }) {
  return (
    <svg
      viewBox={PETE_VIEWBOX}
      width={size}
      height={Math.round((size * 236) / 268)}
      className={cn(flip && "-scale-x-100", className)}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: PETE[pose] }}
    />
  );
}

/** The name of a menu item in the app, written the way the menu writes it. */
export function MenuChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full bg-violet-400/10 px-2.5 text-[12px] font-semibold whitespace-nowrap text-violet-200 ring-1 ring-violet-300/20 ring-inset", className)}>
      {children}
    </span>
  );
}

/** A round tick, for lists of things that are true. */
export function Tick({ className }: { className?: string }) {
  return (
    <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-violet-400/15 ring-1 ring-violet-300/25", ACCENT, className)} aria-hidden>
      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6.5l2.3 2.3 4.7-5.3" />
      </svg>
    </span>
  );
}
