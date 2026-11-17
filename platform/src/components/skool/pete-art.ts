// Pete, the guy doing it the hard way. Drawn as a clean, faceless avatar (the kind a product uses
// for "a person"), not a cartoon: a soft head-and-shoulders silhouette plus one prop per pose. Flat
// fills only, no ids, so many copies render safely on one page. The course pictures use the same
// art. Draw each pose in PETE_VIEWBOX. Static, trusted markup.

export const PETE_VIEWBOX = "-34 -44 268 236";

const BODY = [
  // soft backdrop disc
  '<circle cx="100" cy="92" r="96" fill="#8b84a8" opacity="0.10"/>',
  // shoulders
  '<path d="M34 188 C34 128 64 102 100 102 C136 102 166 128 166 188 Z" fill="#8b84a8"/>',
  // collar
  '<path d="M84 104 L100 124 L116 104" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  // head
  '<circle cx="100" cy="56" r="34" fill="#b4aecb"/>',
  '<ellipse cx="90" cy="44" rx="12" ry="8" fill="#ffffff" opacity="0.22" transform="rotate(-25 90 44)"/>',
].join("");

/** Posting, again: a phone in hand, and a little heart floating up. */
export const PETE_POSTING =
  BODY +
  '<rect x="128" y="104" width="34" height="58" rx="7" fill="#2b2545"/>' +
  '<rect x="132" y="110" width="26" height="42" rx="3" fill="#7c5cff" opacity="0.75"/>' +
  '<circle cx="145" cy="157" r="2" fill="#ffffff" opacity="0.6"/>' +
  '<path d="M178 64 C178 58 185 55 188 60 C191 55 198 58 198 64 C198 71 188 77 188 77 C188 77 178 71 178 64 Z" fill="#ff6fae"/>';

/** Shrugging at the numbers: a question in a speech bubble. */
export const PETE_SHRUG =
  BODY +
  '<path d="M148 -8 H204 A12 12 0 0 1 216 4 V36 A12 12 0 0 1 204 48 H170 L158 60 L160 48 H148 A12 12 0 0 1 136 36 V4 A12 12 0 0 1 148 -8 Z" fill="#ffffff" stroke="#d9d4ea" stroke-width="2"/>' +
  '<path d="M168 12 C168 4 184 4 184 12 C184 18 176 18 176 25" fill="none" stroke="#6a45f5" stroke-width="5" stroke-linecap="round"/>' +
  '<circle cx="176" cy="35" r="3.2" fill="#6a45f5"/>';

/** Saying hi: one hand up. */
export const PETE_WAVE =
  BODY +
  '<path d="M52 132 L30 70" fill="none" stroke="#8b84a8" stroke-width="20" stroke-linecap="round"/>' +
  '<circle cx="28" cy="60" r="13" fill="#b4aecb"/>';
