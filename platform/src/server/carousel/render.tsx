// "Make my carousel": each slide drawn by code (next/og, no image model and no outside service), in the
// same Glass style as the member's Skool cover and website: soft aurora light from their brand colour,
// a frosted card, the big words in Bricolage. 1080×1350, Instagram's portrait post.
import { ImageResponse } from "next/og";
import { brandPalette, hexToRgb, mix } from "@/components/landing/palette";
import { slugify } from "@/lib/util";
import { loadFonts } from "@/server/cover/skoolCover";
import { CAROUSEL_SIZE, slideRole, type CarouselDraft, type CarouselLook } from "./shape";
import { zipStore } from "./zip";

const { width: W, height: H } = CAROUSEL_SIZE;
const SIDE = 64;
const CARD = { left: 48, top: 150, width: W - 96, height: 1052 };
const CARD_PAD_X = 76;
const CARD_PAD_Y = 76;
/** The text column inside the card. */
const TEXT_W = CARD.width - CARD_PAD_X * 2;
const TEXT_H = CARD.height - CARD_PAD_Y * 2;
const ORB = 132;
const PARA_GAP = 10;
const LIST_GAP = 22;
const RULE_PAD = 30;

const rgba = (hex: string, a: number) => `rgba(${hexToRgb(hex).join(",")},${a})`;
const fit = (len: number, steps: [number, number][]) => (steps.find(([n]) => len <= n) ?? steps[steps.length - 1])[1];

// ---------------------------------------------------------------------------
// Fitting: rough glyph widths (in em, tracking included) so a slide can pick the biggest sizes that still
// fit its card. Erring wide keeps real text inside; the card also clips as a last guard.

const BRICOLAGE = { wide: 0.86, upper: 0.64, narrow: 0.28, digit: 0.56, space: 0.22, other: 0.5 };
const JAKARTA = { wide: 0.86, upper: 0.68, narrow: 0.3, digit: 0.6, space: 0.27, other: 0.54 };
type Widths = typeof BRICOLAGE;

