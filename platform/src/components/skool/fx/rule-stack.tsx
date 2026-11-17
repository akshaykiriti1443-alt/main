"use client";

import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// The One-Before-You Rule, in motion: three Skool posts arrive squashed together in 3D and fan out
// into a neat thread as the section scrolls into view. With reduced motion they simply sit fanned.

type Pose = { y: number; x: number; rz: number; rx: number; s: number; o: number };

// Where each card starts (pulled into a tilted pile) and where it lands (a loose, readable fan).
const FROM: Pose[] = [
  { y: 150, x: 0, rz: -8, rx: 28, s: 0.88, o: 0.35 },
  { y: 30, x: 0, rz: 4, rx: 28, s: 0.92, o: 0.5 },
  { y: -110, x: 0, rz: 9, rx: 28, s: 0.88, o: 0.35 },
];
const TO: Pose[] = [
  { y: 0, x: -6, rz: -1.6, rx: 0, s: 1, o: 1 },
  { y: 0, x: 10, rz: 1.2, rx: 0, s: 1, o: 1 },
  { y: 0, x: -2, rz: -0.6, rx: 0, s: 1, o: 1 },
];

function StackCard({ i, progress, reduce, children }: { i: number; progress: MotionValue<number>; reduce: boolean; children: ReactNode }) {
  const f = FROM[i] ?? FROM[0];
  const t = TO[i] ?? TO[0];
  // Each card lands a little after the one above it.
  const start = i * 0.12;
  const range = [start, Math.min(1, start + 0.76)];
  const y = useTransform(progress, range, [f.y, t.y]);
  const x = useTransform(progress, range, [f.x, t.x]);
  const rotate = useTransform(progress, range, [f.rz, t.rz]);
  const rotateX = useTransform(progress, range, [f.rx, t.rx]);
  const scale = useTransform(progress, range, [f.s, t.s]);
  const opacity = useTransform(progress, range, [f.o, t.o]);
  return (
    <motion.div
      className="relative [transform-style:preserve-3d]"
      style={reduce ? { x: t.x, rotate: t.rz, zIndex: 3 - i } : { y, x, rotate, rotateX, scale, opacity, zIndex: 3 - i }}
    >
      {children}
    </motion.div>
  );
}

/** Three post cards (server-rendered) that fan out from a 3D pile as they scroll into view. */
export function RuleStack({ cards, className }: { cards: ReactNode[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.95", "center 0.55"] });
  const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 24, mass: 0.4 });
  return (
    <div ref={ref} className={cn("relative flex flex-col gap-4 [perspective:1600px] md:gap-5", className)}>
      {cards.map((c, i) => (
        <StackCard key={i} i={i} progress={progress} reduce={reduce}>
          {c}
        </StackCard>
      ))}
    </div>
  );
}

/** The connector behind the numbered steps: a hairline that fills with light as you read down. */
export function RuleLine({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.8", "end 0.55"] });
  return (
    <div ref={ref} aria-hidden className={cn("pointer-events-none w-px rounded-full bg-white/10", className)}>
      <motion.div
        className="h-full w-full origin-top rounded-full bg-[linear-gradient(180deg,#c9b8ff,#ff6fae_55%,#ffd36f)] shadow-[0_0_14px_1px_rgb(201_184_255/0.7)]"
        style={reduce ? undefined : { scaleY: scrollYProgress }}
      />
    </div>
  );
}
