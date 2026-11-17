import { cleanPrice } from "@/server/ai/launchKit";

/** The launch kit form's boxes and how long each may be. On an error they ride back in the address, so nothing typed is lost. */
export const KIT_FIELDS = [
  ["businessName", 80],
  ["ownerName", 60],
  ["niche", 160],
  ["audience", 200],
  ["outcome", 200],
  ["leadMagnetIdea", 200],
  ["price", 20],
  ["trialDays", 3],
  ["skoolUrl", 300],
  ["tone", 10],
  ["brandColor", 7],
] as const;
export type KitField = (typeof KIT_FIELDS)[number][0];

/** The free-trial choices, in the order the form shows them. 0 is no free trial. */
export const TRIAL_CHOICES = [7, 14, 30, 3, 0] as const;
export const DEFAULT_TRIAL_DAYS = 7;

export type KitDeal = { ok: true; price: string; trialDays: number } | { ok: false; error: string };

/** Price and free trial are required: the thank-you page states both, and how to cancel. */
export function readDeal(priceRaw: string, trialRaw: string): KitDeal {
  const price = cleanPrice(priceRaw);
  if (!price) return { ok: false, error: "Type what you'll charge a month, like 29. Your thank-you page says it right above the Join button." };
  const t = trialRaw.trim();
  if (!/^\d{1,2}$/.test(t) || Number(t) > 90) return { ok: false, error: "Pick how long your free trial is, or No free trial." };
  return { ok: true, price, trialDays: Number(t) };
}
