import { z } from "zod";

// ---------------------------------------------------------------------------
// Page builder content. Every page is an ordered list of typed sections.
// ---------------------------------------------------------------------------

const str = (max = 2000) => z.string().max(max).default("");

export const sectionSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal("hero"),
    eyebrow: str(120),
    headline: str(200),
    subheadline: str(500),
    bullets: z.array(z.string().max(200)).max(8).default([]),
    ctaText: str(60),
    formTitle: str(120),
    showForm: z.boolean().default(true),
    imageUrl: str(1000),
  }),
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal("benefits"),
    title: str(200),
    items: z.array(z.object({ title: str(120), body: str(600) })).max(12).default([]),
  }),
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal("steps"),
    title: str(200),
    items: z.array(z.object({ title: str(120), body: str(600) })).max(12).default([]),
  }),
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal("text"),
    title: str(200),
    body: str(6000),
  }),
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal("faq"),
    title: str(200),
    items: z.array(z.object({ q: str(300), a: str(1500) })).max(20).default([]),
  }),
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal("cta"),
    headline: str(200),
    body: str(1000),
    buttonText: str(60),
    buttonUrl: str(1000),
  }),
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal("form"),
    title: str(200),
    body: str(600),
    buttonText: str(60),
    collectPhone: z.boolean().default(false),
  }),
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal("video"),
    title: str(200),
    url: str(1000),
  }),
]);

export type Section = z.infer<typeof sectionSchema>;
export type SectionType = Section["type"];
export const pageContentSchema = z.object({ sections: z.array(sectionSchema).max(40) });
export type PageContent = z.infer<typeof pageContentSchema>;

export const siteThemeSchema = z.object({
  style: z.enum(["bold", "clean", "dark"]).default("bold"),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#2A44EE"),
  font: z.enum(["sans", "serif", "rounded"]).default("sans"),
});
export type SiteTheme = z.infer<typeof siteThemeSchema>;

// ---------------------------------------------------------------------------
// Workspace + agency settings
// ---------------------------------------------------------------------------

export type WorkspaceSettings = {
  businessName?: string;
  niche?: string;
  audience?: string;
  offer?: string;
  skoolUrl?: string;
  mailingAddress?: string;
  replyToEmail?: string;
  timezone?: string;
  metaPixelId?: string;
  metaCapiTokenEnc?: string;
  metaTestEventCode?: string;
  launchKitId?: string;
};

export type BrandSettings = {
  name?: string;
  logoUrl?: string;
  color?: string;
  supportEmail?: string;
};

export type CampaignAudience = {
  tags?: string[];
  temperatures?: ("hot" | "warm" | "cold")[];
  stages?: ("new" | "engaged" | "trial" | "member" | "lost")[];
};

// ---------------------------------------------------------------------------
// Automations: one trigger, then an ordered list of actions.
// ---------------------------------------------------------------------------

export const automationTriggerSchema = z.object({
  type: z.enum(["lead_created", "message_received", "tag_added", "temperature_changed", "stage_changed"]),
  // Optional filter: a site id for lead_created, a tag for tag_added, a channel for
  // message_received, a temperature for temperature_changed, a stage for stage_changed.
  value: z.string().max(200).default(""),
});
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;

export const automationActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_tag"), tag: z.string().min(1).max(60) }),
  z.object({ type: z.literal("remove_tag"), tag: z.string().min(1).max(60) }),
  z.object({ type: z.literal("set_stage"), stage: z.enum(["new", "engaged", "trial", "member", "lost"]) }),
  z.object({ type: z.literal("wait"), minutes: z.number().int().min(1).max(60 * 24 * 60) }),
  z.object({ type: z.literal("send_email"), subject: z.string().min(1).max(200), body: z.string().min(1).max(20000) }),
  z.object({ type: z.literal("enroll_sequence"), sequenceId: z.string().uuid() }),
  z.object({ type: z.literal("notify_owner"), message: z.string().min(1).max(1000) }),
  z.object({ type: z.literal("ai_score") }),
  z.object({ type: z.literal("ai_draft_reply") }),
  z.object({ type: z.literal("send_message"), body: z.string().min(1).max(2000) }),
  z.object({ type: z.literal("webhook"), url: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Use an https:// URL") }),
  z.object({ type: z.literal("only_if_temperature"), temperature: z.enum(["hot", "warm", "cold"]) }),
]);
export type AutomationAction = z.infer<typeof automationActionSchema>;

// ---------------------------------------------------------------------------
// Templates ("snapshots"): a portable copy of a workspace's funnels and flows.
// ---------------------------------------------------------------------------

export type TemplateData = {
  sites: {
    name: string;
    theme: SiteTheme;
    skoolUrl: string;
    leadMagnetName: string;
    leadMagnetUrl: string;
    pages: { slug: string; title: string; kind: "optin" | "thankyou" | "sales" | "custom"; content: PageContent }[];
  }[];
  sequences: {
    name: string;
    trigger: "lead_created" | "tag_added" | "manual";
    triggerValue: string;
    steps: { position: number; delayMinutes: number; subject: string; body: string }[];
  }[];
  automations: { name: string; trigger: AutomationTrigger; actions: AutomationAction[] }[];
};
