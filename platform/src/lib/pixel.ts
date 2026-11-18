/** Meta's Pixel (dataset) IDs are 15 or 16 digits. The Settings box checks the same range before saving. */
export const PIXEL_ID_DIGITS = { min: 15, max: 16 } as const;

/** Tidy what was pasted into the Pixel ID box, or say in plain words why it can't be a Pixel ID. */
export function cleanPixelId(raw: string): { ok: true; id: string } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: true, id: "" };
  if (/^act_/i.test(text)) {
    return { ok: false, error: "That's your ad account number (it starts with act_). Your Pixel ID is in Meta Events Manager: open your Pixel, go to Settings and copy the Dataset ID." };
  }
  if (/^EAA/i.test(text) || (text.length > 30 && /[a-z]/i.test(text))) {
    return { ok: false, error: "That looks like the access token. It goes in the second box. The first box takes the Dataset ID, which is a long number." };
  }
  // Copied numbers sometimes carry spaces or dashes.
  const digits = text.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) {
    return { ok: false, error: "The Pixel ID is numbers only, like 123456789012345. In Meta Events Manager, open your Pixel, go to Settings and copy the Dataset ID." };
  }
  if (digits.length < PIXEL_ID_DIGITS.min || digits.length > PIXEL_ID_DIGITS.max) {
    return {
      ok: false,
      error: `A Pixel ID is 15 or 16 digits long, like 123456789012345. You pasted ${digits.length}, so a digit may be missing or extra. Copy the Dataset ID again from your Pixel's Settings tab.`,
    };
  }
  return { ok: true, id: digits };
}