function wordWidth(word: string, size: number, w: Widths): number {
  let em = 0;
  for (const ch of word) {
    em += ch === "\u00a0" ? w.space : /[MWmw@%]/.test(ch) ? w.wide : /[A-Z]/.test(ch) ? w.upper : /[ijlft.,:;'!|I()\-]/.test(ch) ? w.narrow : /\d/.test(ch) ? w.digit : w.other;
  }
  return em * size;
}

/** How many lines `text` wraps to at `size` in `width` (word by word, like the browser). */
export function wrapRows(text: string, size: number, width: number, w: Widths = BRICOLAGE): number {
  const space = w.space * size;
  let rows = 1;
  let x = 0;
  for (const word of text.split(/[ \t\r\n]+/).filter(Boolean)) {
    const ww = wordWidth(word, size, w);
    if (x > 0 && x + space + ww > width) {
      rows++;
      x = ww;
    } else x += (x > 0 ? space : 0) + ww;
    while (x > width) {
      rows++;
      x -= width;
    }
  }
  return rows;
}

export type SlideLayout = { head: number; body: number; num: number; gap: number; mark: boolean; height: number };

/**
 * The sizes for one slide: start from sizes picked by length, then shrink step by step until the
 * estimated height fits the card. The decoration (hook bar, call-to-action orb) goes first when tight.
 */
export function slideLayout(role: "hook" | "point" | "cta", heading: string, items: string[]): SlideLayout {
  const parts = headingParts(heading);
  const len = heading.length;
  const head0 =
    role === "hook"
      ? fit(len, [[14, 168], [24, 148], [36, 132], [50, 120], [66, 104], [999, 92]])
      : role === "cta"
        ? fit(len, [[14, 132], [24, 116], [36, 104], [50, 92], [66, 84], [999, 76]])
        : fit(len, [[12, 104], [20, 96], [30, 88], [44, 78], [60, 70], [999, 62]]);
  const chars = items.join(" ").length;
  const body0 = role === "hook" ? fit(chars, [[60, 42], [120, 38], [999, 34]]) : fit(chars, [[40, 46], [80, 42], [140, 38], [999, 34]]);
  const list = role === "point" && isList(items);

  const measure = (s: number, mark: boolean): SlideLayout => {
    const head = Math.round(head0 * s);
    const body = Math.max(28, Math.round(body0 * Math.min(1, s * 1.15)));
    const gap = Math.round((role === "point" ? 38 : 46) * Math.max(s, 0.7));
    const num = role === "point" ? Math.round((len > 44 || chars > 120 ? 104 : 132) * Math.max(s, 0.75)) : 0;
    const headH = parts.reduce((h, part) => h + wrapRows(part, head, TEXT_W) * head * 1.04 + 6, 0) + (parts.length - 1) * head * 0.06;
    let bodyH = 0;
    if (items.length) {
      if (list) {
        const tick = Math.round(body * 0.82) + 10;
        bodyH = RULE_PAD + 2 + items.reduce((h, it) => h + Math.max(tick, wrapRows(it, body, TEXT_W - tick - 34, JAKARTA) * body * 1.3), 0) + (items.length - 1) * LIST_GAP;
      } else {
        bodyH = items.reduce((h, it) => h + wrapRows(it, body, TEXT_W, JAKARTA) * body * 1.34, 0) + (items.length - 1) * PARA_GAP + (role === "point" ? RULE_PAD + 2 : 0);
      }
    }
    const markH = !mark ? 0 : role === "hook" ? 12 : role === "cta" ? ORB : num * 0.92 + 4;
    const blocks = [markH, headH, bodyH].filter((h) => h > 0);
    const height = blocks.reduce((a, b) => a + b, 0) + (blocks.length - 1) * gap;
    return { head, body, num, gap, mark, height };
  };

  let last = measure(1, true);
  for (let s = 1; s >= 0.5; s -= 0.04) {
    last = measure(s, true);
    if (last.height <= TEXT_H) return last;
    // Past a little shrinking, the bar or the orb makes room first. A point slide's number always stays.
    if (s < 0.85 && role !== "point") {
      last = measure(s, false);
      if (last.height <= TEXT_H) return last;
    }
  }
  return last;
}

/** A slide's small words as items: its lines, or one line "a · b · c" split into its parts. */
export function slideItems(lines: string[]): string[] {
  if (lines.length === 1) {
    const parts = lines[0].split(/\s+[·•|]\s+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.length <= 4) return parts;
  }
  return lines;
}

/**
 * The big words split into sentences (each drawn on its own line, up to 3), with each sentence's last
 * space made non-breaking so its last word never sits alone. "Dr. Smith" style splits are avoided by
 * only splitting before a capital or a digit.
 */
export function headingParts(text: string): string[] {
  const split = text.split(/(?<=[.!?])\s+(?=["“A-Z0-9])/).filter(Boolean);
  // "1. Start small" and "Dr. Lee" are one line, not two.
  const parts: string[] = [];
  for (const s of split) {
    if (parts.length && parts[parts.length - 1].length <= 3) parts[parts.length - 1] += ` ${s}`;
    else parts.push(s);
  }
  const merged = parts.length > 3 ? [...parts.slice(0, 2), parts.slice(2).join(" ")] : parts;
  return merged.map(keepTogether);
}

/**
 * Joins words that look wrong apart with no-break spaces: a number or a tiny word stays with the word
 * after it ("6 gym", "a plan"), and a short last word stays with the one before it ("these 3.").
 * Groups stay short, so a line can still break somewhere sensible.
 */
function keepTogether(sentence: string): string {
  const groups: string[] = [];
  for (const word of sentence.split(" ").filter(Boolean)) {
    const prev = groups[groups.length - 1];
    const lastWord = prev?.split("\u00a0").pop() ?? "";
    if (prev !== undefined && (/^\d+$/.test(lastWord) || lastWord.length <= 2) && prev.length + word.length < 14) groups[groups.length - 1] = `${prev}\u00a0${word}`;
    else groups.push(word);
  }
  if (groups.length >= 3) {
    const last = groups[groups.length - 1];
    const before = groups[groups.length - 2];
    if (last.length <= 8 && before.length + last.length < 16) groups.splice(-2, 2, `${before}\u00a0${last}`);
  }
  return groups.join(" ");
}

/** Short items with no full stops read as a list (ticks); sentences read as a paragraph. */
const isList = (items: string[]) => items.length >= 2 && items.every((i) => !/[.!?…]$/.test(i) && i.length <= 44);

function Aurora({ p, dark }: { p: ReturnType<typeof brandPalette>; dark: boolean }) {
  const bg = dark ? p["--lp-dark-bg"] : p["--lp-glass-bg"];
  const a1 = p["--lp-aurora-1"];
  const a2 = p["--lp-aurora-2"];
  const a3 = p["--lp-aurora-3"];
  // [cx, cy, rx, ry, colour, opacity]
  const blobs: [number, number, number, number, string, number][] = dark
    ? [
        [960, 80, 560, 420, a1, 0.85],
        [80, 1290, 560, 330, a2, 0.42],
        [120, 360, 260, 220, a1, 0.25],
      ]
    : [
        [150, 130, 520, 400, a1, 0.5],
        [980, 420, 440, 400, a2, 0.46],
        [540, 1310, 680, 300, a3, 0.8],
      ];
  // Drawn at a quarter of the size (it's all soft light, so nothing is lost when it's scaled up): a real
  // blur at full size cost seconds a slide. See auroraImage().
  const s = AURORA_SCALE;
  return (
    <svg width={W / s} height={H / s} viewBox={`0 0 ${W} ${H}`} style={{ display: "flex" }}>
      <defs>
        <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="90" />
        </filter>
      </defs>
      <rect width={W} height={H} fill={bg} />
      <g filter="url(#soft)">
        {blobs.map(([cx, cy, rx, ry, c, o], i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={c} fillOpacity={o} />
        ))}
      </g>
    </svg>
  );
}

const AURORA_SCALE = 4;

/** The frosted card every slide's words sit on. */
function glassCard(p: ReturnType<typeof brandPalette>, dark: boolean) {
  return dark ? { background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.13)" } : { background: "rgba(255,255,255,0.6)", border: "2px solid rgba(255,255,255,0.95)" };
}

const pngUrl = async (img: ImageResponse) => `data:image/png;base64,${Buffer.from(await img.arrayBuffer()).toString("base64")}`;
const backdropCache = new Map<string, Promise<string>>();

/**
 * What every slide of a look shares: the aurora light from the brand colour and the frosted card, as one
 * full-size PNG (a data URL), made once per brand colour and look and reused. The light is blurred at a
 * quarter of the size, which looks the same once scaled up. Drawing blurs, gradients over the whole
 * picture, or a see-through rounded card on every slide cost seconds a slide; this way a slide only
 * draws its words.
 */
function backdropImage(brandColor: string, dark: boolean): Promise<string> {
  const key = `${dark ? "d" : "l"}${brandColor.toLowerCase()}`;
  let hit = backdropCache.get(key);
  if (!hit) {
    if (backdropCache.size >= 48) backdropCache.delete(backdropCache.keys().next().value!);
    hit = (async () => {
      const p = brandPalette(brandColor);
      const light = await pngUrl(new ImageResponse(<Aurora p={p} dark={dark} />, { width: W / AURORA_SCALE, height: H / AURORA_SCALE }));
      return pngUrl(
        new ImageResponse(
          <div style={{ width: W, height: H, display: "flex", position: "relative", background: dark ? p["--lp-dark-bg"] : p["--lp-glass-bg"] }}>
            {/* A little bigger than the slide: scaling up softens the picture's own edge, so it bleeds off. */}
            <img src={light} width={W + 24} height={H + 30} alt="" style={{ position: "absolute", left: -12, top: -15 }} />
            <div style={{ position: "absolute", left: CARD.left, top: CARD.top, width: CARD.width, height: CARD.height, display: "flex", borderRadius: 52, ...glassCard(p, dark) }} />
          </div>,
          { width: W, height: H },
        ),
      );
    })();
    hit.catch(() => backdropCache.delete(key));
    backdropCache.set(key, hit);
  }
  return hit;
}

function Tick({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16">
      <path d="M3.4 8.4 6.6 11.4 12.6 4.8" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Arrow({ color }: { color: string }) {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24">
      <path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Bookmark({ color }: { color: string }) {
  return (
    <svg width="58" height="58" viewBox="0 0 24 24">
      <path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2-6.5 4.2v-16a1 1 0 0 1 1-1z" fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

/** One slide. `background` is backdropImage() for this brand colour and look ("" draws a plain one). */
export function SlideArt({ carousel, index, look, brandColor, background }: { carousel: CarouselDraft; index: number; look: CarouselLook; brandColor: string; background: string }) {
  const count = carousel.slides.length;
  const slide = carousel.slides[index];
  const role = slideRole(index, count);
  const p = brandPalette(brandColor);
  const dark = look === "midnight";
  const ink = dark ? p["--lp-dark-ink"] : p["--lp-glass-ink"];
  const muted = dark ? p["--lp-dark-muted"] : p["--lp-glass-muted"];
  const accent = dark ? p["--lp-brand-text-dark"] : p["--lp-glass-accent"];
  const brand = p["--lp-brand"];
  const onBrand = p["--lp-on-brand"];
  // The headline's colours, word by word along the same stops as the Glass headline gradient (a real
  // background-clip gradient costs about half a second per block of text to draw).
  const stops: [number, string][] = dark
    ? [
        [0, "#ffffff"],
        [0.55, mix("#ffffff", p["--lp-brand-text-dark"], 0.45)],
        [1, p["--lp-brand-text-dark"]],
      ]
    : [
        [0, p["--lp-glass-text-1"]],
        [0.43, p["--lp-glass-text-2"]],
        [0.76, p["--lp-glass-text-3"]],
        [1, p["--lp-glass-text-4"]],
      ];
  const hue = (t: number) => {
    for (let i = 1; i < stops.length; i++) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      if (t <= b) return mix(ca, cb, b === a ? 0 : (t - a) / (b - a));
    }
    return stops[stops.length - 1][1];
  };
  const orb = `radial-gradient(circle at 30% 26%, ${mix("#ffffff", p["--lp-brand-3"], 0.5)} 0%, ${p["--lp-brand-3"]} 24%, ${brand} 58%, ${p["--lp-brand-2"]} 100%)`;
  // On Midnight the pills sit on the brightest light, so they get a dark glass to keep their words readable.
  const pill = dark
    ? { background: rgba(p["--lp-dark-bg"], 0.62), border: "1.5px solid rgba(255,255,255,0.16)" }
    : { background: "rgba(255,255,255,0.8)", border: `1.5px solid ${rgba(brand, 0.18)}` };
  const centred = role === "cta" || (role === "hook" && !dark);
  const items = slideItems(slide.lines);
  const L = slideLayout(role, slide.heading, items);
  const body = L.body;

  // The big words: each sentence starts its own line ("You don't need 6 gym days." / "You need these 3."),
  // and a sentence's last two words stay together, so no word is left alone on a line.
  // With no `color`, each word takes the next colour along the headline's stops.
  const Big = ({ text, size, align, color }: { text: string; size: number; align: "left" | "center"; color?: string }) => {
    const parts = headingParts(text).map((part) => part.split(" ").filter(Boolean));
    const total = parts.reduce((n, words) => n + words.length, 0);
    let k = 0;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: align === "center" ? "center" : "flex-start", gap: size * 0.06 }}>
        {parts.map((words, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: align === "center" ? "center" : "flex-start",
              columnGap: Math.round(size * 0.21),
              maxWidth: TEXT_W,
              fontFamily: "Bricolage",
              fontWeight: 800,
              fontSize: size,
              lineHeight: 1.04,
              letterSpacing: -size * 0.03,
              paddingBottom: 4,
            }}
          >
            {words.map((word, j) => {
              // The Glass headline's gradient runs past its last stop, so the words end short of it too.
              const t = total > 1 ? (k++ / (total - 1)) * 0.82 : 0;
              return (
                <span key={j} style={{ color: color ?? hue(t) }}>
                  {word}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const paragraph = (lines: string[], align: "left" | "center", size = body) => (
    <div style={{ display: "flex", flexDirection: "column", gap: PARA_GAP, alignItems: align === "center" ? "center" : "flex-start" }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", fontFamily: "Jakarta", fontWeight: 500, fontSize: size, lineHeight: 1.34, color: muted, textAlign: align, textWrap: "balance", maxWidth: TEXT_W }}>
          {l}
        </div>
      ))}
    </div>
  );

  let content: React.ReactNode;
  if (role === "hook") {
    content = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: centred ? "center" : "flex-start", gap: L.gap, flexGrow: 1 }}>
        {L.mark ? <div style={{ display: "flex", width: 112, height: 12, borderRadius: 999, backgroundImage: `linear-gradient(90deg, ${brand}, ${p["--lp-aurora-2"]})` }} /> : null}
        <Big text={slide.heading} size={L.head} align={centred ? "center" : "left"} />
        {items.length ? paragraph(items, centred ? "center" : "left") : null}
      </div>
    );
  } else if (role === "point") {
    const num = L.num;
    const list = isList(items);
    const tick = Math.round(body * 0.82);
    content = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: L.gap, flexGrow: 1 }}>
        <div style={{ display: "flex", alignSelf: "flex-start", fontFamily: "Bricolage", fontWeight: 800, fontSize: num, lineHeight: 0.92, letterSpacing: -num * 0.04, paddingBottom: 4 }}>
          {[...String(index).padStart(2, "0")].map((d, i) => (
            <span key={i} style={{ color: hue(i ? 0.6 : 0.05) }}>
              {d}
            </span>
          ))}
        </div>
        <Big text={slide.heading} size={L.head} align="left" color={ink} />
        {items.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: list ? LIST_GAP : PARA_GAP, paddingTop: RULE_PAD, borderTop: `2px solid ${dark ? "rgba(255,255,255,0.10)" : rgba(p["--lp-light-ink"], 0.08)}` }}>
            {list
              ? items.map((it, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
                    <div
                      style={{
                        display: "flex",
                        flexShrink: 0,
                        width: tick + 10,
                        height: tick + 10,
                        marginTop: Math.round((body * 1.3 - tick - 10) / 2),
                        borderRadius: 999,
                        alignItems: "center",
                        justifyContent: "center",
                        background: brand,
                      }}
                    >
                      <Tick color={onBrand} size={Math.round(tick * 0.62)} />
                    </div>
                    <div style={{ display: "flex", fontFamily: "Jakarta", fontWeight: 700, fontSize: body, lineHeight: 1.3, color: ink, maxWidth: TEXT_W - tick - 34 }}>{it}</div>
                  </div>
                ))
              : paragraph(items, "left")}
          </div>
        ) : null}
      </div>
    );
  } else {
    content = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: L.gap, flexGrow: 1 }}>
        {L.mark ? (
          <div style={{ display: "flex", width: ORB, height: ORB, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundImage: orb, border: `10px solid ${rgba(brand, dark ? 0.28 : 0.16)}` }}>
            <Bookmark color={onBrand} />
          </div>
        ) : null}
        <Big text={slide.heading} size={L.head} align="center" />
        {items.length ? paragraph(items, "center") : null}
      </div>
    );
  }

  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        ...(background ? { backgroundImage: `url(${background})`, backgroundSize: `${W}px ${H}px` } : { background: dark ? p["--lp-dark-bg"] : p["--lp-glass-bg"] }),
      }}
    >

      <div style={{ position: "absolute", left: SIDE, top: 52, width: W - SIDE * 2, height: 72, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {carousel.handle ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 24px 8px 8px", borderRadius: 999, ...pill }}>
            <div style={{ display: "flex", width: 44, height: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", background: brand, color: onBrand, fontFamily: "Jakarta", fontWeight: 700, fontSize: 22 }}>
              {carousel.handle.replace(/[^A-Za-z0-9]/g, "").slice(0, 1).toUpperCase() || "@"}
            </div>
            <div style={{ display: "flex", fontFamily: "Jakarta", fontWeight: 700, fontSize: 26, color: ink }}>{`@${carousel.handle}`}</div>
          </div>
        ) : (
          <div style={{ display: "flex" }} />
        )}
        <div style={{ display: "flex", alignItems: "center", padding: "12px 24px", borderRadius: 999, fontFamily: "Jakarta", fontWeight: 700, fontSize: 26, letterSpacing: 1, color: dark ? ink : accent, ...pill }}>{`${index + 1}/${count}`}</div>
      </div>

      {/* The card itself is in the backdrop; this only holds (and, as a last guard, clips) the words. */}
      <div style={{ position: "absolute", left: CARD.left, top: CARD.top, width: CARD.width, height: CARD.height, display: "flex", flexDirection: "column", padding: `${CARD_PAD_Y}px ${CARD_PAD_X}px`, overflow: "hidden", ...(background ? {} : { borderRadius: 52, ...glassCard(p, dark) }) }}>
        {content}
      </div>

      <div style={{ position: "absolute", left: SIDE, top: CARD.top + CARD.height + 50, width: W - SIDE * 2, height: 44, display: "flex", alignItems: "center", gap: 28 }}>
        <div style={{ display: "flex", flexGrow: 1, gap: 10 }}>
          {carousel.slides.map((_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexGrow: 1,
                height: 8,
                borderRadius: 999,
                background: i <= index ? brand : dark ? "rgba(255,255,255,0.14)" : rgba(p["--lp-light-ink"], 0.1),
              }}
            />
          ))}
        </div>
        {role === "hook" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "Jakarta", fontWeight: 700, fontSize: 28, color: accent }}>
            Swipe
            <Arrow color={accent} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

