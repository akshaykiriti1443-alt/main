// "Make my Skool cover": the member's Skool group cover, drawn by code (next/og, no image model and no
// outside service). Built like the top paid Skool groups' covers (a YouTube thumbnail): the member's own
// photo big on one side; on the other a small "FOR <WHO>" label, the Prize in 4 to 8 huge words, and
// "with <name>". Skool shows the cover only about 335 px wide, so nothing small is on it, and no price
// or trial (those live in the description and About page). Looks: Glow (our light Glass), Spotlight
// (their brand colour) and Midnight (dark). Every word comes from the member's own launch kit and is
// cleaned and clamped here first.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { and, desc, eq } from "drizzle-orm";
import { brandPalette, contrast, hexToRgb, mix } from "@/components/landing/palette";
import { getDb } from "@/lib/db";
import { aiGenerations } from "@/lib/db/schema";
import { isUuid, midSentence } from "@/lib/util";
import type { LaunchKit, LaunchKitInput } from "@/server/ai/launchKit";
import { dealFor, getLaunchKit, kitSite } from "@/server/ai/launchKit";
import { COVER_HEADLINE_MAX, COVER_WHO_MAX, cleanCoverText, prizeHeadline, shortWho } from "./cleanText";
import { getCoverPhoto } from "./photo";

/** Skool shows a group's cover wide; this is the size it asks for. */
export const COVER_SIZE = { width: 1084, height: 576 } as const;
const W = COVER_SIZE.width;
const H = COVER_SIZE.height;

export const COVER_LOOKS = ["glow", "split", "midnight"] as const;
export type CoverLook = (typeof COVER_LOOKS)[number];
export const COVER_LOOK_LABEL: Record<CoverLook, string> = { glow: "Glow", split: "Spotlight", midnight: "Midnight" };

export function parseLook(raw: unknown): CoverLook {
  return (COVER_LOOKS as readonly unknown[]).includes(raw) ? (raw as CoverLook) : "glow";
}

export const COVER_LIMITS = { name: 48, line: 110, eyebrow: 44, owner: 40, headline: 48, who: COVER_WHO_MAX } as const;

// Shared with the carousel maker and the launch kit (a pure module, so browser-side editors can import it).
export { COVER_HEADLINE_MAX, cleanCoverText, prizeHeadline, shortWho };

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export type CoverPhotoArt = { src: string; width: number; height: number; cutout: boolean };

