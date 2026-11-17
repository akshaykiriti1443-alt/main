"use client";

import { HeartIcon, MessageCircleIcon, PenLineIcon, PlayIcon, SendIcon } from "lucide-react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

// ReelVault's picture: three phone-shaped reels that start stacked and fan out in 3D as the panel
// scrolls in, the front one floating gently. Made-up reels, no real creator, no numbers.
// With reduced motion they simply sit fanned and still.

type Phone = { art: string; to: { x: string; rz: number; ry: number; y: number; s: number } };

const PHONES: Phone[] = [
  { art: "bg-[linear-gradient(165deg,#2a0f45,#c23f8c)]", to: { x: "-56%", rz: -11, ry: 22, y: 26, s: 0.86 } },
  { art: "bg-[linear-gradient(165deg,#13092e,#4a22cf)]", to: { x: "56%", rz: 10, ry: -22, y: 34, s: 0.86 } },
  { art: "bg-[linear-gradient(160deg,#1a0e4a,#7c5cff_70%,#ff8cc1)]", to: { x: "0%", rz: 0, ry: 0, y: 0, s: 1 } },
];

// The three parts of a reel, as the segments of its progress bar.
const SEGMENTS = [
  { w: "w-[22%]", c: "bg-[var(--sk-lilac)]" },
  { w: "flex-1", c: "bg-[var(--sk-pink)]" },
  { w: "w-[20%]", c: "bg-[var(--sk-gold)]" },
];

function Screen({ art, front }: { art: string; front?: boolean }) {
  return (
    <div className={cn("relative size-full overflow-hidden rounded-[26px] ring-1 ring-white/15", art)}>
      <span className="bg-stars absolute inset-0 text-white/40" />
      <span className="absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.15),transparent_30%,transparent_55%,rgb(0_0_0/0.55))]" />
      {/* The notch */}
      <span className="absolute top-2 left-1/2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-black/40" />
      {/* Caption lines standing in for what's said */}
      <span className="absolute inset-x-3 bottom-9 flex flex-col gap-1.5">
        <span className="h-1.5 w-[72%] rounded-full bg-white/70" />
        <span className="h-1.5 w-[48%] rounded-full bg-white/40" />
      </span>
      {/* The side buttons every reel has */}
      <span className="absolute right-2.5 bottom-20 flex flex-col items-center gap-3 text-white/80">
        <HeartIcon className="size-4" />
        <MessageCircleIcon className="size-4" />
        <SendIcon className="size-4" />
      </span>
      {front ? (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-12 place-items-center rounded-full bg-white/20 ring-1 ring-white/30 backdrop-blur-md">
            <PlayIcon className="ml-0.5 size-5 fill-white text-white" />
          </span>
        </span>
      ) : null}
      <span className="absolute inset-x-3 bottom-3.5 flex gap-1">
        {SEGMENTS.map((s) => (
          <span key={s.c} className={cn("h-1 rounded-full", s.w, front ? s.c : "bg-white/40")} />
        ))}
      </span>
    </div>
  );
}

function PhoneCard({ p, i, progress, reduce }: { p: Phone; i: number; progress: MotionValue<number>; reduce: boolean }) {
  const front = i === PHONES.length - 1;
  const x = useTransform(progress, [0, 1], ["0%", p.to.x]);
  const rotate = useTransform(progress, [0, 1], [0, p.to.rz]);
  const rotateY = useTransform(progress, [0, 1], [0, p.to.ry]);
  const y = useTransform(progress, [0, 1], [front ? 30 : 60, p.to.y]);
  const scale = useTransform(progress, [0, 1], [front ? 0.94 : 0.8, p.to.s]);
  const style = reduce ? { x: p.to.x, rotate: p.to.rz, rotateY: p.to.ry, y: p.to.y, scale: p.to.s } : { x, rotate, rotateY, y, scale };
  return (
    <motion.div className="absolute top-0 left-1/2 -ml-[min(22%,100px)] aspect-[9/16] w-[min(44%,200px)]" style={style}>
      <motion.div
        className={cn("sk-island size-full rounded-[30px] bg-[#0a0718] p-1.5", front ? "shadow-[0_40px_90px_-30px_rgb(0_0_0/1),0_0_70px_-20px_rgb(124_92_255/0.9),inset_0_0_0_1px_rgb(255_255_255/0.18)]" : "opacity-80 shadow-[0_30px_70px_-30px_rgb(0_0_0/1),inset_0_0_0_1px_rgb(255_255_255/0.1)]")}
        animate={reduce || !front ? undefined : { y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <Screen art={p.art} front={front} />
      </motion.div>
    </motion.div>
  );
}

/** The fanned stack of reels, with the script you get out of it floating over the corner. */
export function RvReels({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.95", "center 0.6"] });
  const progress = useSpring(scrollYProgress, { stiffness: 100, damping: 22, mass: 0.4 });
  const cardY = useTransform(progress, [0, 1], [40, 0]);
  const cardO = useTransform(progress, [0.4, 1], [0, 1]);
  return (
    <div ref={ref} aria-hidden className={cn("relative mx-auto h-[330px] w-full max-w-[460px] [perspective:1400px] sm:h-[420px] md:h-[440px]", className)}>
      {PHONES.map((p, i) => (
        <PhoneCard key={i} p={p} i={i} progress={progress} reduce={reduce} />
      ))}
      <motion.div
        className="absolute right-0 -bottom-2 z-10 w-[56%] max-w-[230px] rounded-2xl bg-[var(--sk-frame)] p-3.5 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.95),0_0_40px_-16px_rgb(255_111_174/0.7),inset_0_0_0_1px_rgb(255_255_255/0.12),inset_0_1px_0_rgb(255_255_255/0.16)] backdrop-blur-xl sm:right-[-4%]"
        style={reduce ? undefined : { y: cardY, opacity: cardO }}
      >
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-white">
          <PenLineIcon className="size-3.5 text-[var(--sk-pink)]" /> Your version
        </div>
        <div className="mt-2.5 flex flex-col gap-1.5">
          {SEGMENTS.map((s, i) => (
            <span key={s.c} className="flex items-center gap-2">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.c)} />
              <span className={cn("h-1.5 rounded-full bg-white/15", i === 0 ? "w-[90%]" : i === 1 ? "w-[75%]" : "w-[55%]")} />
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
