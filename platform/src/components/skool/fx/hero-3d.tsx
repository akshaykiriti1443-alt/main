"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

// Loads the 3D hero only in the browser, only when WebGL works, and only draws while the hero is
// on screen. Without WebGL the CSS glow behind it is the whole picture, which still looks right.
const HeroScene = dynamic(() => import("./hero-scene"), { ssr: false, loading: () => null });

export function Hero3D({ className }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<{ ok: boolean; still: boolean; lite: boolean }>({ ok: false, still: false, lite: false });
  const [active, setActive] = useState(true);
  const [shown, setShown] = useState(false);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  useEffect(() => {
    let ok = false;
    try {
      const c = document.createElement("canvas");
      ok = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      ok = false;
    }
    setMode({ ok, still: matchMedia("(prefers-reduced-motion: reduce)").matches, lite: matchMedia("(max-width: 767px)").matches || (navigator.hardwareConcurrency ?? 8) <= 4 });
    const t = setTimeout(() => setShown(true), 150);
    const el = box.current;
    if (!el) return () => clearTimeout(t);
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => {
      clearTimeout(t);
      io.disconnect();
    };
  }, []);

  return (
    <div ref={box} aria-hidden className={cn("transition-opacity duration-[1600ms] ease-out", shown ? "opacity-100" : "opacity-0", className)}>
      {mode.ok ? <HeroScene active={active} still={mode.still} lite={mode.lite} dark={dark} /> : null}
    </div>
  );
}