const fileBase = (c: CarouselDraft) => slugify(c.title, 40) || "carousel";
export const slideFileName = (c: CarouselDraft, n: number) => `${fileBase(c)}-slide-${n}.png`;
export const zipFileName = (c: CarouselDraft) => `${fileBase(c)}-slides.zip`;

async function slideImage(carousel: CarouselDraft, index: number, look: CarouselLook, brandColor: string, headers?: Record<string, string>) {
  const [fonts, background] = await Promise.all([loadFonts(), backdropImage(brandColor, look === "midnight")]);
  return new ImageResponse(<SlideArt carousel={carousel} index={index} look={look} brandColor={brandColor} background={background} />, { ...CAROUSEL_SIZE, fonts, headers });
}

/** One slide as a PNG response (n is 1-based). `download` adds the attachment header so a phone saves it. */
export async function renderCarouselSlide(carousel: CarouselDraft, n: number, look: CarouselLook, brandColor: string, opts: { download?: boolean } = {}): Promise<Response> {
  return slideImage(carousel, n - 1, look, brandColor, {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": opts.download ? `attachment; filename="${slideFileName(carousel, n)}"` : "inline",
  });
}

/** One slide's PNG bytes (n is 1-based). */
export async function carouselSlidePng(carousel: CarouselDraft, n: number, look: CarouselLook, brandColor: string): Promise<Buffer> {
  return Buffer.from(await (await slideImage(carousel, n - 1, look, brandColor)).arrayBuffer());
}

/** Every slide in order, in one ZIP ("slide-1.png" …), for "Download all slides". */
export async function carouselZip(carousel: CarouselDraft, look: CarouselLook, brandColor: string): Promise<Buffer> {
  const files = [];
  for (let n = 1; n <= carousel.slides.length; n++) files.push({ name: slideFileName(carousel, n), data: await carouselSlidePng(carousel, n, look, brandColor) });
  return zipStore(files);
}
