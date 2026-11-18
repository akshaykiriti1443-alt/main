// "Make my carousel": what a carousel is, and the rules every one of them keeps, wherever it came from
// (the member's own AI, a pasted ReelVault script, their Claude through the connector, or their own
// typing). Pure: no server imports, so the editor in the browser shares the same limits.
import { cleanCoverText } from "@/server/cover/cleanText";
import { midSentence, startsWithAction } from "@/lib/util";

/** Instagram's portrait post, one PNG per slide. */
export const CAROUSEL_SIZE = { width: 1080, height: 1350 } as const;

export const CAROUSEL_LOOKS = ["glow", "midnight"] as const;
export type CarouselLook = (typeof CAROUSEL_LOOKS)[number];
export const CAROUSEL_LOOK_LABEL: Record<CarouselLook, string> = { glow: "Glow", midnight: "Midnight" };

export function parseCarouselLook(raw: unknown): CarouselLook {
  return (CAROUSEL_LOOKS as readonly unknown[]).includes(raw) ? (raw as CarouselLook) : "glow";
}

export const CAROUSEL_LIMITS = {
  minSlides: 4,
  maxSlides: 8,
  /** The big words on a slide. */
  heading: 80,
  /** Each small line under them. */
  line: 70,
  lines: 3,
  handle: 30,
  title: 60,
  topic: 200,
  script: 8000,
} as const;

/** One slide: big words, then 0 to 3 short lines. Slide 1 is the hook, the last one says what to do next. */
export type CarouselSlide = { heading: string; lines: string[] };
export type CarouselDraft = { title: string; handle: string; look: CarouselLook; slides: CarouselSlide[] };

export type SlideRole = "hook" | "point" | "cta";
export const slideRole = (index: number, count: number): SlideRole => (index === 0 ? "hook" : index === count - 1 ? "cta" : "point");

/** The last slide when nothing better was written. */
export const DEFAULT_CTA: CarouselSlide = { heading: "Save this for later.", lines: ["More in my group. Link in bio."] };

/** An Instagram name without the @: letters, numbers, dots and underscores. Anything else gives "". */
export function cleanHandle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim().replace(/^@+/, "").replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s : "";
}

const asLines = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.slice(0, 20).flatMap((l) => (typeof l === "string" ? l.split(/\r?\n/) : []));
  if (typeof raw === "string") return raw.slice(0, 2000).split(/\r?\n/);
  return [];
};

/** One slide, cleaned and clamped. `lines` may be a list or one string with line breaks (`body` works too). Empty: null. */
export function cleanSlide(raw: unknown): CarouselSlide | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { heading?: unknown; lines?: unknown; body?: unknown };
  const lines = asLines(r.lines ?? r.body)
    .map((l) => cleanCoverText(l, CAROUSEL_LIMITS.line))
    .filter(Boolean);
  let heading = cleanCoverText(r.heading, CAROUSEL_LIMITS.heading);
  // Big words are what a slide is for: with none, the first small line moves up.
  if (!heading && lines.length) heading = cleanCoverText(lines.shift(), CAROUSEL_LIMITS.heading);
  if (!heading) return null;
  return { heading, lines: lines.slice(0, CAROUSEL_LIMITS.lines) };
}

export type CleanCarouselResult = { ok: true; carousel: CarouselDraft } | { ok: false; error: string };

/**
 * Any carousel, from anywhere, made safe to save and draw: every word cleaned and clamped, empty slides
 * dropped, 4 to 8 slides (past 8, the first 7 and the last are kept so the call to action stays).
 */
export function cleanCarousel(raw: unknown): CleanCarouselResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as { title?: unknown; handle?: unknown; look?: unknown; slides?: unknown };
  const all = (Array.isArray(r.slides) ? r.slides.slice(0, 30) : []).map(cleanSlide).filter((s): s is CarouselSlide => s !== null);
  const { minSlides: min, maxSlides: max } = CAROUSEL_LIMITS;
  if (all.length < min) return { ok: false, error: `A carousel needs ${min} to ${max} slides with words on them. This one has ${all.length}.` };
  const slides = all.length > max ? [...all.slice(0, max - 1), all[all.length - 1]] : all;
  const title = cleanCoverText(r.title, CAROUSEL_LIMITS.title) || cleanCoverText(slides[0].heading, CAROUSEL_LIMITS.title);
  return { ok: true, carousel: { title, handle: cleanHandle(r.handle), look: parseCarouselLook(r.look), slides } };
}

// ---------------------------------------------------------------------------
// The worked example (the course, the demo account and the GIFs use the same words)

