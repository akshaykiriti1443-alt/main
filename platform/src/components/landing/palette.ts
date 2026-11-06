// Brand palette for members' public pages. Every colour a page needs is derived from the one brand
// colour the member picks, and every text/background pair is checked against WCAG AA (4.5:1), so any
// brand colour (pale yellow, near-black, neon) stays readable. Pure functions, no dependencies:
// it runs on the server for public pages and in the browser for the editor preview.

type Rgb = [number, number, number]; // 0..255
type Oklch = [number, number, number]; // L 0..1, C, h degrees

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x2a44ee;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
}

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (l: number) => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToOklch(rgb: Rgb): Oklch {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return [L, C, h];
}

function oklchToLinear([L, C, h]: Oklch): [number, number, number] {
  const A = C * Math.cos((h * Math.PI) / 180);
  const B = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH -> hex, pulling chroma in until the colour fits sRGB (keeps hue and lightness). */
export function oklch(L: number, C: number, h: number): string {
  let lo = 0;
  let hi = Math.max(0, C);
  const inGamut = (c: number) => oklchToLinear([clamp(L), c, h]).every((v) => v >= -0.0005 && v <= 1.0005);
  if (!inGamut(hi)) {
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(mid)) lo = mid;
      else hi = mid;
    }
    hi = lo;
  }
  return rgbToHex(oklchToLinear([clamp(L), hi, h]).map((v) => fromLinear(clamp(v))) as Rgb);
}

/** Mix two colours in sRGB; t = share of b. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb);
}

/** Move a colour's lightness (keeping its hue) until it reaches `target` contrast on every background. */
export function readableOn(color: string, backgrounds: string[], target = 4.5): string {
  const ok = (c: string) => backgrounds.every((bg) => contrast(c, bg) >= target);
  if (ok(color)) return color;
  const [L, C, h] = rgbToOklch(hexToRgb(color));
  const darkBgs = backgrounds.every((bg) => luminance(bg) < 0.18);
  const dir = darkBgs ? 1 : -1;
  for (let step = 1; step <= 100; step++) {
    const next = oklch(L + dir * step * 0.01, C, h);
    if (ok(next)) return next;
  }
  return darkBgs ? "#ffffff" : "#000000";
}

const WHITE = "#ffffff";

export type LandingStyle = "bold" | "clean" | "dark" | "editorial" | "luxe";

// Fixed neutrals per style (brand-tinted ones are computed below).
export const PAPER = "#f6f2ea";
export const PAPER_ALT = "#eee8dc";
export const PAPER_INK = "#1d1a16";

export type BrandPalette = Record<`--lp-${string}`, string>;

/**
 * Every brand-derived colour a page uses, as CSS custom properties. Pairs that carry text are
 * contrast-checked here; landing.css only decides which pair each style uses.
 */
