"use client";

import { useEffect } from "react";

/**
 * Marketing motion, kept calm: elements with .reveal rise softly into view once, and the
 * sticky nav gains its hairline after the first scroll (html[data-scrolled]). The inline
 * script runs before paint so nothing flashes; without JS everything is simply visible.
 */
export const REVEAL_BOOT = `document.documentElement.classList.add('js-reveal');window.__revealT=setTimeout(function(){document.querySelectorAll('.reveal').forEach(function(e){e.classList.add('is-in')})},4000);`;

export function Reveal() {
  useEffect(() => {
    const w = window as unknown as { __revealT?: number };
    if (w.__revealT) clearTimeout(w.__revealT);
    const root = document.documentElement;
    root.classList.add("js-reveal");
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    els.forEach((el) => io.observe(el));
    const onScroll = () => root.toggleAttribute("data-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      root.removeAttribute("data-scrolled");
      root.classList.remove("js-reveal");
    };
  }, []);
  return null;
}
