import type { AutomationAction, AutomationTrigger } from "@/lib/db/types";

// One-click automation starters. Each opens the builder pre-filled; the owner reviews and saves.
// Grouped so the Skool lifecycle flows (welcome -> convert -> save -> win back) sit together.

export type AutomationPreset = {
  key: string;
  title: string;
  body: string;
  group: "Leads" | "Skool members";
  def: { name: string; trigger: AutomationTrigger; actions: AutomationAction[] };
};

export const AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: "hot",
    title: "Hot lead alert",
    body: "Score every new message. If the lead is hot, tag it, draft a reply and email you.",
    group: "Leads",
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
    group: "Leads",
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
    group: "Leads",
    def: {
      name: "Warm-up new leads",
      trigger: { type: "lead_created", value: "" },
      actions: [{ type: "add_tag", tag: "new-lead" }, { type: "wait", minutes: 1440 }, { type: "set_stage", stage: "engaged" }],
    },
  },
  // --- Skool lifecycle ---
  {
    key: "skool-welcome",
    title: "Welcome a new member",
    body: "When someone becomes a paying member, email a warm welcome and remind you to send a personal DM.",
    group: "Skool members",
    def: {
      name: "Welcome a new Skool member",
      trigger: { type: "stage_changed", value: "member" },
      actions: [
        { type: "send_email", subject: "Welcome in, {{first_name}} 🎉", body: "Hey {{first_name}},\n\nWelcome to {{business_name}}! So glad you're here.\n\nStart with the Start Here lesson in the classroom today. Reply and tell me your #1 goal and I'll point you to the right place.\n\nSee you inside." },
        { type: "notify_owner", message: "New paid member. Open their lead and send a personal Skool welcome with the AI assist." },
      ],
    },
  },
  {
    key: "skool-convert",
    title: "Nudge a trial to upgrade",
    body: "A few days into a free trial, send a friendly nudge and prompt you to reach out personally.",
    group: "Skool members",
    def: {
      name: "Convert a Skool trial",
      trigger: { type: "stage_changed", value: "trial" },
      actions: [
        { type: "wait", minutes: 4320 }, // ~3 days into a 7-day trial
        { type: "send_email", subject: "How's your trial going, {{first_name}}?", body: "Hey {{first_name}},\n\nYou're a few days into your {{business_name}} trial. What's the one thing you want to sort out first? Reply here and I'll help.\n\nStaying on keeps everything you've started." },
        { type: "notify_owner", message: "A trial is mid-way. Open their lead and send a personal nudge with the AI assist." },
      ],
    },
  },
  {
    key: "skool-save",
    title: "Save a cancelling member",
    body: "The moment a member is marked cancelling, alert you to send a save message while they still have access.",
    group: "Skool members",
    def: {
      name: "Save a cancelling member",
      trigger: { type: "tag_added", value: "skool-cancelling" },
      actions: [
        { type: "notify_owner", message: "A member is cancelling but still has access. Open their lead and send a save message with the AI assist." },
        { type: "send_email", subject: "Did we miss something, {{first_name}}?", body: "Hey {{first_name}},\n\nI saw you cancelled, and that's okay. Quick question so I can do better: what made it not click?\n\nIf there's a way to make it right, I'm on it." },
      ],
    },
  },
  {
    key: "skool-winback",
    title: "Win back someone who left",
    body: "A day after a member churns, start a gentle win-back email and remind you to reach out.",
    group: "Skool members",
    def: {
      name: "Win back a churned member",
      trigger: { type: "stage_changed", value: "lost" },
      actions: [
        { type: "wait", minutes: 1440 },
        { type: "send_email", subject: "The door's still open, {{first_name}}", body: "Hey {{first_name}},\n\nIt's been a little while. We've kept building inside {{business_name}} and I think you'd like what's new.\n\nWant the link to jump back in? Just reply." },
        { type: "notify_owner", message: "A member churned yesterday. Open their lead and send a personal win-back with the AI assist." },
      ],
    },
  },
];

export const presetByKey = (key: string | undefined) => AUTOMATION_PRESETS.find((p) => p.key === key);