export type CoverData = {
  name: string;
  /** The promise, as a sentence (from their answers or the About page). */
  line: string;
  /** The Prize: the cover's big words. */
  headline: string;
  /** Who it's for, as a short "For …" label. Empty: no label. */
  eyebrow: string;
  /** Hosted by. Empty: left out. */
  owner: string;
  /** Free-trial days on the group (never drawn: the cover shows no price or trial). */
  trialDays: number | null;
  brandColor: string;
  /** The member's own photo. Null: their initials in a brand orb. */
  photo?: CoverPhotoArt | null;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The first line of the About page that says something (not the group's name, not a heading in caps). */
function aboutPromise(about: unknown, name: string): string {
  if (typeof about !== "string") return "";
  for (const raw of about.split(/\r?\n/).slice(0, 12)) {
    const line = cleanCoverText(raw, 400);
    if (line.length < 8) continue;
    if (line.toLowerCase() === name.toLowerCase()) continue;
    if (line === line.toUpperCase() && /[A-Z]/.test(line)) continue; // "WHAT YOU GET:"
    return line;
  }
  return "";
}

/** What the cover says, from the member's launch kit (and their account when there's no kit yet). */
export function coverData(src: {
  input?: Partial<LaunchKitInput> | null;
  kit?: Partial<Pick<LaunchKit, "skoolAboutPage" | "coverHeadline">> | null;
  settings?: { businessName?: string; niche?: string; offer?: string; audience?: string } | null;
  workspaceName?: string;
  siteBrandColor?: string | null;
  photo?: CoverPhotoArt | null;
}): CoverData {
  const input = src.input ?? {};
  const name = cleanCoverText(input.businessName, COVER_LIMITS.name) || cleanCoverText(src.settings?.businessName, COVER_LIMITS.name) || cleanCoverText(src.workspaceName, COVER_LIMITS.name) || "My community";
  const line = capitalize(
    cleanCoverText(input.outcome, COVER_LIMITS.line) || cleanCoverText(aboutPromise(src.kit?.skoolAboutPage, name), COVER_LIMITS.line) || cleanCoverText(src.settings?.niche, COVER_LIMITS.line),
  );
  // The Prize: the kit's cover headline (theirs or the AI's), else a short form of their result.
  const headline = capitalize(cleanCoverText(src.kit?.coverHeadline, COVER_LIMITS.headline)) || capitalize(cleanCoverText(input.coverHeadline, COVER_LIMITS.headline)) || prizeHeadline(line) || name;
  const who = shortWho(input.audience || src.settings?.audience);
  const eyebrow = who ? `For ${midSentence(who)}` : "";
  const owner = cleanCoverText(input.ownerName, COVER_LIMITS.owner);
  // Only a trial we know about: the kit's own answer, or a "7-day free trial" in their offer line.
  const deal = dealFor({ offer: typeof input.offer === "string" ? input.offer : (src.settings?.offer ?? ""), price: input.price, trialDays: input.trialDays });
  const days = deal?.days;
  const trialDays = typeof days === "number" && Number.isInteger(days) && days > 0 && days <= 90 ? days : null;
  const brandColor = [src.siteBrandColor, input.brandColor].find((c): c is string => typeof c === "string" && HEX.test(c)) ?? "#2A44EE";
  return { name, line, headline, eyebrow, owner, trialDays, brandColor, photo: src.photo ?? null };
}

/** The launch kit the cover reads: the one the page shows (only ever this workspace's), else the latest. */
async function coverKit(workspaceId: string, kitId: unknown) {
  if (isUuid(kitId)) {
    const kit = await getLaunchKit(workspaceId, kitId);
    if (kit) return kit;
  }
  const db = await getDb();
  const [latest] = await db
    .select({ id: aiGenerations.id })
    .from(aiGenerations)
    .where(and(eq(aiGenerations.workspaceId, workspaceId), eq(aiGenerations.kind, "launch_kit")))
    .orderBy(desc(aiGenerations.createdAt))
    .limit(1);
  return latest ? getLaunchKit(workspaceId, latest.id) : null;
}

/**
 * The cover's words for this workspace: from the kit the page shows, else its latest kit, else its
 * settings. The colour follows the kit's website once it has one; the photo is this workspace's own.
 */
export async function loadCoverData(workspace: { id: string; name: string; settings: { businessName?: string; niche?: string; offer?: string; audience?: string } | null }, kitId: unknown): Promise<CoverData> {
  const [kit, site, photo] = await Promise.all([coverKit(workspace.id, kitId), kitSite(workspace.id), getCoverPhoto(workspace.id)]);
  return coverData({ input: kit?.input, kit: kit?.kit, settings: workspace.settings, workspaceName: workspace.name, siteBrandColor: site?.theme?.brandColor ?? null, photo });
}

// ---------------------------------------------------------------------------
// Drawing

let fontsOnce: Promise<{ name: string; data: Buffer; weight: 500 | 700 | 800; style: "normal" }[]> | null = null;
/** Bricolage (800) and Plus Jakarta Sans (500, 700), read once. The carousel maker draws with the same. */
export function loadFonts() {
  // Bundled with the app (src/server/cover/fonts, OFL), so a render never waits on Google Fonts.
  const dir = join(process.cwd(), "src", "server", "cover", "fonts");
  fontsOnce ??= Promise.all([
    readFile(join(dir, "BricolageGrotesque-ExtraBold.ttf")),
    readFile(join(dir, "PlusJakartaSans-Medium.ttf")),
    readFile(join(dir, "PlusJakartaSans-Bold.ttf")),
  ]).then(([display, body, bodyBold]) => [
    { name: "Bricolage", data: display, weight: 800 as const, style: "normal" as const },
    { name: "Jakarta", data: body, weight: 500 as const, style: "normal" as const },
    { name: "Jakarta", data: bodyBold, weight: 700 as const, style: "normal" as const },
  ]);
  fontsOnce.catch(() => (fontsOnce = null));
  return fontsOnce;
}

const rgba = (hex: string, a: number) => `rgba(${hexToRgb(hex).join(",")},${a})`;

// Rough glyph widths for Bricolage ExtraBold (in em, tracking included), so the headline can pick the
// biggest size that still fits. Erring wide keeps real text inside the column.
const GLYPH = { wide: 0.88, upper: 0.66, narrow: 0.3, digit: 0.58, space: 0.22, other: 0.52 };
function textWidth(text: string, size: number): number {
  let em = 0;
  for (const ch of text) em += ch === " " || ch === " " ? GLYPH.space : /[MWmw@%]/.test(ch) ? GLYPH.wide : /[A-Z]/.test(ch) ? GLYPH.upper : /[ijlft.,:;'!|I()\-]/.test(ch) ? GLYPH.narrow : /\d/.test(ch) ? GLYPH.digit : GLYPH.other;
  return em * size;
}

/** The headline as pieces: plain words, and one highlighted piece (the number and its word, or the last words). */
export type HeadPiece = { text: string; mark: "none" | "marker" | "accent" };
export function headlinePieces(headline: string): HeadPiece[] {
  return keepTogether(rawPieces(headline));
}

/**
 * No word left alone on a line: a tiny word stays with the word after it ("a week"), and a short last
 * word stays with the one before it. Only plain words of the same colour are joined.
 */
function keepTogether(pieces: HeadPiece[]): HeadPiece[] {
  const out: HeadPiece[] = [];
  for (const p of pieces) {
    const prev = out[out.length - 1];
    if (prev && prev.mark === p.mark && p.mark !== "marker" && /^\S{1,2}$/.test(prev.text.split(" ").pop() ?? "") && prev.text.length + p.text.length < 14) {
      prev.text = `${prev.text} ${p.text}`;
    } else out.push({ ...p });
  }
  const last = out[out.length - 1];
  const before = out[out.length - 2];
  if (out.length >= 3 && last.mark === before.mark && last.mark !== "marker" && last.text.length <= 5 && before.text.length + last.text.length < 14) {
    out.splice(-2, 2, { text: `${before.text} ${last.text}`, mark: last.mark });
  }
  return out;
}

function rawPieces(headline: string): HeadPiece[] {
  const words = headline.split(" ").filter(Boolean);
  const i = words.findIndex((w) => /\d/.test(w));
  if (i >= 0) {
    // "3 sessions", "90 days.", "$10K deal": the number and the word after it, on one marker.
    const takeNext = i + 1 < words.length && !/[.!?]$/.test(words[i]) && words[i + 1].length <= 10 && !/^(?:a|an|the|and|or|in|of|to|for|with)$/i.test(words[i + 1]);
    const end = takeNext ? i + 2 : i + 1;
    return [...words.slice(0, i).map((t) => ({ text: t, mark: "none" as const })), { text: words.slice(i, end).join(" "), mark: "marker" as const }, ...words.slice(end).map((t) => ({ text: t, mark: "none" as const }))];
  }
  if (words.length < 3) return words.map((t) => ({ text: t, mark: "none" as const }));
  // No number: the last word (or the last two short ones) in the accent colour.
  const lastTwo = words.slice(-2).join(" ");
  const n = lastTwo.length <= 14 && words.length >= 4 ? 2 : 1;
  return words.map((t, k) => ({ text: t, mark: k >= words.length - n ? ("accent" as const) : ("none" as const) }));
}

const MARK_PAD = 0.16; // the marker's side padding, in em

/** How many lines the pieces wrap to at `size` in `width`. */
function rowsAt(pieces: HeadPiece[], size: number, width: number): { rows: number; widest: number } {
  const gap = size * 0.24;
  let rows = 1;
  let x = 0;
  let widest = 0;
  for (const p of pieces) {
    const w = textWidth(p.text, size) + (p.mark === "marker" ? size * MARK_PAD * 2 : 0);
    widest = Math.max(widest, w);
    if (x > 0 && x + gap + w > width) {
      rows++;
      x = w;
    } else x += (x > 0 ? gap : 0) + w;
  }
  return { rows, widest };
}

/** The headline's size: the biggest that fits the column in 3 lines (4 for a long one) and the height. */
export function headlineSize(pieces: HeadPiece[], width: number, maxHeight: number): { size: number; rows: number } {
  const sizes = [128, 120, 112, 104, 96, 90, 84, 78, 72, 66, 60, 54, 48];
  for (const maxRows of [3, 4]) {
    for (const size of sizes) {
      const { rows, widest } = rowsAt(pieces, size, width);
      if (rows <= maxRows && widest <= width && rows * size * 1.06 <= maxHeight) return { size, rows };
    }
  }
  return { size: 48, rows: rowsAt(pieces, 48, width).rows };
}

function initials(name: string): string {
  // Words that start with a letter ("The 45-Minute Dad" -> MD, not 4D); all words when none do.
  const lettered = name.split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  const all = lettered.length ? lettered : name.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  // "The Sourdough Society" -> SS, not TS.
  const words = all.filter((w) => !/^(the|a|an|of|and|for|&)$/i.test(w));
  if (!words.length) words.push(...all);
  const first = (w: string) => [...w].find((c) => /[\p{L}\p{N}]/u.test(c)) ?? "";
  return ((words.length > 1 ? first(words[0]) + first(words[1]) : first(words[0] ?? "")) || "S").toUpperCase();
}

type Palette = ReturnType<typeof brandPalette>;

/** Each look's colours. Spotlight's ground is their brand colour, deepened until white words read on it. */
function lookColors(p: Palette, look: CoverLook) {
  const brand = p["--lp-brand"];
  if (look === "glow") {
    return {
      bg: p["--lp-glass-bg"],
      ink: p["--lp-glass-ink"],
      muted: p["--lp-glass-muted"],
      accent: p["--lp-glass-accent"],
      marker: brand,
      onMarker: p["--lp-on-brand"],
      pillBg: "rgba(255,255,255,0.86)",
      pillBorder: `2px solid ${rgba(brand, 0.16)}`,
      pillInk: p["--lp-glass-accent"],
      dot: brand,
    };
  }
  if (look === "split") {
    let ground = brand;
    for (let t = 0.12; contrast("#ffffff", ground) < 5.2 && t <= 0.9; t += 0.08) ground = mix(brand, "#05060f", t);
    return {
      bg: ground,
      ink: "#ffffff",
      muted: "rgba(255,255,255,0.82)",
      accent: mix("#ffffff", p["--lp-aurora-2"], 0.35),
      marker: "#ffffff",
      onMarker: ground,
      pillBg: "rgba(255,255,255,0.14)",
      pillBorder: "2px solid rgba(255,255,255,0.28)",
      pillInk: "#ffffff",
      dot: p["--lp-aurora-2"],
    };
  }
  return {
    bg: p["--lp-dark-bg"],
    ink: "#ffffff",
    muted: p["--lp-dark-muted"],
    accent: p["--lp-brand-text-dark"],
    marker: brand,
    onMarker: p["--lp-on-brand"],
    pillBg: rgba(p["--lp-dark-bg"], 0.6),
    pillBorder: "2px solid rgba(255,255,255,0.16)",
    pillInk: p["--lp-brand-text-dark"],
    dot: brand,
  };
}

const AURORA_SCALE = 4;

/** Soft light from the brand colour, drawn small (a real blur at full size costs seconds) and scaled up. */
function Aurora({ p, look, ground }: { p: Palette; look: CoverLook; ground: string }) {
  const a1 = p["--lp-aurora-1"];
  const a2 = p["--lp-aurora-2"];
  const a3 = p["--lp-aurora-3"];
  // [cx, cy, rx, ry, colour, opacity]
  const blobs: [number, number, number, number, string, number][] =
    look === "glow"
      ? [
          [120, 40, 440, 300, a1, 0.55],
          [980, 140, 380, 320, a2, 0.5],
          [520, 620, 520, 210, a3, 0.8],
        ]
      : look === "split"
        ? [
            [80, 0, 460, 300, mix(ground, "#ffffff", 0.22), 0.9],
            [1040, 520, 420, 300, a2, 0.55],
            [600, 640, 420, 160, a1, 0.5],
          ]
        : [
            [960, 80, 520, 340, a1, 0.85],
            [40, 620, 460, 220, a2, 0.4],
          ];
  return (
    <svg width={W / AURORA_SCALE} height={H / AURORA_SCALE} viewBox={`0 0 ${W} ${H}`} style={{ display: "flex" }}>
      <defs>
        <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="80" />
        </filter>
      </defs>
      <rect width={W} height={H} fill={ground} />
      <g filter="url(#soft)">
        {blobs.map(([cx, cy, rx, ry, c, o], i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={c} fillOpacity={o} />
        ))}
      </g>
    </svg>
  );
}

const pngUrl = async (img: ImageResponse) => `data:image/png;base64,${Buffer.from(await img.arrayBuffer()).toString("base64")}`;
const backdropCache = new Map<string, Promise<string>>();

/** The light behind each look, made once per brand colour and look and reused (like the carousel's). */
function backdropImage(brandColor: string, look: CoverLook): Promise<string> {
  const key = `${look}${brandColor.toLowerCase()}`;
  let hit = backdropCache.get(key);
  if (!hit) {
    if (backdropCache.size >= 48) backdropCache.delete(backdropCache.keys().next().value!);
    hit = (async () => {
      const p = brandPalette(brandColor);
      const ground = lookColors(p, look).bg;
      const light = await pngUrl(new ImageResponse(<Aurora p={p} look={look} ground={ground} />, { width: W / AURORA_SCALE, height: H / AURORA_SCALE }));
      return pngUrl(
        new ImageResponse(
          <div style={{ width: W, height: H, display: "flex", position: "relative", background: ground }}>
            {/* A little bigger than the cover: scaling up softens the picture's own edge, so it bleeds off. */}
            <img src={light} width={W + 24} height={H + 24} alt="" style={{ position: "absolute", left: -12, top: -12 }} />
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

/** A photo filling a box (like object-fit: cover), its face kept near the top. */
function Fill({ photo, w, h, focusY = 0.18 }: { photo: CoverPhotoArt; w: number; h: number; focusY?: number }) {
  const scale = Math.max(w / photo.width, h / photo.height);
  const dw = Math.ceil(photo.width * scale);
  const dh = Math.ceil(photo.height * scale);
  return <img src={photo.src} width={dw} height={dh} alt="" style={{ position: "absolute", left: Math.round((w - dw) / 2), top: Math.round(-(dh - h) * focusY) }} />;
}

/** The right-hand side: their photo (cut-out or framed), or their initials in a brand orb. Returns the text column's width. */
function PhotoSide({ data, look, p, c }: { data: CoverData; look: CoverLook; p: Palette; c: ReturnType<typeof lookColors> }): { node: React.ReactNode; textWidth: number } {
  const brand = p["--lp-brand"];
  const photo = data.photo;
  const orbFill = `radial-gradient(circle at 32% 28%, ${mix("#ffffff", p["--lp-brand-3"], 0.45)} 0%, ${p["--lp-brand-3"]} 26%, ${brand} 60%, ${p["--lp-brand-2"]} 100%)`;

  if (!photo) {
    const mark = initials(data.owner || data.name);
    const D = 330;
    return {
      textWidth: 600,
      node: (
        <div style={{ position: "absolute", left: 700, top: (H - D - 60) / 2, width: D + 60, height: D + 60, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 999, border: `2px solid ${look === "glow" ? rgba(brand, 0.14) : "rgba(255,255,255,0.14)"}` }}>
          <div
            style={{
              display: "flex",
              width: D,
              height: D,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundImage: look === "split" ? `radial-gradient(circle at 32% 28%, #ffffff 0%, ${mix("#ffffff", p["--lp-aurora-2"], 0.3)} 70%)` : orbFill,
              color: look === "split" ? c.bg : p["--lp-on-brand"],
              fontFamily: "Bricolage",
              fontWeight: 800,
              fontSize: mark.length > 1 ? 136 : 168,
              letterSpacing: -6,
              paddingBottom: 8,
              boxShadow: `0 40px 80px -30px ${rgba(look === "split" ? "#000000" : brand, 0.7)}`,
            }}
          >
            {mark}
          </div>
        </div>
      ),
    };
  }

  if (photo.cutout) {
    // The person stands in the bottom-right corner, big, in front of a brand orb.
    const maxH = 548;
    const maxW = 470;
    const s = Math.min(maxH / photo.height, maxW / photo.width);
    const pw = Math.round(photo.width * s);
    const ph = Math.round(photo.height * s);
    const cx = W - 40 - maxW / 2;
    const left = Math.round(cx - pw / 2);
    const D = 440;
    const ring = look === "glow" ? rgba(brand, 0.16) : "rgba(255,255,255,0.16)";
    return {
      textWidth: Math.min(620, left - 64 + 30),
      node: (
        <>
          <div style={{ position: "absolute", left: cx - D / 2 - 34, top: H - ph * 0.62 - D / 2 - 34, width: D + 68, height: D + 68, display: "flex", borderRadius: 999, border: `2px solid ${ring}` }} />
          <div
            style={{
              position: "absolute",
              left: cx - D / 2,
              top: H - ph * 0.62 - D / 2,
              width: D,
              height: D,
              display: "flex",
              borderRadius: 999,
              backgroundImage: look === "split" ? `radial-gradient(circle at 35% 30%, ${rgba("#ffffff", 0.5)} 0%, ${rgba("#ffffff", 0.16)} 60%, ${rgba("#ffffff", 0.06)} 100%)` : orbFill,
              boxShadow: look === "glow" ? `0 40px 90px -30px ${rgba(brand, 0.75)}` : `0 0 120px 10px ${rgba(look === "split" ? "#ffffff" : brand, 0.28)}`,
            }}
          />
          <img src={photo.src} width={pw} height={ph} alt="" style={{ position: "absolute", left, top: H - ph }} />
        </>
      ),
    };
  }

  if (look === "glow") {
    // A framed photo card, tilted on a brand block behind it.
    const fw = 360;
    const fh = 476;
    const fx = W - 56 - fw;
    const fy = (H - fh) / 2;
    return {
      textWidth: fx - 64 - 40,
      node: (
        <>
          <div style={{ position: "absolute", left: fx + 22, top: fy + 4, width: fw, height: fh, display: "flex", borderRadius: 44, backgroundImage: `linear-gradient(150deg, ${p["--lp-brand-3"]}, ${brand} 55%, ${p["--lp-brand-2"]})`, transform: "rotate(5deg)" }} />
          <div style={{ position: "absolute", left: fx, top: fy, width: fw, height: fh, display: "flex", overflow: "hidden", borderRadius: 40, border: "8px solid #ffffff", boxShadow: `0 30px 60px -24px ${rgba(p["--lp-light-ink"], 0.45)}`, background: "#ffffff" }}>
            <Fill photo={photo} w={fw - 16} h={fh - 16} />
          </div>
        </>
      ),
    };
  }

  // Spotlight and Midnight: the photo fills the right side and fades into the ground, like a thumbnail.
  const px = 480;
  const pw = W - px;
  return {
    textWidth: 560,
    node: (
      <>
        <div style={{ position: "absolute", left: px, top: 0, width: pw, height: H, display: "flex", overflow: "hidden" }}>
          <Fill photo={photo} w={pw} h={H} focusY={0.2} />
        </div>
        <div style={{ position: "absolute", left: px, top: H - 150, width: pw, height: 150, display: "flex", backgroundImage: `linear-gradient(0deg, ${rgba(c.bg, 0.55)} 0%, ${rgba(c.bg, 0)} 100%)` }} />
        <div style={{ position: "absolute", left: px, top: 0, width: pw, height: H, display: "flex", background: rgba(look === "split" ? c.bg : brand, look === "split" ? 0.12 : 0.08) }} />
        {/* On top, starting before the photo, so the light behind the words melts into it with no seam. */}
        <div
          style={{
            position: "absolute",
            left: px - 200,
            top: 0,
            width: 540,
            height: H,
            display: "flex",
            backgroundImage: `linear-gradient(90deg, ${rgba(c.bg, 0)} 0%, ${rgba(c.bg, 1)} 38%, ${rgba(c.bg, 0.84)} 50%, ${rgba(c.bg, 0.38)} 74%, ${rgba(c.bg, 0)} 100%)`,
          }}
        />
      </>
    ),
  };
}

export function CoverArt({ data, look, background = "" }: { data: CoverData; look: CoverLook; background?: string }) {
  const p = brandPalette(data.brandColor);
  const c = lookColors(p, look);
  const side = PhotoSide({ data, look, p, c });
  const colW = side.textWidth;
  const who = data.eyebrow.replace(/^for\s+/i, "");
  const labelH = who ? 56 : 0;
  const hostH = data.owner ? 46 : 0;
  const gaps = (who ? 30 : 0) + (data.owner ? 30 : 0);
  const pieces = headlinePieces(data.headline);
  const { size } = headlineSize(pieces, colW, H - 112 - labelH - hostH - gaps);

  // One line always: a long "who" gets a smaller label (capitals with tracking run about 0.8 em a letter).
  const labelSize = Math.max(17, Math.min(25, Math.floor((colW - 96) / (`For ${who}`.length * 0.8))));
  const label = who ? (
    <div style={{ display: "flex", alignSelf: "flex-start", alignItems: "center", gap: 14, padding: "10px 24px 10px 18px", borderRadius: 999, background: c.pillBg, border: c.pillBorder, maxWidth: colW }}>
      <div style={{ display: "flex", flexShrink: 0, width: 14, height: 14, borderRadius: 999, background: c.dot, boxShadow: `0 0 0 5px ${rgba(c.dot, 0.25)}` }} />
      <div style={{ display: "flex", fontFamily: "Jakarta", fontWeight: 700, fontSize: labelSize, letterSpacing: labelSize * 0.088, textTransform: "uppercase", color: c.pillInk, whiteSpace: "nowrap" }}>{`For ${who}`}</div>
    </div>
  ) : null;

  const headline = (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: Math.round(size * 0.24), rowGap: Math.round(size * 0.06), maxWidth: colW, fontFamily: "Bricolage", fontWeight: 800, fontSize: size, lineHeight: 1.0, letterSpacing: -size * 0.025 }}>
      {pieces.map((piece, i) =>
        piece.mark === "marker" ? (
          <div
            key={i}
            style={{
              display: "flex",
              padding: `${Math.round(size * 0.02)}px ${Math.round(size * MARK_PAD)}px ${Math.round(size * 0.08)}px`,
              borderRadius: Math.round(size * 0.16),
              background: c.marker,
              color: c.onMarker,
              transform: "rotate(-2deg)",
              boxShadow: `0 ${Math.round(size * 0.12)}px ${Math.round(size * 0.3)}px -${Math.round(size * 0.12)}px ${rgba(look === "split" ? "#000000" : p["--lp-brand"], 0.6)}`,
            }}
          >
            {piece.text}
          </div>
        ) : (
          <div key={i} style={{ display: "flex", color: piece.mark === "accent" ? c.accent : c.ink, paddingBottom: Math.round(size * 0.06) }}>
            {piece.text}
          </div>
        ),
      )}
    </div>
  );

  const host = data.owner ? (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ display: "flex", width: 40, height: 6, borderRadius: 999, background: c.marker === "#ffffff" ? "#ffffff" : p["--lp-brand"] }} />
      <div style={{ display: "flex", fontFamily: "Jakarta", fontWeight: 500, fontSize: 32, color: c.muted }}>
        with&nbsp;<span style={{ fontWeight: 700, color: c.ink }}>{data.owner}</span>
      </div>
    </div>
  ) : null;

  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        ...(background ? { backgroundImage: `url(${background})`, backgroundSize: `${W}px ${H}px` } : { background: c.bg }),
      }}
    >
      {side.node}
      <div style={{ position: "absolute", left: 64, top: 0, width: colW, height: H, display: "flex", flexDirection: "column", justifyContent: "center", gap: 30 }}>
        {label}
        {headline}
        {host}
      </div>
    </div>
  );
}

async function coverImage(data: CoverData, look: CoverLook, headers?: Record<string, string>) {
  const [fonts, background] = await Promise.all([loadFonts(), backdropImage(data.brandColor, look)]);
  return new ImageResponse(<CoverArt data={data} look={look} background={background} />, { ...COVER_SIZE, fonts, headers });
}

/** The cover as a PNG response. `download` adds the attachment header so the browser saves it. */
export async function renderSkoolCover(data: CoverData, look: CoverLook, opts: { download?: boolean } = {}): Promise<Response> {
  return coverImage(data, look, {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    ...(opts.download ? { "Content-Disposition": `attachment; filename="skool-cover.png"` } : { "Content-Disposition": "inline" }),
  });
}

/** The cover's PNG bytes. */
export async function skoolCoverPng(data: CoverData, look: CoverLook): Promise<Buffer> {
  return Buffer.from(await (await coverImage(data, look)).arrayBuffer());
}
