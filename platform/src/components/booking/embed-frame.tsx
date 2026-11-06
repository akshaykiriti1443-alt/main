"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** The iframe this page sits in, when the page around it is on the same site (null otherwise). */
export function hostFrame(): HTMLElement | null {
  try {
    return (window.frameElement as HTMLElement | null) ?? null;
  } catch {
    return null;
  }
}

/** Scrolls the host page so the frame's top is in view (after a step makes the frame shorter). */
export function revealHostFrame() {
  const f = hostFrame();
  if (f && f.getBoundingClientRect().top < 0) f.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * The booking page inside an iframe on the same site (?embed=1): keeps that iframe exactly as tall
 * as the content, so the host page (the ScaleitAds /apply card) never shows a second scrollbar.
 * Does nothing in a normal tab or in a frame on another site.
 */
export function EmbedFrame({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    const frame = hostFrame();
    if (!el || !frame) return;
    const fit = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) frame.style.height = `${h}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="flow-root p-1">
      {children}
    </div>
  );
}