export const GYM_EXAMPLE: CarouselDraft = {
  title: "You need these 3 gym days",
  handle: "",
  look: "glow",
  slides: [
    { heading: "You don't need 6 gym days. You need these 3.", lines: [] },
    { heading: "Day A: squat + push", lines: ["Goblet squat 3×8", "Push-up 3×max", "10 min walk"] },
    { heading: "Day B: hinge + pull", lines: ["Romanian deadlift 3×8", "Dumbbell row 3×10"] },
    { heading: "Day C: carry + everything", lines: ["Farmer's carry 4×30 m", "Split squat 3×8", "Plank 3×30 s"] },
    { heading: "45 minutes. Then go home.", lines: ["Add a little weight each week.", "That's the whole trick."] },
    { heading: "Save this for Monday.", lines: ["Free 3-day plan in my group.", "Link in bio."] },
  ],
};

// ---------------------------------------------------------------------------
// No AI: a starter from a topic, and a script split into slides by rule

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "Write it for me" with no AI: a 5-slide starter around their topic, for them to make their own. */
export function starterSlides(topic: string): CarouselSlide[] {
  const t = cleanCoverText(topic, 40).replace(/[.!?]+$/, "") || "getting started";
  const lower = midSentence(t);
  return [
    { heading: `${cap(lower)}: 3 small steps that work`, lines: [] },
    {
      heading: "1. Start smaller than you think",
      // "Pick one fat loss habit", but never "Pick one getting strong in 3 gym sessions habit".
      lines: [!startsWithAction(lower) && lower.split(" ").length <= 3 ? `Pick one ${lower} habit you can do in 10 minutes.` : "Pick one habit you can do in 10 minutes."],
    },
    { heading: "2. Same days, same time", lines: ["Put it in your calendar.", "Then just turn up."] },
    { heading: "3. Write one number down", lines: ["Check it once a week.", "Small wins add up."] },
    { ...DEFAULT_CTA },
  ];
}

const HOOK_LABEL = /^(?:hook|opening|opener|intro|first line|line 1)$/i;
const CTA_LABEL = /^(?:cta|call to action|outro|close|closing|ending|door|end)$/i;
// Directions for the camera, not words for the slides.
const DIRECTION_LABEL = /^(?:shot|shots|b-?roll|visual|visuals|film|filming|camera|music|sound|audio|sfx|edit|editing|transition|setting|props?|location|notes?|length|duration|format|title|hashtags?|thumbnail|why it works|angle)$/i;
// Script labels that only say which part this is. Any other "Something: words" line stays whole
// ("Day A: squat + push" is a slide, not a label).
const PART_LABEL = /^(?:say|vo|voice ?over|voice|line|script|caption|on[- ]?screen(?: text)?|text|beat|point|step|tip|part|scene|turn|body|value|main|middle|setup|problem|solution|payoff|story|proof|reason|section)(?:\s*\d{1,2})?$/i;
const TIMESTAMP = /^[[(]?\s*\d{1,2}(?::\d{2})?\s*(?:s|sec|secs)?\s*(?:[-–—]|to)\s*\d{1,2}(?::\d{2})?\s*(?:s|sec|secs|seconds)?\s*[\])]?\s*[:\-–—.]?\s*/i;
const CTA_WORDS = /\b(?:link in (?:my )?bio|follow|save (?:this|it)|comment|join|dm me|subscribe|share this|free (?:plan|guide|checklist|group))\b/i;

type Unit = { text: string; tag: "hook" | "cta" | null };

