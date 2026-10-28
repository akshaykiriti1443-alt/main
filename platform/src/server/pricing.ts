// Pay-as-you-go list prices. All amounts are micro-dollars (1 USD = 1,000,000).
// "cost" is what the platform roughly pays the provider; "price" is what the
// customer pays. Tune these to your real provider bills before launch.

export type UsageUnit =
  | "ai_generation"
  | "ai_assist"
  | "email"
  | "sms_segment"
  | "whatsapp_template"
  | "phone_number_month";

export const UNIT_PRICES: Record<UsageUnit, { label: string; costMicros: number; priceMicros: number }> = {
  ai_generation: { label: "AI launch kit or page generation", costMicros: 200_000, priceMicros: 500_000 },
  ai_assist: { label: "AI lead score or reply draft", costMicros: 15_000, priceMicros: 30_000 },
  email: { label: "Email sent", costMicros: 1_000, priceMicros: 2_000 },
  sms_segment: { label: "SMS segment", costMicros: 10_000, priceMicros: 20_000 },
  whatsapp_template: { label: "WhatsApp template message", costMicros: 30_000, priceMicros: 45_000 },
  phone_number_month: { label: "Phone number (monthly)", costMicros: 1_150_000, priceMicros: 2_500_000 },
};

export const TOPUP_OPTIONS_USD = [10, 25, 50, 100];

// Anthropic list prices for the default model, used to record real AI cost.
// Opus 5.5: $4 / 1M input tokens, $20 / 1M output tokens.
export function aiCostMicros(inputTokens: number, outputTokens: number): number {
  return Math.round(inputTokens * 4 + outputTokens * 20);
}

export function resalePrice(priceMicros: number, markupPercent: number): number {
  return Math.round(priceMicros * (1 + markupPercent / 100));
}
