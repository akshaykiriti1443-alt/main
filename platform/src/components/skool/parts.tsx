import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PENNY_POINT, PENNY_WAVE, PENNY_WINK } from "@/components/penny-art";
import { PETE_POSTING, PETE_SHRUG, PETE_VIEWBOX, PETE_WAVE } from "./pete-art";

// The small pieces every section of the /skool page shares. Server components, theme tokens only.

export type Cta = { href: string; label: string };

/** The raised white card every section uses. */
export const CARD = "rounded-3xl bg-card shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.07]";
/** The soft violet well a product picture sits in. */
export const WELL =
  "bg-[radial-gradient(120%_100%_at_50%_0%,var(--accent),var(--background))] ring-1 ring-ink/[0.04] dark:bg-[radial-gradient(120%_100%_at_50%_0%,rgb(118_85_245/0.14),transparent)] dark:ring-white/[0.05]";
/** A small card inside a product picture. */
export const MINI = "rounded-xl bg-card shadow-card ring-1 ring-ink/[0.05] dark:ring-white/[0.07]";
/** Violet as text: the one accent. */
export const ACCENT = "text-primary dark:text-violet-300";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-5 md:px-8", className)}>{children}</div>;
}

export function SectionHead({ eyebrow, title, sub, align = "left", className }: { eyebrow: string; title: ReactNode; sub?: ReactNode; align?: "left" | "center"; className?: string }) {
  return (
    <div className={cn("reveal flex max-w-3xl flex-col gap-4", align === "center" && "mx-auto items-center text-center", className)}>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="font-display text-[38px] leading-[1.02] tracking-[-0.015em] text-foreground md:text-[58px]">{title}</h2>
      {sub ? <p className="max-w-[58ch] text-[16px] leading-relaxed text-pretty text-muted-foreground md:text-[18px]">{sub}</p> : null}
    </div>
  );
}

/** The accent half of a headline. */
export function Em({ children }: { children: ReactNode }) {
  return <em className={cn("italic", ACCENT)}>{children}</em>;
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
    <span className={cn("inline-flex h-6 items-center rounded-full bg-accent px-2.5 text-[12px] font-semibold whitespace-nowrap text-accent-foreground ring-1 ring-violet-200/70 ring-inset dark:ring-white/[0.07]", className)}>
      {children}
    </span>
  );
}

/** A round tick, for lists of things that are true. */
export function Tick({ className }: { className?: string }) {
  return (
    <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent", ACCENT, className)} aria-hidden>
      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6.5l2.3 2.3 4.7-5.3" />
      </svg>
    </span>
  );
}