export function brandPalette(brandHex: string): BrandPalette {
  const brand = rgbToHex(hexToRgb(brandHex));
  const [, C, h] = rgbToOklch(hexToRgb(brand));
  // Near-greys keep a neutral tint; colourful brands tint the neutrals a little.
  const tintC = Math.min(C, 0.25);
  const n = (L: number, k: number) => oklch(L, tintC * k, h);

  // Text on the brand colour: white when it reads, otherwise a deep ink in the brand's own hue.
  const deepInk = n(0.2, 0.25);
  const onBrand = contrast(WHITE, brand) >= 4.5 ? WHITE : contrast(deepInk, brand) >= 4.5 ? deepInk : "#000000";
  const lightText = onBrand === WHITE;

  // Two more brand stops for gradients. Each only moves the way that keeps the on-brand text at AA.
  const [bL, bC] = rgbToOklch(hexToRgb(brand));
  const stop = (dL: number, dh: number) => {
    for (const d of [dL, -dL * 0.75, dL * 0.4, -dL * 0.3]) {
      const c = oklch(bL + d, bC, h + dh);
      if (contrast(onBrand, c) >= 4.5) return c;
    }
    return brand;
  };
  const brand2 = stop(-0.08, 3);
  const brand3 = stop(0.045, -5);
  // Muted text on brand: a softened mix that still clears AA on every gradient stop.
  const mutedOnBrand = [0.26, 0.2, 0.14, 0.08, 0].map((t) => mix(onBrand, brand, t)).find((c) => [brand, brand2, brand3].every((s) => contrast(c, s) >= 4.5)) ?? onBrand;

  // Light surfaces.
  const tint1 = mix(WHITE, brand, 0.04);
  const tint2 = mix(WHITE, brand, 0.08);
  const tint3 = mix(WHITE, brand, 0.14);
  const tint4 = mix(WHITE, brand, 0.24);
  const lightInk = n(0.2, 0.12);
  const lightMuted = readableOn(n(0.5, 0.1), [WHITE, tint2, tint3]);
  const brandText = readableOn(brand, [WHITE, tint1, tint2, tint3, PAPER, PAPER_ALT]);

  // Dark surfaces (Midnight): near-black with a whisper of the brand hue.
  const darkBg = n(0.16, 0.12);
  const darkBg2 = n(0.19, 0.16);
  const darkSurface = n(0.215, 0.14);
  const darkLine = n(0.31, 0.12);
  const darkInk = n(0.965, 0.02);
  const darkMuted = readableOn(n(0.72, 0.05), [darkBg, darkBg2, darkSurface]);
  const brandTextDark = readableOn(oklch(Math.max(bL, 0.72), Math.min(bC, 0.16), h), [darkBg, darkBg2, darkSurface]);

  // Velvet (Luxe): a deep, saturated version of the brand's own hue.
  const luxeC = Math.min(C * 0.42, 0.075);
  const luxeBg = oklch(0.2, luxeC, h);
  const luxeBg2 = oklch(0.24, luxeC * 1.1, h + 6);
  const luxeSurface = oklch(0.255, luxeC * 0.9, h);
  const luxeLine = oklch(0.4, luxeC * 0.7, h);
  const luxeInk = oklch(0.95, 0.018, 80); // warm ivory
  const luxeMuted = readableOn(oklch(0.8, 0.025, 75), [luxeBg, luxeBg2, luxeSurface]);
  const luxeAccent = readableOn(oklch(Math.max(bL, 0.8), Math.min(bC, 0.09), h), [luxeBg, luxeBg2, luxeSurface]);

  // Buttons on dark pages need a visible edge (3:1 against the page) and readable text. A brand too
  // dark to show up (navy, near-black) flips to a light button with brand-coloured text instead.
  const btnOnDark = (bgs: string[], light: string) => {
    if (bgs.every((bg) => contrast(brand, bg) >= 3)) return [brand, contrast(WHITE, brand) >= 4.5 ? WHITE : readableOn(n(0.2, 0.25), [brand])] as const;
    if (bgs.some((bg) => contrast(brand, bg) < 1.8)) return [light, readableOn(brand, [light])] as const;
    const fill = readableOn(brand, bgs, 3.2);
    return [fill, contrast(WHITE, fill) >= 4.5 ? WHITE : readableOn(n(0.2, 0.25), [fill])] as const;
  };
  const [btnDark, onBtnDark] = btnOnDark([darkBg, darkBg2, darkSurface], darkInk);
  const [btnLuxe, onBtnLuxe] = btnOnDark([luxeBg, luxeBg2, luxeSurface], luxeInk);

  // Light pages with a pale brand: the button fill gets an ink edge so it never melts into white.
  const btnEdge = contrast(brand, WHITE) < 1.6 ? mix(brand, lightInk, 0.28) : brand;

  const [r, g, b] = hexToRgb(brand);
  return {
    "--lp-brand": brand,
    "--lp-brand-rgb": `${r} ${g} ${b}`,
    "--lp-brand-2": brand2,
    "--lp-brand-3": brand3,
    "--lp-on-brand": onBrand,
    "--lp-on-brand-muted": mutedOnBrand,
    "--lp-on-brand-rgb": hexToRgb(onBrand).join(" "),
    // Text on an inverted (on-brand coloured) button sitting on a brand panel.
    "--lp-inv-ink": lightText ? brandText : brand,
    "--lp-btn-edge": btnEdge,
    "--lp-brand-text": brandText,
    "--lp-tint-1": tint1,
    "--lp-tint-2": tint2,
    "--lp-tint-3": tint3,
    "--lp-tint-4": tint4,
    "--lp-light-ink": lightInk,
    "--lp-light-muted": lightMuted,
    "--lp-dark-bg": darkBg,
    "--lp-dark-bg-2": darkBg2,
    "--lp-dark-surface": darkSurface,
    "--lp-dark-line": darkLine,
    "--lp-dark-ink": darkInk,
    "--lp-dark-muted": darkMuted,
    "--lp-brand-text-dark": brandTextDark,
    "--lp-btn-dark": btnDark,
    "--lp-on-btn-dark": onBtnDark,
    "--lp-luxe-bg": luxeBg,
    "--lp-luxe-bg-2": luxeBg2,
    "--lp-luxe-surface": luxeSurface,
    "--lp-luxe-line": luxeLine,
    "--lp-luxe-ink": luxeInk,
    "--lp-luxe-muted": luxeMuted,
    "--lp-luxe-accent": luxeAccent,
    "--lp-btn-luxe": btnLuxe,
    "--lp-on-btn-luxe": onBtnLuxe,
  };
}

/** The page background per style, for the browser's theme-color and the document behind the page. */
export function pageBackground(style: string, brandHex: string): string {
  const p = brandPalette(brandHex);
  if (style === "dark") return p["--lp-dark-bg"];
  if (style === "luxe") return p["--lp-luxe-bg"];
  if (style === "editorial") return PAPER;
  return WHITE;
}
