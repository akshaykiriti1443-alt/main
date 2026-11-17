import type { ReactNode } from "react";
import { Reveal, REVEAL_BOOT } from "@/components/reveal";
import "./skool.css";
import { PointerGlow, ScrollProgress, SmoothScroll } from "./fx/motion";

/**
 * The frame both /skool pages share: smooth scroll, the pointer glow, the reading bar, the aurora
 * sky and film grain. The theme follows the visitor's choice (light by default, the sun/moon
 * button in the top bar switches), and skool.css has both palettes.
 */
export function SkoolShell({ children }: { children: ReactNode }) {
  return (
    <div className="sk-site relative min-h-svh overflow-x-clip">
      <script dangerouslySetInnerHTML={{ __html: REVEAL_BOOT }} />
      <Reveal />
      <SmoothScroll />
      <PointerGlow />
      <ScrollProgress />
      <div aria-hidden className="sk-aurora">
        <i />
        <i />
        <i />
      </div>
      <div aria-hidden className="sk-grain" />
      <div className="relative z-[2]">{children}</div>
    </div>
  );
}
