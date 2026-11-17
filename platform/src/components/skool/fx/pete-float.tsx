"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** Pete bobbing gently on his stage, like he's waiting for a notification. Still with reduced motion. */
export function PeteFloat({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      animate={reduce ? undefined : { y: [0, -12, 0], rotate: [0, -1.5, 0] }}
      transition={{ duration: 5.5, delay, repeat: Infinity, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}
