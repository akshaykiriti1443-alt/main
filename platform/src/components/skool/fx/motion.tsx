"use client";

import Lenis from "lenis";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// The /skool page's motion kit. Patterns from the open-source libraries people copy most
// (Lenis smooth scroll, Motion scroll-linked transforms, Aceternity-style spotlight cards and
// scroll-lit words, Magic UI-style tilt). Every piece respects prefers-reduced-motion and the
// page reads fine with no JS at all.

/** Buttery page scroll (Lenis). Anchor links glide and stop under the sticky nav. */
export function SmoothScroll() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.11, autoRaf: true, anchors: { offset: -84 } });
    return () => lenis.destroy();
  }, []);
  return null;
}

/**
 * One pointer listener for the whole page: any element with .spot gets --mx/--my (the pointer's
 * spot inside it), which the CSS turns into a soft glow that follows the mouse.
 */
export function PointerGlow() {
  useEffect(() => {
    let last: HTMLElement | null = null;
    const move = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(".spot") ?? null;
      if (last && last !== el) last.removeAttribute("data-hover");
      last = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
      el.setAttribute("data-hover", "");
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);
  return null;
}

/** A thin glowing bar across the top that fills as you read. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const x = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 });
  return <motion.div aria-hidden style={{ scaleX: x }} className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-[linear-gradient(90deg,#7c5cff,#ff6fae,#ffd36f)]" />;
}

/** Rises, un-blurs and fades in the first time it scrolls into view. */
export function Rise({ children, className, delay = 0, y = 28, as = "div" }: { children: ReactNode; className?: string; delay?: number; y?: number; as?: "div" | "li" | "section" | "span" }) {
  const reduce = useReducedMotion();
  const M = motion[as];
  if (reduce) return <M className={className}>{children}</M>;
  return (
    <M
      className={className}
      initial={{ opacity: 0, y, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </M>
  );
}

/** Tilts toward the pointer in 3D, with a glare that follows it. */
export function Tilt({ children, className, max = 8 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 160, damping: 18 });
  const sy = useSpring(py, { stiffness: 160, damping: 18 });
  const rotateY = useTransform(sx, [0, 1], [-max, max]);
  const rotateX = useTransform(sy, [0, 1], [max, -max]);
  const gx = useTransform(sx, (v) => `${v * 100}%`);
  const gy = useTransform(sy, (v) => `${v * 100}%`);
  const glare = useMotionTemplate`radial-gradient(420px circle at ${gx} ${gy}, rgb(255 255 255 / 0.10), transparent 60%)`;
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <div className="[perspective:1400px]">
      <motion.div
        className={cn("relative [transform-style:preserve-3d]", className)}
        style={{ rotateX, rotateY }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          px.set((e.clientX - r.left) / r.width);
          py.set((e.clientY - r.top) / r.height);
        }}
        onPointerLeave={() => {
          px.set(0.5);
          py.set(0.5);
        }}
      >
        {children}
        <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: glare }} />
      </motion.div>
    </div>
  );
}

/** Moves slower (or faster) than the page as you scroll past: depth without WebGL. */
export function Parallax({ children, className, speed = 0.15 }: { children: ReactNode; className?: string; speed?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [`${speed * 100}%`, `${-speed * 100}%`]);
  return (
    <motion.div ref={ref} className={className} style={reduce ? undefined : { y }}>
      {children}
    </motion.div>
  );
}

function Word({ word, accent, progress, range }: { word: string; accent: boolean; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.16, 1]);
  return (
    <>
      <motion.span style={{ opacity }} className={cn("inline-block", accent && "sk-grad")}>
        {word}
      </motion.span>{" "}
    </>
  );
}

/**
 * A big statement whose words light up one by one as it scrolls through the screen.
 * Words wrapped in *stars* get the accent gradient.
 */
export function ScrollWords({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const words = text.split(/\s+/);
  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => {
        const accent = /^\*.*\*[.,!?]?$/.test(w);
        const clean = w.replace(/\*/g, "");
        const inner = <span className={accent ? "sk-grad" : undefined}>{clean}</span>;
        if (reduce) return <span key={i}>{inner} </span>;
        const start = i / words.length;
        return <Word key={i} word={clean} accent={accent} progress={scrollYProgress} range={[start, Math.min(1, start + 1.5 / words.length)]} />;
      })}
    </p>
  );
}
