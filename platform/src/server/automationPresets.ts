import type { AutomationAction, AutomationTrigger } from "@/lib/db/types";

// One-click automation starters. Each opens the builder pre-filled; the owner reviews and saves.

export type AutomationPreset = {
  key: string;
  title: string;
  body: string;
  def: { name: string; trigger: AutomationTrigger; actions: AutomationAction[] };
};

export const AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: "hot",
    title: "Hot lead alert",
    body: "Score every new message. If the lead is hot, tag it, draft a reply and email you.",
    def: {
      name: "Hot lead alert",
      trigger: { type: "message_received", value: "" },
      actions: [
        { type: "ai_score" },
        { type: "only_if_temperature", temperature: "hot" },
        { type: "add_tag", tag: "hot-lead" },
        { type: "ai_draft_reply" },
        { type: "notify_owner", message: "A hot lead just messaged you. Your AI reply draft is ready." },
      ],
    },
  },
  {
    key: "welcome-dm",
    title: "Instant DM reply",
    body: "Reply to new DMs within seconds with your free guide.",
    def: {
      name: "Instant DM reply",
      trigger: { type: "message_received", value: "instagram" },
      actions: [{ type: "send_message", body: "Hey {{first_name}}! Thanks for the message. Here's my free guide to get you started: [paste your funnel link]. What's your #1 goal right now?" }],
    },
  },
  {
    key: "nurture",
    title: "Warm-up new leads",
    body: "Tag new leads, wait a day, then move them to Engaged.",
    def: {
      name: "Warm-up new leads",
      trigger: { type: "lead_created", value: "" },
      actions: [{ type: "add_tag", tag: "new-lead" }, { type: "wait", minutes: 1440 }, { type: "set_stage", stage: "engaged" }],
    },
  },
];

export const presetByKey = (key: string | undefined) => AUTOMATION_PRESETS.find((p) => p.key === key);