/** The lines of a pasted script, with labels, timestamps, markdown and camera notes taken out. */
function scriptUnits(script: string): Unit[] {
  const out: Unit[] = [];
  let tag: Unit["tag"] = null;
  for (const raw of script.slice(0, CAROUSEL_LIMITS.script).split(/\r?\n/)) {
    let line = raw
      .replace(/\*\*|__|`/g, "")
      .replace(/^\s*(?:#{1,6}|>|[-*•–—]|\d+[.)])\s+/, "")
      .trim();
    if (!line) {
      // A blank line ends a hook (scripts put the hook on its own).
      if (tag === "hook") tag = null;
      continue;
    }
    // A whole line in brackets is a stage note: "(smile)", "[cut to the gym]".
    if (/^[[(].*[\])]$/.test(line)) continue;
    line = line.replace(TIMESTAMP, "").trim();
    const label = /^([A-Za-z][A-Za-z0-9 \-/']{0,28}?)\s*(?:\([^)]{0,20}\))?\s*[:：]\s*(.*)$/.exec(line);
    // "HOOK:" on its own line names the lines under it; "Hook: words" names only that line.
    let lineTag: Unit["tag"] = tag;
    if (label) {
      const name = label[1].trim();
      if (DIRECTION_LABEL.test(name)) {
        if (!label[2].trim()) tag = null;
        continue;
      }
      if (HOOK_LABEL.test(name) || CTA_LABEL.test(name) || PART_LABEL.test(name)) {
        lineTag = HOOK_LABEL.test(name) ? "hook" : CTA_LABEL.test(name) ? "cta" : null;
        line = label[2].trim();
        if (!line) {
          tag = lineTag;
          continue;
        }
        tag = null;
      } else tag = lineTag = null;
    }
    line = line.replace(/\[[^\]]{0,60}\]/g, " ").replace(/^["“”']+|["“”']+$/g, "").replace(/\s+/g, " ").trim();
    if (line.length < 2) continue;
    out.push({ text: line, tag: lineTag });
  }
  return out;
}

const sentences = (text: string) => text.split(/(?<=[.!?])\s+(?=["“A-Z0-9])/).map((s) => s.trim()).filter(Boolean);

/** Words cut into lines of at most `max` characters, on spaces. */
function chunk(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + " " + w).length > max) {
      out.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}

/** One idea as a slide: "Big words: the rest" splits there, a long sentence splits at its first comma. */
function ideaSlide(texts: string[]): CarouselSlide {
  const [first, ...rest] = texts;
  let heading = first;
  let lines: string[] = [];
  const colon = /^(.{3,50}?)\s*[:–—]\s+(.+)$/.exec(first);
  if (colon) {
    heading = colon[1];
    lines = [colon[2]];
  } else if (first.length > 64) {
    const comma = /^(.{15,64}?)[,;]\s+(.+)$/.exec(first);
    if (comma) {
      heading = comma[1];
      lines = [cap(comma[2])];
    } else {
      const parts = chunk(first, 56);
      heading = parts[0];
      lines = [parts.slice(1).join(" ")];
    }
  }
  lines = [...lines, ...rest].flatMap((l) => (l.length > CAROUSEL_LIMITS.line ? chunk(l, CAROUSEL_LIMITS.line) : [l]));
  return { heading, lines: lines.slice(0, CAROUSEL_LIMITS.lines) };
}

/**
 * "Turn my script into slides" with no AI: the hook first, one idea per slide (grouped when there are
 * many), and the script's own call to action last (or a friendly default). Never makes up words.
 */
export function scriptToSlides(script: unknown): { ok: true; slides: CarouselSlide[] } | { ok: false; error: string } {
  if (typeof script !== "string" || !script.trim()) return { ok: false, error: "Paste your script first." };
  const units = scriptUnits(script);
  const hookUnits = units.filter((u) => u.tag === "hook");
  const ctaUnits = units.filter((u) => u.tag === "cta");
  const body = units.filter((u) => u.tag === null).flatMap((u) => sentences(u.text));

  const hookText = hookUnits.length ? hookUnits.map((u) => u.text).join(" ") : (body.shift() ?? "");
  let cta: CarouselSlide;
  if (ctaUnits.length) {
    const s = ctaUnits.flatMap((u) => sentences(u.text));
    cta = { heading: s[0], lines: s.slice(1) };
  } else if (body.length > 2 && CTA_WORDS.test(body[body.length - 1])) {
    const last = body.pop()!;
    const s = sentences(last);
    cta = s.length > 1 ? { heading: s[0], lines: s.slice(1) } : { heading: "Save this for later.", lines: [last] };
  } else cta = { ...DEFAULT_CTA };

  if (!hookText || body.length < 2) {
    return { ok: false, error: "That script is a bit short for slides. Paste a few more lines, or press Write it for me." };
  }
  const maxIdeas = CAROUSEL_LIMITS.maxSlides - 2;
  const per = Math.ceil(body.length / maxIdeas);
  const ideas: CarouselSlide[] = [];
  for (let i = 0; i < body.length; i += per) ideas.push(ideaSlide(body.slice(i, i + per)));

  const hookParts = sentences(hookText);
  const hook = hookText.length <= CAROUSEL_LIMITS.heading ? { heading: hookText, lines: [] } : { heading: hookParts[0], lines: hookParts.slice(1, 2) };
  const res = cleanCarousel({ slides: [hook, ...ideas, cta] });
  return res.ok ? { ok: true, slides: res.carousel.slides } : { ok: false, error: res.error };
}
