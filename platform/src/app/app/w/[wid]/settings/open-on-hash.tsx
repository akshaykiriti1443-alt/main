"use client";

import { useEffect } from "react";

/**
 * Settings keeps the rarely used sections folded away. A link like settings#channels should
 * still land on an open section, so open the <details> the hash points at (or sits inside).
 */
export function OpenOnHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      let node: HTMLElement | null = el;
      let changed = false;
      while (node) {
        if (node instanceof HTMLDetailsElement && !node.open) {
          node.open = true;
          changed = true;
        }
        node = node.parentElement;
      }
      if (changed) requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
