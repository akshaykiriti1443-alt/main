// Plain text for pictures drawn by code (the Skool cover, carousels). Pure: no server imports, so the
// browser-side editors can share the same limits.

/**
 * Plain text, safe to draw: tags, control characters and emoji out, spaces collapsed, then clamped
 * to `max` characters on a word boundary with an ellipsis. Anything that isn't a string becomes "".
 */
export function cleanCoverText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  let s = raw
    .slice(0, 2000)
    .replace(/<\/?[a-z!][^>]*>?/gi, " ") // tags, and a dangling "<img ..." at the end
    .replace(/[<>]/g, " ")
    .replace(/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/gi, " ") // entities stay as text in an image; drop them
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}‍️⃣]/gu, "")
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Bullets and dashes left at the start once the emoji are gone ("🚀 - Name" -> "Name").
  s = s.replace(/^[\s\-–—•·|:]+/, "").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  let head = (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, "");
  // Never end on a little word ("stuck in Silver and…").
  for (let i = 0; i < 3; i++) {
    const next = head.replace(/\s+(?:and|or|but|the|a|an|of|in|on|to|with|for|who|that|their|your|my)$/i, "").replace(/[\s,;:.\-–—]+$/, "");
    if (next === head || next.length < max * 0.4) break;
    head = next;
  }
  return `${head}…`;
}

/** The cover headline box's limit (the Prize in 4 to 8 words). */
export const COVER_HEADLINE_MAX = 40;
/** The cover's "FOR <WHO>" label, at most. */
export const COVER_WHO_MAX = 32;

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Little words a label or headline must never end on. */
const DANGLING = /\s+(?:and|or|but|the|a|an|of|in|on|to|with|for|who|that|their|your|my|at|by|from)$/i;

/**
 * "Busy dads over 35 who want to get strong without living in the gym" → "Busy dads over 35": the
 * label keeps the people, not the whole sentence. Cut at a word, never with "…" (it's a label).
 */
export function shortWho(raw: unknown, max: number = COVER_WHO_MAX): string {
  let s = cleanCoverText(raw, 300).replace(/^for\s+/i, "");
  if (s.length > 22) {
    const cut = s.search(/,|;|\s[-–—]\s|\s(?:who|that|which|looking|wanting|trying|with|without|and|so)\s/i);
    if (cut >= 6) s = s.slice(0, cut);
  }
  const words = s.split(" ").filter(Boolean);
  let out = "";
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > max) break;
    out = next;
  }
  if (!out && words[0]) out = words[0].slice(0, max);
  for (let i = 0; i < 3; i++) out = out.replace(DANGLING, "").replace(/[\s,;:.\-–—]+$/, "");
  return out;
}

/**
 * The Prize, short enough for the cover: "Get strong in 3 gym sessions a week, without living in the gym"
 * → "Get strong in 3 gym sessions a week". Cuts at the first clause, then at a word with "…".
 */
export function prizeHeadline(raw: unknown, max: number = COVER_HEADLINE_MAX): string {
  let s = cleanCoverText(raw, 300);
  if (s.length > max) {
    const cut = s.search(/,|;|:|\s[-–—]\s|\s(?:without|even if|so that|so you|and still|while|because)\s/i);
    if (cut >= 10) s = s.slice(0, cut);
  }
  s = s.replace(/[\s,;:\-–—]+$/, "");
  return capitalize(cleanCoverText(s, max));
}
