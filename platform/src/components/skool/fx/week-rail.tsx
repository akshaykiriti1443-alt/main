"use client";

import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// The Week section's timeline: a hairline rail with a glowing line that fills as you scroll, a
// bright head riding its tip, and a node per day that lights up as the line reaches it. On phones
// the rail runs down the left edge; from lg it runs down the middle and the days alternate.
// With reduced motion the line is simply full and the nodes are simply lit.

/** Where the rail sits (the rail and every node share it). Rows leave room for it with pl-12 lg:pl-0. */
const RAIL_X = "left-[19px] lg:left-1/2";

export function WeekRail({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.7", "end 0.55"] });
  const fill = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.35 });
  const top = useTransform(fill, (v) => `${v * 100}%`);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 w-0", RAIL_X)}>
        {/* the track */}
        <div className="absolute inset-y-0 -left-px w-[2px] bg-white/[0.08] [mask-image:linear-gradient(transparent,black_4%,black_96%,transparent)]" />
        {/* the light */}
        <motion.div
          className="absolute inset-y-0 -left-px w-[2px] origin-top bg-[linear-gradient(180deg,#c9b8ff,#7c5cff_35%,#ff6fae_75%,#ffd36f)] shadow-[0_0_18px_2px_rgb(124_92_255/0.55)]"
          style={{ scaleY: reduce ? 1 : fill }}
        />
        {/* the head */}
        {reduce ? null : (
          <motion.div className="absolute -left-[7px] size-[14px] -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgb(201_184_255/0.25),0_0_28px_6px_rgb(255_111_174/0.65)]" style={{ top }} />
        )}
      </div>
      {children}
    </div>
  );
}

/** A day's dot on the rail. It lights when the day scrolls into the middle of the screen. */
export function WeekNode({ className, gold }: { className?: string; gold?: boolean }) {
  const reduce = useReducedMotion();
  const lit = gold
    ? "0 0 0 5px rgb(255 211 111 / 0.16), 0 0 30px 4px rgb(255 211 111 / 0.55)"
    : "0 0 0 5px rgb(124 92 255 / 0.18), 0 0 30px 4px rgb(124 92 255 / 0.6)";
  return (
    <motion.span
      aria-hidden
      className={cn("absolute z-10 grid size-[22px] -translate-x-1/2 place-items-center rounded-full bg-[var(--card)] ring-1 ring-white/25", RAIL_X, className)}
      initial={reduce ? false : { scale: 0.55, opacity: 0.5, boxShadow: "0 0 0 0px rgb(0 0 0 / 0)" }}
      whileInView={{ scale: 1, opacity: 1, boxShadow: lit }}
      viewport={{ once: true, margin: "0px 0px -42% 0px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className={cn("size-2 rounded-full", gold ? "bg-[var(--sk-gold)]" : "bg-[linear-gradient(135deg,#ffffff,#c9b8ff_45%,#ff6fae)]")} />
    </motion.span>
  );
}
