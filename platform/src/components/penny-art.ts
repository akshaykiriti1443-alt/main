// Penny, the guide: an AI assistant, drawn as one. A calm violet orb with a spark at its centre,
// no face and no limbs, so she reads as the product's assistant, not a cartoon. Flat layers only
// (no gradients or ids), so any number of copies render safely on one page. The same art is used
// in the course pictures. Drawn on a 200x200 canvas; the orb is centred at (98, 90) so the cropped
// view (viewBox "22 14 152 152") frames it. Static, trusted markup.

const ORB = [
  '<circle cx="98" cy="90" r="72" fill="#7c5cff" opacity="0.10"/>',
  '<circle cx="98" cy="90" r="63" fill="none" stroke="#7c5cff" stroke-opacity="0.32" stroke-width="1.6"/>',
  '<circle cx="98" cy="90" r="54" fill="#4a22cf"/>',
  '<circle cx="92" cy="82" r="46" fill="#6a45f5"/>',
  '<circle cx="86" cy="74" r="32" fill="#8f73ff" opacity="0.75"/>',
  '<ellipse cx="80" cy="64" rx="15" ry="10" fill="#ffffff" opacity="0.28" transform="rotate(-30 80 64)"/>',
  '<circle cx="98" cy="90" r="54" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="1.5"/>',
  // the spark: a four-point star
  '<path d="M98 66 C100.5 82 104 87.5 122 90 C104 92.5 100.5 98 98 114 C95.5 98 92 92.5 74 90 C92 87.5 95.5 82 98 66 Z" fill="#ffffff"/>',
].join("");

const SMALL_SPARK = (x: number, y: number, s: number, fill: string) =>
  `<path d="M${x} ${y - s} C${x + s * 0.12} ${y - s * 0.3} ${x + s * 0.3} ${y - s * 0.12} ${x + s} ${y} C${x + s * 0.3} ${y + s * 0.12} ${x + s * 0.12} ${y + s * 0.3} ${x} ${y + s} C${x - s * 0.12} ${y + s * 0.3} ${x - s * 0.3} ${y + s * 0.12} ${x - s} ${y} C${x - s * 0.3} ${y - s * 0.12} ${x - s * 0.12} ${y - s * 0.3} ${x} ${y - s} Z" fill="${fill}"/>`;

/** Hello: the orb with two small sparks beside it. */
export const PENNY_WAVE = ORB + SMALL_SPARK(150, 38, 11, "#a58bff") + SMALL_SPARK(164, 62, 6, "#ff6fae");

/** Look here: the orb with a soft arrow pointing to the right. */
export const PENNY_POINT =
  ORB +
  '<path d="M156 90 H182 M172 79 L183 90 L172 101" fill="none" stroke="#6a45f5" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>';

/** Done: the orb with a green tick badge. */
export const PENNY_WINK =
  ORB +
  '<circle cx="140" cy="132" r="17" fill="#0fa67a"/><circle cx="140" cy="132" r="17" fill="none" stroke="#ffffff" stroke-width="3"/>' +
  '<path d="M132.5 132.5 L138 138 L148 127" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>';
