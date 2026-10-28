import type { WorkspacePlan } from "@/lib/db/schema";

// What each tier includes. Usage above the included amount is billed from the wallet.
export type Feature =
  | "sites"
  | "leads"
  | "sequences"
  | "launch_kit"
  | "inbox"
  | "automations"
  | "campaigns"
  | "social"
  | "ai_scoring"
  | "whatsapp"
  | "sms"
  | "custom_domains";

export const PLANS: Record<
  WorkspacePlan,
  { label: string; priceNote: string; features: Feature[]; maxSites: number; included: Record<string, number> }
> = {
  starter: {
    label: "Member",
    priceNote: "Included with your Skool membership",
    features: ["sites", "leads", "sequences", "launch_kit"],
    maxSites: 2,
    included: { ai_generation: 3, email: 1000, ai_assist: 50 },
  },
  growth: {
    label: "Growth",
    priceNote: "Monthly plan + pay as you go",
    features: [
      "sites",
      "leads",
      "sequences",
      "launch_kit",
      "inbox",
      "automations",
      "campaigns",
      "social",
      "ai_scoring",
      "whatsapp",
      "sms",
      "custom_domains",
    ],
    maxSites: 25,
    included: { ai_generation: 30, email: 10000, ai_assist: 2000 },
  },
};

export function hasFeature(plan: WorkspacePlan, feature: Feature): boolean {
  return PLANS[plan].features.includes(feature);
}

export class FeatureLockedError extends Error {
  constructor(public feature: Feature) {
    super(`This feature needs the Growth plan (${feature}).`);
  }
}

export function requireFeature(plan: WorkspacePlan, feature: Feature) {
  if (!hasFeature(plan, feature)) throw new FeatureLockedError(feature);
}
