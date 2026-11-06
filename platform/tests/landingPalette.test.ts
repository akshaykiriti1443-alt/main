import { describe, expect, it } from "vitest";
import { PAPER, PAPER_ALT, brandPalette, contrast, mix, pageBackground } from "@/components/landing/palette";

// A spread of brand colours members actually pick, plus the awkward ones (pale, neon, near-black, white).
const BRANDS = ["#2A44EE", "#0F766E", "#E11D48", "#111827", "#FDE047", "#22C55E", "#F97316", "#7C3AED", "#06B6D4", "#EC4899", "#FFFFFF", "#000000", "#808080", "#A3E635", "#1E3A8A", "#B45309"];
const AA = 4.5;

describe("landing palette", () => {
  for (const hex of BRANDS) {
    const p = brandPalette(hex);
    it(`${hex}: every text pair clears WCAG AA`, () => {
      const white = "#ffffff";
      // Text on the brand colour and its gradient stops (hero, buttons, panels).
      for (const bg of [p["--lp-brand"], p["--lp-brand-2"], p["--lp-brand-3"]]) {
        expect(contrast(p["--lp-on-brand"], bg)).toBeGreaterThanOrEqual(AA);
        expect(contrast(p["--lp-on-brand-muted"], bg)).toBeGreaterThanOrEqual(AA);
      }
      // Inverted button on a brand panel.
      expect(contrast(p["--lp-inv-ink"], p["--lp-on-brand"])).toBeGreaterThanOrEqual(AA);
      // Light pages (Brand, Studio, Editorial).
      for (const bg of [white, p["--lp-tint-1"], p["--lp-tint-2"], p["--lp-tint-3"], PAPER, PAPER_ALT]) {
        expect(contrast(p["--lp-brand-text"], bg)).toBeGreaterThanOrEqual(AA);
      }
      for (const bg of [white, p["--lp-tint-1"], p["--lp-tint-2"], p["--lp-tint-3"]]) {
        expect(contrast(p["--lp-light-ink"], bg)).toBeGreaterThanOrEqual(AA);
        expect(contrast(p["--lp-light-muted"], bg)).toBeGreaterThanOrEqual(AA);
      }
      // Midnight.
      for (const bg of [p["--lp-dark-bg"], p["--lp-dark-bg-2"], p["--lp-dark-surface"]]) {
        expect(contrast(p["--lp-dark-ink"], bg)).toBeGreaterThanOrEqual(AA);
        expect(contrast(p["--lp-dark-muted"], bg)).toBeGreaterThanOrEqual(AA);
        expect(contrast(p["--lp-brand-text-dark"], bg)).toBeGreaterThanOrEqual(AA);
        expect(contrast(p["--lp-btn-dark"], bg)).toBeGreaterThanOrEqual(3); // the button's edge
      }
      expect(contrast(p["--lp-on-btn-dark"], p["--lp-btn-dark"])).toBeGreaterThanOrEqual(AA);
      // Luxe.
      for (const bg of [p["--lp-luxe-bg"], p["--lp-luxe-bg-2"], p["--lp-luxe-surface"]]) {
        expect(contrast(p["--lp-luxe-ink"], bg)).toBeGreaterThanOrEqual(AA);
        expect(contrast(p["--lp-luxe-muted"], bg)).toBeGreaterThanOrEqual(AA);
        expect(contrast(p["--lp-luxe-accent"], bg)).toBeGreaterThanOrEqual(AA);
        expect(contrast(p["--lp-btn-luxe"], bg)).toBeGreaterThanOrEqual(3);
      }
      expect(contrast(p["--lp-on-btn-luxe"], p["--lp-btn-luxe"])).toBeGreaterThanOrEqual(AA);
    });
  }

  it("keeps the fixed Editorial neutrals readable", () => {
    expect(contrast("#1d1a16", PAPER)).toBeGreaterThanOrEqual(AA);
    expect(contrast("#5d554b", PAPER)).toBeGreaterThanOrEqual(AA);
    expect(contrast("#5d554b", PAPER_ALT)).toBeGreaterThanOrEqual(AA);
    // Muted paper text on the Editorial ink panel.
    expect(contrast(mix("#1d1a16", PAPER, 0.74), "#1d1a16")).toBeGreaterThanOrEqual(AA);
  });

  it("falls back safely on a bad colour and picks a background per style", () => {
    expect(brandPalette("nope")["--lp-brand"]).toBe("#2a44ee");
    expect(pageBackground("editorial", "#2A44EE")).toBe(PAPER);
    expect(pageBackground("bold", "#2A44EE")).toBe("#ffffff");
    expect(pageBackground("dark", "#2A44EE")).toMatch(/^#[0-9a-f]{6}$/);
  });
});
